import puppeteer from 'puppeteer';
import config from '../config/config.js';
import logger from './utils/logger.js';

/**
 * Launches headless Puppeteer, navigates to TUF SDE Sheet,
 * reads all problems and their check states, and returns
 * the next 3 unchecked problems.
 */
async function getTodaysProblems() {
  logger.info('Launching Puppeteer to scrape TUF SDE Sheet', { module: 'sdeSheetScraper' });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
    // Isolated profile — does NOT use your real Chrome/Brave profile
    userDataDir: './puppeteer-data',
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Suppress noisy Puppeteer console output from TUF's React bundle
    page.on('console', () => {});

    logger.info('Navigating to TUF SDE Sheet...', { module: 'sdeSheetScraper' });
    await page.goto(config.tuf.url, {
      waitUntil: 'networkidle2',
      timeout: 60_000,
    });

    // Wait until the problem table rows are rendered by React
    // NOTE: If TUF changes their DOM, update this selector via debugLocalStorage()
    await page.waitForSelector('table tbody tr', { timeout: 30_000 });

    // Give React a moment to fully render checkbox states
    await new Promise((r) => setTimeout(r, 2000));

    // ── Step 1: Extract all problems from the DOM ──────────────────────────
    const allProblems = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const problems = [];

      rows.forEach((row, index) => {
        // Checkbox — TUF typically uses an input[type="checkbox"]
        // If they use a custom div/span, update this selector
        const checkbox = row.querySelector('input[type="checkbox"]');

        // Problem name — typically the first anchor in the row, or a td's text
        const nameAnchor =
          row.querySelector('td:nth-child(3) a') ||
          row.querySelector('td:nth-child(2) a') ||
          row.querySelector('a[href*="takeuforward"]');

        const nameText = nameAnchor?.textContent?.trim() || '';

        // Difficulty label (look for a badge or span with difficulty text)
        const difficultyEl =
          row.querySelector('.difficulty') ||
          row.querySelector('[class*="difficulty"]') ||
          row.querySelector('td:nth-child(5)');

        // LeetCode link
        const leetcodeLink = row.querySelector('a[href*="leetcode.com"]');

        // Row-level ID (TUF sometimes sets data-id on each row)
        const rowId =
          row.dataset?.id ||
          row.id ||
          nameAnchor?.href?.split('/').filter(Boolean).pop() ||
          `problem-${index}`;

        if (nameText) {
          problems.push({
            index,
            id: rowId,
            name: nameText,
            checked: checkbox ? checkbox.checked : false,
            difficulty: difficultyEl?.textContent?.trim() || 'Unknown',
            leetcodeUrl: leetcodeLink?.href || 'N/A',
          });
        }
      });

      return problems;
    });

    logger.info(`Extracted ${allProblems.length} problems from TUF DOM`, {
      module: 'sdeSheetScraper',
    });

    // ── Step 2: Read localStorage ──────────────────────────────────────────
    const storage = await page.evaluate(() => {
      const result = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        result[key] = window.localStorage.getItem(key);
      }
      return result;
    });

    logger.info(`Read ${Object.keys(storage).length} localStorage entries`, {
      module: 'sdeSheetScraper',
    });

    // ── Step 3: Determine which problems are checked ───────────────────────
    // IMPORTANT: The exact key format depends on TUF's implementation.
    // After running debugLocalStorage() (Section 9), update this filter.
    // Common TUF patterns:
    //   Key = problem ID string, Value = "true"
    //   Key = "checked_<id>",    Value = "true"
    //   Key = row index string,  Value = "true"
    const checkedSet = new Set(
      Object.keys(storage).filter(
        (k) => storage[k] === 'true' || storage[k] === '1' || storage[k] === 'checked'
      )
    );

    logger.info(`Found ${checkedSet.size} checked problem entries in localStorage`, {
      module: 'sdeSheetScraper',
    });

    // ── Step 4: Filter unchecked problems ─────────────────────────────────
    const unchecked = allProblems.filter((p) => {
      const checkedInDOM = p.checked;
      // Cross-check: does any localStorage key reference this problem's ID or index?
      const checkedInStorage =
        checkedSet.has(p.id) ||
        checkedSet.has(String(p.index)) ||
        [...checkedSet].some((k) => k.includes(p.id));
      return !checkedInDOM && !checkedInStorage;
    });

    logger.info(
      `Found ${unchecked.length} unchecked problems. Selecting first 3.`,
      { module: 'sdeSheetScraper' }
    );

    const todaysProblems = unchecked.slice(0, 3);

    if (todaysProblems.length === 0) {
      logger.warn('No unchecked problems found. Has the challenge been completed?', {
        module: 'sdeSheetScraper',
      });
    } else {
      logger.info(
        "Today's problems: " + todaysProblems.map((p) => p.name).join(', '),
        { module: 'sdeSheetScraper' }
      );
    }

    return todaysProblems;
  } finally {
    await browser.close();
  }
}

/**
 * DIAGNOSTIC FUNCTION — run once manually before going live.
 * Opens a visible Chrome window on TUF. Check a couple of problems
 * manually, then look at the console output to see the localStorage key format.
 *
 * Usage:
 *   node -e "import('./src/sdeSheetScraper.js').then(m => m.debugLocalStorage())"
 */
async function debugLocalStorage() {
  console.log('Opening TUF SDE Sheet in visible browser for inspection...');
  console.log('Check 2-3 problems manually, then observe the console output below.\n');

  const browser = await puppeteer.launch({
    headless: false,      // VISIBLE browser for manual interaction
    devtools: true,       // Opens DevTools automatically
    userDataDir: './puppeteer-data-debug',
  });

  const page = await browser.newPage();
  await page.goto(config.tuf.url, { waitUntil: 'networkidle2' });

  // Poll localStorage every 3 seconds and print changes
  let lastSnapshot = {};
  const interval = setInterval(async () => {
    const current = await page.evaluate(() => {
      const result = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        result[k] = window.localStorage.getItem(k);
      }
      return result;
    });

    // Show only keys that changed since last poll
    for (const [k, v] of Object.entries(current)) {
      if (lastSnapshot[k] !== v) {
        console.log(`[localStorage change] KEY: "${k}"  VALUE: "${v}"`);
      }
    }
    lastSnapshot = current;
  }, 3000);

  // Keep browser open for 5 minutes for manual exploration
  await new Promise((r) => setTimeout(r, 5 * 60 * 1000));
  clearInterval(interval);
  await browser.close();

  console.log('\nFull localStorage snapshot:');
  console.log(JSON.stringify(lastSnapshot, null, 2));
}

export { getTodaysProblems, debugLocalStorage };