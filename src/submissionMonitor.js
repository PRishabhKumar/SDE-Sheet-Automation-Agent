import puppeteer from 'puppeteer';
import { EventEmitter } from 'events';
import config from '../config/config.js';
import logger from './utils/logger.js';
import { readState, writeState } from './utils/stateManager.js';

const monitorEmitter = new EventEmitter();
let pollingTimer = null;

/**
 * Checks the TUF SDE Sheet localStorage to see if all 3 of today's
 * assigned problems are now marked as checked.
 *
 * @param {string[]} todayProblemIds  - IDs of today's 3 problems
 * @returns {boolean}
 */
async function checkIfCompleted(todayProblemIds) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    userDataDir: './puppeteer-data',
  });

  try {
    const page = await browser.newPage();
    page.on('console', () => {}); // Suppress TUF React logs

    await page.goto(config.tuf.url, {
      waitUntil: 'networkidle2',
      timeout: 60_000,
    });
    await page.waitForSelector('table tbody tr', { timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 1500));

    const storage = await page.evaluate(() => {
      const result = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        result[k] = window.localStorage.getItem(k);
      }
      return result;
    });

    const checkedSet = new Set(
      Object.keys(storage).filter(
        (k) => storage[k] === 'true' || storage[k] === '1' || storage[k] === 'checked'
      )
    );

    const completedCount = todayProblemIds.filter(
      (id) =>
        checkedSet.has(id) ||
        [...checkedSet].some((k) => k.includes(id))
    ).length;

    logger.info(
      `Submission check: ${completedCount}/${todayProblemIds.length} problems done`,
      { module: 'submissionMonitor' }
    );

    return completedCount === todayProblemIds.length;
  } finally {
    await browser.close();
  }
}

/**
 * Starts the polling loop. Reads today's problem IDs from state.json
 * and polls TUF every N minutes until all 3 are checked.
 */
async function startMonitoring() {
  const state = await readState();

  // Guard: don't re-monitor if already completed today
  if (state.submissionDetected) {
    logger.info('Submission already detected today — monitor skipped', {
      module: 'submissionMonitor',
    });
    return;
  }

  // Guard: need today's problem IDs to know what to look for
  if (!state.todayProblems || state.todayProblems.length === 0) {
    logger.warn('No todayProblems in state — cannot start monitor', {
      module: 'submissionMonitor',
    });
    return;
  }

  const todayProblemIds = state.todayProblems.map((p) => p.id);
  const intervalMs = config.agent.pollIntervalMinutes * 60 * 1000;

  logger.info(
    `Submission monitor started. Polling every ${config.agent.pollIntervalMinutes} minutes.`,
    { module: 'submissionMonitor', watching: todayProblemIds }
  );

  // Run an immediate check, then set up the interval
  const runCheck = async () => {
    try {
      const currentState = await readState();
      if (currentState.submissionDetected) {
        stopMonitoring();
        return;
      }

      const done = await checkIfCompleted(todayProblemIds);

      if (done) {
        logger.info('🎉 All 3 problems completed! Triggering completion workflow.', {
          module: 'submissionMonitor',
        });
        await writeState({ submissionDetected: true });
        stopMonitoring();
        monitorEmitter.emit('submission_complete', currentState.currentDay);
      }
    } catch (err) {
      // Don't crash the polling loop on transient errors (network, Puppeteer)
      logger.error('Poll error (will retry next tick)', {
        module: 'submissionMonitor',
        error: err.message,
      });
    }
  };

  await runCheck(); // Immediate first check

  if (!pollingTimer) {
    pollingTimer = setInterval(runCheck, intervalMs);
  }
}

function stopMonitoring() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    logger.info('Submission monitor stopped', { module: 'submissionMonitor' });
  }
}

export { startMonitoring, stopMonitoring, monitorEmitter };