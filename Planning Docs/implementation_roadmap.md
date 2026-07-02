# SDE Sheet Challenge Automation Agent
## Implementation Guide

**Version:** 1.0
**Author:** Rishabh Kumar
**Date:** June 2026

---

## Table of Contents

1. Prerequisites & Environment Setup
2. Project Initialization
3. Configuration Files
4. Utility Modules
5. Core Module Implementations
6. Main Orchestrator
7. LinkedIn OAuth (One-Time Setup)
8. Windows Service Deployment
9. Critical First-Run: TUF LocalStorage Inspection
10. Initial Setup Checklist
11. Debugging & Troubleshooting

---

## 1. Prerequisites & Environment Setup

### 1.1 Required Software

Install the following before writing any code:

| Software | Minimum Version | Where to Install |
|----------|----------------|-----------------|
| Node.js | 20.x LTS | https://nodejs.org (choose LTS) |
| Git | 2.x | Already installed (VS Code uses it) |
| Visual Studio Code | Any | Already installed |

Verify all three are available in PowerShell:
```powershell
node --version    # must output v20.x.x
npm --version     # must output 10.x.x or higher
git --version     # must output git version 2.x.x
```

### 1.2 API Access Setup (Complete Before Coding)

**Anthropic API Key:**
1. Go to https://console.anthropic.com
2. Settings → API Keys → Create Key
3. Copy the key — you will paste it into `.env` later

**LinkedIn Developer App:**
1. Go to https://www.linkedin.com/developers/apps
2. Click "Create App"
3. Fill: App name = "SDE Sheet Agent", Company = your profile, Logo = any image
4. Under "Auth" tab: add redirect URL `http://localhost:3000/callback`
5. Under "Products" tab: request access to "Share on LinkedIn" (gives `w_member_social`)
6. Copy **Client ID** and **Client Secret** from Auth tab

**GitHub SSH Key (if not already done):**
```powershell
# Check if SSH key exists
ls ~/.ssh/id_ed25519.pub

# If not, generate one
ssh-keygen -t ed25519 -C "your_email@example.com"

# Add to GitHub: copy this output and paste at github.com/settings/keys
cat ~/.ssh/id_ed25519.pub

# Test the connection
ssh -T git@github.com
# Should output: "Hi PRishabhKumar! You've successfully authenticated..."
```

Ensure the SDE Sheet directory is already a git repo with a remote configured:
```powershell
cd "D:\RISHABH\Code Playground\DSA\SDE SHEET CHALLENGE"
git remote -v
# Should show: origin  git@github.com:PRishabhKumar/... (fetch) and (push)
```

---

## 2. Project Initialization

### 2.1 Create Project Directory

```powershell
mkdir "D:\RISHABH\Tools\sde-agent"
cd "D:\RISHABH\Tools\sde-agent"
```

### 2.2 Initialize and Install All Dependencies

```powershell
# Initialize the Node.js project (accept all defaults)
npm init -y

# Configure package.json to use ES modules
npm pkg set type="module"

# Install all runtime dependencies in one command
npm install node-cron puppeteer simple-git @anthropic-ai/sdk dotenv winston node-notifier systray-v2 axios

# Install node-windows globally (used once for service installation)
npm install -g node-windows
```

> **Note on Puppeteer:** `npm install puppeteer` automatically downloads a compatible Chromium binary (~170MB) into `node_modules/puppeteer/.local-chromium`. This is the headless browser used for TUF scraping. Do not separately install Chrome; Puppeteer manages its own binary.

### 2.3 Create the Full Directory Structure

Run this entire block in PowerShell:
```powershell
mkdir src
mkdir src\utils
mkdir config
mkdir logs
mkdir assets
mkdir templates

# Create all files as empty placeholders
New-Item -ItemType File src\scheduler.js
New-Item -ItemType File src\folderManager.js
New-Item -ItemType File src\sdeSheetScraper.js
New-Item -ItemType File src\fileCreator.js
New-Item -ItemType File src\submissionMonitor.js
New-Item -ItemType File src\gitAutomation.js
New-Item -ItemType File src\linkedinPost.js
New-Item -ItemType File src\linkedinAuth.js
New-Item -ItemType File src\systemTray.js
New-Item -ItemType File src\utils\logger.js
New-Item -ItemType File src\utils\notifier.js
New-Item -ItemType File src\utils\unicodeBold.js
New-Item -ItemType File src\utils\stateManager.js
New-Item -ItemType File config\config.js
New-Item -ItemType File main.js
New-Item -ItemType File install-service.js
New-Item -ItemType File state.json
New-Item -ItemType File .env
New-Item -ItemType File .gitignore

# Seed state.json with an empty object
Set-Content state.json '{}'
```

### 2.4 Create `.gitignore`

This prevents secrets and build artifacts from being committed if this agent directory is ever tracked:
```
node_modules/
.env
logs/
state.json
puppeteer-data/
assets/
~/.sde-agent/
```

---

## 3. Configuration Files

### 3.1 `.env` File

Open `.env` in VS Code and fill in all values:

```env
# ── PATHS ─────────────────────────────────────────────────────────────────
SDE_SHEET_PATH=D:\RISHABH\Code Playground\DSA\SDE SHEET CHALLENGE
IMAGES_PATH=D:\RISHABH\Code Playground\DSA\SDE SHEET CHALLENGE\images

# ── TUF SDE SHEET ─────────────────────────────────────────────────────────
TUF_SHEET_URL=https://takeuforward.org/strivers-sde-sheet-top-coding-interview-problems/

# ── ANTHROPIC ─────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── LINKEDIN ──────────────────────────────────────────────────────────────
LINKEDIN_CLIENT_ID=your_linkedin_client_id_here
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret_here
LINKEDIN_REDIRECT_URI=http://localhost:3000/callback

# ── GIT ───────────────────────────────────────────────────────────────────
GIT_REMOTE=origin
GIT_BRANCH=main

# ── AGENT SETTINGS ────────────────────────────────────────────────────────
POLL_INTERVAL_MINUTES=5
MAX_GIT_RETRIES=3
```

### 3.2 `config/config.js`

This centralizes all configuration and exposes it as a typed object throughout the codebase:

```javascript
import 'dotenv/config';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  paths: {
    sdeSheet: process.env.SDE_SHEET_PATH,
    images: process.env.IMAGES_PATH,
  },

  tuf: {
    url: process.env.TUF_SHEET_URL,
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-6',
  },

  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    redirectUri: process.env.LINKEDIN_REDIRECT_URI,
    // Token stored in user's home directory (not inside project, not git-tracked)
    tokenPath: path.join(os.homedir(), '.sde-agent', 'linkedin_tokens.json'),
  },

  git: {
    remote: process.env.GIT_REMOTE || 'origin',
    branch: process.env.GIT_BRANCH || 'main',
    maxRetries: parseInt(process.env.MAX_GIT_RETRIES, 10) || 3,
  },

  agent: {
    pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES, 10) || 5,
    timezone: 'Asia/Kolkata',
  },

  state: {
    path: path.join(__dirname, '..', 'state.json'),
  },
};
```

---

## 4. Utility Modules

### 4.1 `src/utils/logger.js`

All modules import this instead of using `console.log`. Every log entry is timestamped and tagged with the calling module's name.

```javascript
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.json()
  ),
  transports: [
    // File transport: logs everything to disk
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/agent.log'),
      maxsize: 5 * 1024 * 1024,  // 5MB max per file
      maxFiles: 30,               // Keep 30 rotated log files
      tailable: true,             // Always write to the same filename
    }),
    // Console transport: pretty-printed for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ level, message, timestamp, module: mod, ...rest }) => {
            const extras = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
            return `${timestamp} [${mod || 'main'}] ${level}: ${message}${extras}`;
          }
        )
      ),
    }),
  ],
});

export default logger;
```

### 4.2 `src/utils/stateManager.js`

Every module reads/writes `state.json` through this utility to ensure consistency.

```javascript
import { promises as fs } from 'fs';
import config from '../../config/config.js';

const DEFAULT_STATE = {
  currentDay: 0,
  foldersCreated: false,
  todayProblems: [],
  filesCreated: false,
  submissionDetected: false,
  gitPushed: false,
  linkedinPosted: false,
  lastUpdated: null,
};

async function readState() {
  try {
    const raw = await fs.readFile(config.state.path, 'utf-8');
    const parsed = JSON.parse(raw);
    // Merge with defaults so missing keys are always present
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(updates) {
  const current = await readState();
  const next = {
    ...current,
    ...updates,
    lastUpdated: new Date().toISOString(),
  };
  await fs.writeFile(config.state.path, JSON.stringify(next, null, 2));
  return next;
}

async function resetDailyState(newDay) {
  // Called at midnight before creating folders
  return writeState({
    currentDay: newDay,
    foldersCreated: false,
    todayProblems: [],
    filesCreated: false,
    submissionDetected: false,
    gitPushed: false,
    linkedinPosted: false,
  });
}

export { readState, writeState, resetDailyState };
```

### 4.3 `src/utils/notifier.js`

Wraps `node-notifier` with a consistent icon and sound.

```javascript
import notifier from 'node-notifier';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function notify(title, message) {
  return new Promise((resolve) => {
    notifier.notify(
      {
        title,
        message,
        icon: path.join(__dirname, '../../assets/icon.png'),
        sound: true,
        // 'wait: true' blocks until user interacts; use false for info-only toasts
        wait: false,
      },
      (err, response) => {
        resolve(response);
      }
    );
  });
}

// Blocking notification with a clickable action (for LinkedIn confirm step)
function notifyWithConfirm(title, message) {
  return new Promise((resolve) => {
    notifier.notify(
      {
        title,
        message,
        icon: path.join(__dirname, '../../assets/icon.png'),
        sound: true,
        wait: true,          // Block until user clicks
        actions: 'Confirm',  // Windows: adds a clickable button
      },
      (err, response, metadata) => {
        // response will be 'activate' if user clicked the notification
        resolve(response === 'activate' || response === 'Confirm');
      }
    );
  });
}

export { notify, notifyWithConfirm };
```

### 4.4 `src/utils/unicodeBold.js`

Converts normal ASCII text to Unicode Mathematical Bold Sans-Serif — the font style visible in the provided LinkedIn post template example.

```javascript
// Unicode Mathematical Bold Sans-Serif character ranges:
// Uppercase A-Z: U+1D5D4 to U+1D5ED  (decimal: 120276 to 120301)
// Lowercase a-z: U+1D5EE to U+1D607  (decimal: 120302 to 120327)
// Digits 0-9:    U+1D7EC to U+1D7F5  (decimal: 120812 to 120821)

const BOLD_MAP = new Map();

// Build A-Z map
for (let i = 0; i < 26; i++) {
  BOLD_MAP.set(String.fromCharCode(65 + i), String.fromCodePoint(0x1D5D4 + i));
}

// Build a-z map
for (let i = 0; i < 26; i++) {
  BOLD_MAP.set(String.fromCharCode(97 + i), String.fromCodePoint(0x1D5EE + i));
}

// Build 0-9 map
for (let i = 0; i < 10; i++) {
  BOLD_MAP.set(String.fromCharCode(48 + i), String.fromCodePoint(0x1D7EC + i));
}

/**
 * Converts an ASCII string to Unicode Bold Sans-Serif.
 * Non-ASCII characters (spaces, hyphens, parentheses) are preserved as-is.
 *
 * Example: toBold("M Coloring Problem") → "𝗠 𝗖𝗼𝗹𝗼𝗿𝗶𝗻𝗴 𝗣𝗿𝗼𝗯𝗹𝗲𝗺"
 */
function toBold(str) {
  return str
    .split('')
    .map((char) => BOLD_MAP.get(char) ?? char)
    .join('');
}

export { toBold };
```

---

## 5. Core Module Implementations

### 5.1 `src/folderManager.js`

```javascript
import { promises as fs } from 'fs';
import path from 'path';
import config from '../config/config.js';
import logger from './utils/logger.js';
import { writeState } from './utils/stateManager.js';
import { notify } from './utils/notifier.js';

/**
 * Scans a directory for "Day N" folders and returns the highest N found.
 * Returns 0 if no Day folders exist yet.
 */
async function getHighestDayNumber(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const dayPattern = /^Day (\d+)$/i;
  let max = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(dayPattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }

  return max;
}

/**
 * Creates the next day's code folder and images folder.
 * Returns the new day number.
 */
async function createDayFolders() {
  logger.info('Folder creation workflow starting', { module: 'folderManager' });

  try {
    const currentMax = await getHighestDayNumber(config.paths.sdeSheet);
    const newDay = currentMax + 1;

    logger.info(`Current highest day: ${currentMax}. Creating Day ${newDay}`, {
      module: 'folderManager',
    });

    // Code folder: "Day 20" (capital D, space, number)
    const codeFolderPath = path.join(config.paths.sdeSheet, `Day ${newDay}`);

    // Images folder: "day 20" (lowercase d, space, number)
    const imgFolderPath = path.join(config.paths.images, `day ${newDay}`);

    // Create code folder (idempotent)
    try {
      await fs.access(codeFolderPath);
      logger.warn(`Code folder already exists, skipping: Day ${newDay}`, {
        module: 'folderManager',
      });
    } catch {
      await fs.mkdir(codeFolderPath, { recursive: true });
      logger.info(`Created code folder: ${codeFolderPath}`, { module: 'folderManager' });
    }

    // Create images folder (idempotent)
    try {
      await fs.access(imgFolderPath);
      logger.warn(`Images folder already exists, skipping: day ${newDay}`, {
        module: 'folderManager',
      });
    } catch {
      await fs.mkdir(imgFolderPath, { recursive: true });
      logger.info(`Created images folder: ${imgFolderPath}`, { module: 'folderManager' });
    }

    // Persist to state
    await writeState({ currentDay: newDay, foldersCreated: true });

    await notify(
      '📁 SDE Agent',
      `Day ${newDay} folders created! Open VS Code and start coding 💻`
    );

    return newDay;
  } catch (err) {
    logger.error('Folder creation failed', { module: 'folderManager', error: err.message });
    await notify('❌ SDE Agent Error', `Folder creation failed: ${err.message}`);
    throw err;
  }
}

export { createDayFolders };
```

### 5.2 `src/sdeSheetScraper.js`

> **Critical:** Before using this module in production, run the `debugLocalStorage()` function (Section 9) to discover the exact localStorage key format TUF uses for checked problems. Update the filter logic in `getTodaysProblems()` accordingly.

```javascript
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
```

### 5.3 `src/fileCreator.js`

```javascript
import { promises as fs } from 'fs';
import path from 'path';
import config from '../config/config.js';
import logger from './utils/logger.js';
import { writeState } from './utils/stateManager.js';

/**
 * Converts a problem name to a safe Java file name.
 * "M Coloring Problem" → "M_Coloring_Problem.java"
 * "Word Break (Print All Ways)" → "Word_Break_Print_All_Ways.java"
 */
function toFileName(name) {
  return (
    name
      .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars
      .trim()
      .replace(/\s+/g, '_') // Spaces → underscores
    + '.java'
  );
}

/**
 * Converts a problem name to a valid Java class name (PascalCase).
 * "M Coloring Problem" → "MColoringProblem"
 */
function toClassName(name) {
  return name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Generates the full Java file boilerplate for a given problem.
 */
function generateBoilerplate(problem, dayNum) {
  const className = toClassName(problem.name);
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return `// ============================================================
// Problem   : ${problem.name}
// Day       : ${dayNum} / 45
// Difficulty: ${problem.difficulty}
// LeetCode  : ${problem.leetcodeUrl}
// Date      : ${dateStr}
// Challenge : Striver's SDE Sheet — by Raj Vikramaditya (TUF)
// ============================================================

public class ${className} {

    // ── SOLUTION ─────────────────────────────────────────────

    // TODO: Implement your solution here


    // ── MAIN / TEST ──────────────────────────────────────────

    public static void main(String[] args) {
        // Write test cases here
        System.out.println("Testing: ${problem.name}");
    }
}
`;
}

/**
 * Creates .java files for today's 3 problems in the Day N code folder.
 * @param {Array} problems  - Array of problem objects from the scraper
 * @param {number} dayNum   - The current day number
 * @returns {string[]}      - Array of created file paths
 */
async function createJavaFiles(problems, dayNum) {
  const codeFolderPath = path.join(config.paths.sdeSheet, `Day ${dayNum}`);
  const createdFiles = [];

  logger.info(`Creating Java files in ${codeFolderPath}`, {
    module: 'fileCreator',
    dayNum,
    problemCount: problems.length,
  });

  for (const problem of problems) {
    const fileName = toFileName(problem.name);
    const filePath = path.join(codeFolderPath, fileName);

    // Idempotency: never overwrite an existing solution file
    try {
      await fs.access(filePath);
      logger.warn(`File already exists, skipping: ${fileName}`, { module: 'fileCreator' });
      continue;
    } catch {
      // File doesn't exist — safe to create
    }

    const content = generateBoilerplate(problem, dayNum);
    await fs.writeFile(filePath, content, 'utf-8');
    logger.info(`Created: ${fileName}`, { module: 'fileCreator', path: filePath });
    createdFiles.push(filePath);
  }

  await writeState({ filesCreated: true });
  logger.info(`File creation complete. ${createdFiles.length} files written.`, {
    module: 'fileCreator',
  });

  return createdFiles;
}

export { createJavaFiles };
```

### 5.4 `src/submissionMonitor.js`

```javascript
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
```

### 5.5 `src/gitAutomation.js`

```javascript
import simpleGit from 'simple-git';
import config from '../config/config.js';
import logger from './utils/logger.js';
import { writeState } from './utils/stateManager.js';
import { notify } from './utils/notifier.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Stages all changes, commits with the exact SDE Sheet message,
 * and pushes to the configured remote + branch.
 *
 * @param {number} dayNum  - The day number for the commit message
 */
async function commitAndPush(dayNum) {
  const commitMessage = `Completed Day ${dayNum}/45 of the SDE Sheet Challenge.`;
  const git = simpleGit(config.paths.sdeSheet);
  const retryDelays = [5_000, 15_000, 30_000];

  logger.info(`Starting git commit: "${commitMessage}"`, { module: 'gitAutomation' });

  for (let attempt = 1; attempt <= config.git.maxRetries; attempt++) {
    try {
      // Stage everything
      await git.add('.');
      logger.info(`git add .  (attempt ${attempt})`, { module: 'gitAutomation' });

      // Commit
      const commitResult = await git.commit(commitMessage);
      logger.info('Commit created', {
        module: 'gitAutomation',
        hash: commitResult.commit,
        message: commitMessage,
      });

      // Push
      await git.push(config.git.remote, config.git.branch);
      logger.info('Push successful ✅', {
        module: 'gitAutomation',
        remote: config.git.remote,
        branch: config.git.branch,
        attempt,
      });

      // Update state and notify user
      await writeState({ gitPushed: true });
      await notify(
        '✅ GitHub Updated!',
        `Day ${dayNum} committed and pushed to GitHub successfully!`
      );

      return true;
    } catch (err) {
      logger.error(`Git operation failed (attempt ${attempt}/${config.git.maxRetries})`, {
        module: 'gitAutomation',
        error: err.message,
      });

      if (attempt < config.git.maxRetries) {
        logger.info(`Retrying in ${retryDelays[attempt - 1] / 1000}s...`, {
          module: 'gitAutomation',
        });
        await sleep(retryDelays[attempt - 1]);
      } else {
        await notify(
          '❌ Git Push Failed',
          `Could not push Day ${dayNum} after ${config.git.maxRetries} attempts.\n` +
          `Please run: git push ${config.git.remote} ${config.git.branch}\n` +
          `Debug SSH: ssh -T git@github.com`
        );
        throw err;
      }
    }
  }
}

export { commitAndPush };
```

### 5.6 `src/linkedinPost.js`

```javascript
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import config from '../config/config.js';
import logger from './utils/logger.js';
import { writeState } from './utils/stateManager.js';
import { notify, notifyWithConfirm } from './utils/notifier.js';
import { toBold } from './utils/unicodeBold.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──────────────────────────────────────────────────────────────────────────────
// PART 1: Generate post content via Anthropic Claude API
// ──────────────────────────────────────────────────────────────────────────────

async function generatePostContent(dayNum, problems) {
  logger.info('Generating post content via Claude API', { module: 'linkedinPost' });

  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  const problemList = problems
    .map((p, i) => `${i + 1}. "${p.name}" — Difficulty: ${p.difficulty}`)
    .join('\n');

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1000,
    messages: [
      {
        role: 'user',
        content: `You are writing content for a LinkedIn post by a computer science student (Rishabh) who just completed Day ${dayNum} of 45 in the Striver's SDE Sheet DSA challenge.

Today's 3 problems were:
${problemList}

Instructions:
- Write in first person, enthusiastic but not over-the-top
- Focus on what pattern or insight emerged from today's problems
- Keep it personal, relatable, and educational
- The audience is tech students and software developers on LinkedIn

Return ONLY a raw JSON object — no markdown backticks, no explanation, nothing before or after the JSON:
{
  "reflection": "A 2-3 sentence opening paragraph about today's key learning or the 'aha moment' that emerged from these problems",
  "descriptions": [
    "One crisp sentence about what was learned from problem 1 specifically",
    "One crisp sentence about what was learned from problem 2 specifically",
    "One crisp sentence about what was learned from problem 3 specifically"
  ],
  "closing": "A 2-3 sentence paragraph about the common theme or algorithmic pattern connecting today's 3 problems"
}`,
      },
    ],
  });

  const rawText = response.content[0].text.trim();

  try {
    return JSON.parse(rawText);
  } catch {
    // Strip any accidental markdown fence if Claude added one
    const cleaned = rawText.replace(/^```(?:json)?|```$/gm, '').trim();
    return JSON.parse(cleaned);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// PART 2: Assemble the full LinkedIn post string
// ──────────────────────────────────────────────────────────────────────────────

function assemblePost(dayNum, problems, aiContent) {
  const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣'];
  const nextDay = dayNum + 1;

  const problemLines = problems
    .map((p, i) => `${NUMBER_EMOJIS[i]} ${toBold(p.name)} --> ${aiContent.descriptions[i]}`)
    .join('\n');

  return [
    `✅Day ${dayNum}/45 completed of the #SDESheetChallenge by TUF and Raj Vikramaditya sir.`,
    aiContent.reflection,
    problemLines,
    aiContent.closing,
    `A huge thanks to takeUforward and Raj Vikramaditya sir for this challenge.`,
    `Looking forward to Day ${nextDay} 💪💪`,
    `#SDESheetChallenge #StriversA2ZSheet #DSA #CodingJourney #ProblemSolving #LeetCode #SoftwareEngineering`,
  ].join('\n');
}

// ──────────────────────────────────────────────────────────────────────────────
// PART 3: Read LinkedIn OAuth tokens from disk
// ──────────────────────────────────────────────────────────────────────────────

async function getLinkedInTokens() {
  try {
    const tokenData = await fs.readFile(config.linkedin.tokenPath, 'utf-8');
    const tokens = JSON.parse(tokenData);
    const expiresAt = new Date(tokens.expiresAt);

    if (expiresAt > new Date()) {
      return tokens;
    }

    logger.warn('LinkedIn token has expired', { module: 'linkedinPost', expiresAt });
  } catch {
    logger.warn('LinkedIn token file not found or unreadable', { module: 'linkedinPost' });
  }

  await notify(
    '🔑 LinkedIn Auth Required',
    'Your LinkedIn session has expired. Please run:\n  node src/linkedinAuth.js'
  );
  throw new Error('LinkedIn re-authentication required. Run: node src/linkedinAuth.js');
}

// ──────────────────────────────────────────────────────────────────────────────
// PART 4: Publish post to LinkedIn via UGC Posts API
// ──────────────────────────────────────────────────────────────────────────────

async function publishToLinkedIn(postText, accessToken, personUrn) {
  logger.info('Publishing to LinkedIn...', { module: 'linkedinPost' });

  const response = await axios.post(
    'https://api.linkedin.com/v2/ugcPosts',
    {
      author: `urn:li:person:${personUrn}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: postText },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  );

  if (response.status === 201) {
    const postId = response.headers['x-restli-id'];
    logger.info('LinkedIn post published ✅', { module: 'linkedinPost', postId });
    return postId;
  }

  throw new Error(`LinkedIn API error ${response.status}: ${JSON.stringify(response.data)}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// PART 5: Fallback — save post to file and clipboard if API fails
// ──────────────────────────────────────────────────────────────────────────────

async function saveFallbackPost(dayNum, postText) {
  const fallbackPath = path.join(__dirname, `../../fallback_post_day${dayNum}.txt`);
  await fs.writeFile(fallbackPath, postText, 'utf-8');

  // Copy to Windows clipboard using built-in clip command
  try {
    execSync(`echo ${JSON.stringify(postText)} | clip`);
    logger.info('Post text copied to clipboard', { module: 'linkedinPost' });
  } catch {
    // clip command failed (non-Windows); ignore
  }

  return fallbackPath;
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ──────────────────────────────────────────────────────────────────────────────

async function createAndPublishPost(dayNum, problems) {
  logger.info(`Starting LinkedIn post workflow for Day ${dayNum}`, { module: 'linkedinPost' });

  try {
    // ── Step 1: Ask user to upload screenshots to LinkedIn ─────────────────
    await notify(
      '📸 Action Required — SDE Agent',
      `Please open LinkedIn and upload your screenshots for Day ${dayNum}.\n` +
      `After uploading, click the next notification to continue.`
    );

    // Small delay to let user see and act on the first notification
    await new Promise((r) => setTimeout(r, 5000));

    const confirmed = await notifyWithConfirm(
      '✅ Confirm Image Upload',
      'Click here once you have uploaded your screenshots to LinkedIn'
    );

    if (!confirmed) {
      logger.warn('User did not confirm image upload — aborting LinkedIn post', {
        module: 'linkedinPost',
      });
      await notify('⚠️ LinkedIn Post Skipped', 'Post was not published. Run manually if needed.');
      return null;
    }

    // ── Step 2: Generate content via Claude API ─────────────────────────────
    let aiContent;
    try {
      aiContent = await generatePostContent(dayNum, problems);
      logger.info('AI content generated', { module: 'linkedinPost' });
    } catch (aiErr) {
      logger.error('Claude API failed — using static fallback content', {
        module: 'linkedinPost',
        error: aiErr.message,
      });
      // Static fallback so the post still goes out even if Claude is unavailable
      aiContent = {
        reflection: `Today was Day ${dayNum} of the SDE Sheet challenge and all three problems are now complete.`,
        descriptions: problems.map((p) => `Solved ${p.name} and understood the core approach.`),
        closing: `Each problem reinforced key DSA patterns. Looking forward to tomorrow's set.`,
      };
    }

    // ── Step 3: Assemble post text ─────────────────────────────────────────
    const postText = assemblePost(dayNum, problems, aiContent);
    logger.info('Post assembled', { module: 'linkedinPost', length: postText.length });

    // ── Step 4: Publish to LinkedIn ─────────────────────────────────────────
    const tokens = await getLinkedInTokens();
    const postId = await publishToLinkedIn(postText, tokens.accessToken, tokens.personUrn);

    // ── Step 5: Update state ────────────────────────────────────────────────
    await writeState({ linkedinPosted: true });

    await notify(
      '🎉 Day Complete!',
      `Day ${dayNum} is fully wrapped up! GitHub pushed + LinkedIn posted. See you tomorrow 💪`
    );

    return postId;
  } catch (err) {
    logger.error('LinkedIn post workflow failed', { module: 'linkedinPost', error: err.message });

    // Try to reconstruct and save the post even on failure
    try {
      const fallbackAI = {
        reflection: `Completed Day ${dayNum} of the SDE Sheet challenge.`,
        descriptions: problems.map((p) => `Solved: ${p.name}`),
        closing: `Moving forward with Day ${dayNum + 1} tomorrow.`,
      };
      const fallbackText = assemblePost(dayNum, problems, fallbackAI);
      const fallbackPath = await saveFallbackPost(dayNum, fallbackText);
      await notify(
        '⚠️ LinkedIn Auto-Post Failed',
        `Post text saved to: ${fallbackPath}\nAlso copied to clipboard. Please post manually.`
      );
    } catch {
      // If even the fallback fails, log everything
      logger.error('Could not save fallback post either', { module: 'linkedinPost' });
    }

    throw err;
  }
}

export { createAndPublishPost };
```

### 5.7 `src/scheduler.js`

```javascript
import cron from 'node-cron';
import { EventEmitter } from 'events';
import logger from './utils/logger.js';

const schedulerEmitter = new EventEmitter();

function startScheduler() {
  // Fire at exactly 00:00:00 IST every day
  cron.schedule(
    '0 0 * * *',
    () => {
      logger.info('⏰ Midnight cron trigger fired', { module: 'scheduler' });
      schedulerEmitter.emit('midnight');
    },
    {
      scheduled: true,
      timezone: 'Asia/Kolkata', // IST — Bharuch, Gujarat
    }
  );

  logger.info('Scheduler initialized. Midnight trigger registered (IST).', {
    module: 'scheduler',
  });
}

export { startScheduler, schedulerEmitter };
```

### 5.8 `src/systemTray.js`

```javascript
import SysTray from 'systray-v2';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/logger.js';
import { readState } from './utils/stateManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray = null;

// Menu item indices (must match the items array order below)
const MENU = {
  STATUS: 0,
  SEP1: 1,
  CREATE_FOLDERS: 2,
  GIT_COMMIT: 3,
  LINKEDIN_POST: 4,
  SEP2: 5,
  VIEW_LOGS: 6,
  EXIT: 7,
};

function createTray(orchestrator) {
  tray = new SysTray({
    menu: {
      // icon: base64 PNG or path to PNG file
      icon: path.join(__dirname, '../assets/icon.png'),
      title: 'SDE Agent',
      tooltip: 'SDE Sheet Challenge Agent — Running',
      items: [
        { title: '🟢 Idle', tooltip: 'Current agent status', checked: false, enabled: false },
        SysTray.separator,
        { title: 'Force Create Today\'s Folder', checked: false, enabled: true },
        { title: 'Force Git Commit', checked: false, enabled: true },
        { title: 'Force LinkedIn Post', checked: false, enabled: true },
        SysTray.separator,
        { title: 'View Logs', checked: false, enabled: true },
        { title: 'Exit Agent', checked: false, enabled: true },
      ],
    },
    debug: false,
    copyDir: true,
  });

  tray.onClick(async (action) => {
    logger.info(`System tray action: seq_id=${action.seq_id}`, { module: 'systemTray' });

    switch (action.seq_id) {
      case MENU.CREATE_FOLDERS:
        orchestrator.emit('midnight');
        break;

      case MENU.GIT_COMMIT: {
        const state = await readState();
        orchestrator.emit('submission_complete', state.currentDay);
        break;
      }

      case MENU.LINKEDIN_POST: {
        const state = await readState();
        orchestrator.emit('linkedin_only', state.currentDay, state.todayProblems);
        break;
      }

      case MENU.VIEW_LOGS:
        exec(`start notepad.exe "${path.join(__dirname, '../logs/agent.log')}"`);
        break;

      case MENU.EXIT:
        logger.info('User requested exit from system tray', { module: 'systemTray' });
        process.exit(0);
    }
  });

  logger.info('System tray icon created', { module: 'systemTray' });
}

/**
 * Updates the status label in the system tray.
 * @param {'idle'|'working'|'error'} status
 */
function updateStatus(status) {
  if (!tray) return;

  const labels = {
    idle: '🟢 Idle',
    working: '🔵 Working...',
    error: '🔴 Error — Check Logs',
  };

  tray.sendAction({
    type: 'update-item',
    seq_id: MENU.STATUS,
    item: { title: labels[status] || '🟢 Idle' },
  });
}

export { createTray, updateStatus };
```

---

## 6. Main Orchestrator (`main.js`)

```javascript
import 'dotenv/config';
import { EventEmitter } from 'events';
import logger from './src/utils/logger.js';
import { readState, writeState } from './src/utils/stateManager.js';
import { startScheduler, schedulerEmitter } from './src/scheduler.js';
import { createDayFolders } from './src/folderManager.js';
import { getTodaysProblems } from './src/sdeSheetScraper.js';
import { createJavaFiles } from './src/fileCreator.js';
import { startMonitoring, stopMonitoring, monitorEmitter } from './src/submissionMonitor.js';
import { commitAndPush } from './src/gitAutomation.js';
import { createAndPublishPost } from './src/linkedinPost.js';
import { createTray, updateStatus } from './src/systemTray.js';

const orchestrator = new EventEmitter();

// ──────────────────────────────────────────────────────────────────────────────
// MIDNIGHT WORKFLOW
// Triggered by: cron job OR system tray "Force Create Today's Folder"
// ──────────────────────────────────────────────────────────────────────────────

orchestrator.on('midnight', async () => {
  updateStatus('working');
  logger.info('═══ MIDNIGHT WORKFLOW START ═══', { module: 'orchestrator' });

  try {
    // 1. Create Day N+1 folders
    const dayNum = await createDayFolders();
    logger.info(`Step 1/4: Folders created for Day ${dayNum}`, { module: 'orchestrator' });

    // 2. Scrape TUF SDE Sheet for today's 3 problems
    const problems = await getTodaysProblems();
    logger.info('Step 2/4: Problems scraped from TUF', {
      module: 'orchestrator',
      problems: problems.map((p) => p.name),
    });

    // 3. Save problems to state so the monitor and LinkedIn post can use them
    await writeState({ todayProblems: problems });

    // 4. Create .java boilerplate files
    const createdFiles = await createJavaFiles(problems, dayNum);
    logger.info(`Step 3/4: ${createdFiles.length} Java files created`, { module: 'orchestrator' });

    // 5. Start submission monitoring
    await startMonitoring();
    logger.info('Step 4/4: Submission monitor started', { module: 'orchestrator' });

    updateStatus('idle');
    logger.info('═══ MIDNIGHT WORKFLOW COMPLETE ═══', { module: 'orchestrator' });
  } catch (err) {
    updateStatus('error');
    logger.error('Midnight workflow error', { module: 'orchestrator', error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// COMPLETION WORKFLOW
// Triggered by: submission monitor detecting all 3 checkboxes
//               OR system tray "Force Git Commit"
// ──────────────────────────────────────────────────────────────────────────────

orchestrator.on('submission_complete', async (dayNum) => {
  updateStatus('working');
  logger.info(`═══ COMPLETION WORKFLOW START (Day ${dayNum}) ═══`, { module: 'orchestrator' });

  try {
    const state = await readState();

    // 1. Git commit + push (skip if already done)
    if (!state.gitPushed) {
      await commitAndPush(dayNum);
      logger.info('Step 1/2: Git commit + push done', { module: 'orchestrator' });
    } else {
      logger.info('Step 1/2: Git already pushed today — skipping', { module: 'orchestrator' });
    }

    // 2. LinkedIn post (skip if already done)
    if (!state.linkedinPosted) {
      await createAndPublishPost(dayNum, state.todayProblems);
      logger.info('Step 2/2: LinkedIn post published', { module: 'orchestrator' });
    } else {
      logger.info('Step 2/2: LinkedIn already posted today — skipping', { module: 'orchestrator' });
    }

    updateStatus('idle');
    logger.info(`═══ COMPLETION WORKFLOW DONE (Day ${dayNum}) ═══`, { module: 'orchestrator' });
  } catch (err) {
    updateStatus('error');
    logger.error('Completion workflow error', { module: 'orchestrator', error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Bridge sub-module events to the orchestrator
// ──────────────────────────────────────────────────────────────────────────────

schedulerEmitter.on('midnight', () => orchestrator.emit('midnight'));
monitorEmitter.on('submission_complete', (dayNum) =>
  orchestrator.emit('submission_complete', dayNum)
);

// ──────────────────────────────────────────────────────────────────────────────
// Startup
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  logger.info('🚀 SDE Sheet Challenge Agent starting...', { module: 'orchestrator' });

  // Create system tray icon (must come first so errors are visible)
  createTray(orchestrator);

  // Start the scheduler (registers midnight cron job)
  startScheduler();

  // On startup: resume the submission monitor if today's folders exist but
  // the challenge isn't yet complete (handles agent restarts mid-day)
  const state = await readState();
  const dayFoldersExist = state.currentDay > 0 && state.foldersCreated;
  const notYetComplete = !state.submissionDetected;

  if (dayFoldersExist && notYetComplete && state.todayProblems.length > 0) {
    logger.info('Resuming submission monitor from persisted state', {
      module: 'orchestrator',
      day: state.currentDay,
      problems: state.todayProblems.map((p) => p.name),
    });
    await startMonitoring();
  }

  logger.info(
    '✅ SDE Agent running. Check the Windows system tray for status.',
    { module: 'orchestrator' }
  );
}

main().catch((err) => {
  logger.error('Fatal error in main()', {
    module: 'orchestrator',
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});
```

---

## 7. LinkedIn OAuth Helper (`src/linkedinAuth.js`)

Run this script **once** before going live and **again** every 60 days when the token expires.

```javascript
// ──────────────────────────────────────────────────────────────────────────────
// LinkedIn OAuth 2.0 Authorization Code Flow — One-time setup script
// Run with: node src/linkedinAuth.js
// ──────────────────────────────────────────────────────────────────────────────

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const config = require('../config/config');

const { clientId, clientSecret, redirectUri, tokenPath } = config.linkedin;
const SCOPES = 'w_member_social r_liteprofile';

// Random state param to protect against CSRF
const STATE = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

const authUrl =
  `https://www.linkedin.com/oauth/v2/authorization` +
  `?response_type=code` +
  `&client_id=${clientId}` +
  `&redirect_uri=${encodeURIComponent(redirectUri)}` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&state=${STATE}`;

console.log('\n🔑 LinkedIn OAuth — One-Time Authentication\n');
console.log('Open this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for callback on port 3000...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');

  if (url.pathname !== '/callback') {
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    res.end(`OAuth Error: ${error} — ${url.searchParams.get('error_description')}`);
    console.error('OAuth error:', error);
    server.close();
    return;
  }

  if (returnedState !== STATE) {
    res.end('State mismatch — possible CSRF attack. Aborting.');
    console.error('State mismatch!');
    server.close();
    return;
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
    }

    // Fetch the user's person URN (needed for post authorship)
    const profileResponse = await fetch('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const profile = await profileResponse.json();

    const tokens = {
      accessToken: tokenData.access_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      personUrn: profile.id,
      name: `${profile.localizedFirstName} ${profile.localizedLastName}`,
    };

    // Save to ~/.sde-agent/linkedin_tokens.json
    await fs.mkdir(path.dirname(tokenPath), { recursive: true });
    await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2));

    console.log('\n✅ Authentication successful!');
    console.log(`   Name       : ${tokens.name}`);
    console.log(`   Person URN : ${tokens.personUrn}`);
    console.log(`   Token expires: ${tokens.expiresAt}`);
    console.log(`   Saved to   : ${tokenPath}\n`);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>✅ Authentication successful!</h2><p>You can close this tab.</p>');
  } catch (err) {
    console.error('Error during token exchange:', err.message);
    res.end(`Error: ${err.message}`);
  } finally {
    server.close();
  }
});

server.listen(3000);
```

---

## 8. Windows Service Deployment (`install-service.js`)

```javascript
// ──────────────────────────────────────────────────────────────────────────────
// Registers the SDE Agent as a Windows Service.
// Run ONCE with: node install-service.js
// Requires: npm install -g node-windows
// ──────────────────────────────────────────────────────────────────────────────

const path = require('path');
const Service = require('node-windows').Service;

const svc = new Service({
  name: 'SDE Sheet Challenge Agent',
  description: 'Automates daily folder creation, git commits, and LinkedIn posts for the SDE Sheet Challenge.',
  script: path.join(__dirname, 'main.js'),
  nodeOptions: ['--max-old-space-size=256'],
  env: [
    { name: 'NODE_ENV', value: 'production' },
  ],
  // Restart automatically if the process crashes
  allowServiceLogon: true,
});

svc.on('install', () => {
  console.log('✅ Windows Service installed.');
  svc.start();
  console.log('✅ Service started.');
  console.log('\nThe SDE Agent will now:');
  console.log('  • Start automatically when Windows boots');
  console.log('  • Restart automatically if it crashes');
  console.log('  • Appear in Task Manager > Services as "SDE Sheet Challenge Agent"');
});

svc.on('alreadyinstalled', () => {
  console.log('⚠️ Service already installed. Uninstall first if you need to re-install.');
});

svc.on('error', (err) => {
  console.error('Service installation error:', err);
});

svc.install();
```

**Install the service** (run PowerShell as Administrator):
```powershell
cd "D:\RISHABH\Tools\sde-agent"
node install-service.js
```

**Verify it's running:**
```powershell
sc query "SDE Sheet Challenge Agent"
# Should show STATE: 4 RUNNING
```

**Uninstall (if needed):**
```javascript
// In a new file: uninstall-service.js
const Service = require('node-windows').Service;
const svc = new Service({ name: 'SDE Sheet Challenge Agent', script: './main.js' });
svc.on('uninstall', () => console.log('Service removed.'));
svc.uninstall();
```

---

## 9. Critical First Run: TUF LocalStorage Inspection

**This step is mandatory before going live.** The TUF SDE Sheet stores checkbox states in `localStorage`, but the exact key format is implementation-specific and can change. You must discover the actual format by running:

```powershell
cd "D:\RISHABH\Tools\sde-agent"
node -e "require('./src/sdeSheetScraper').debugLocalStorage()"
```

This opens a **visible Chrome window** on the TUF sheet. Do the following:

1. Wait for the page to load completely
2. Check 2–3 problems by clicking their checkboxes
3. Watch the PowerShell console — it polls localStorage every 3 seconds and prints any changes

**What to look for in the output:**
```
[localStorage change] KEY: "m-coloring-problem"  VALUE: "true"
[localStorage change] KEY: "rat-in-a-maze"        VALUE: "true"
```

**Or it might look like:**
```
[localStorage change] KEY: "checked_42"   VALUE: "true"
[localStorage change] KEY: "problem_15"   VALUE: "1"
```

Once you know the exact format, update the filter logic in `sdeSheetScraper.js` inside the `getTodaysProblems()` function. Find this block and update accordingly:

```javascript
// UPDATE THIS FILTER to match what you saw in the debug output:
const checkedSet = new Set(
  Object.keys(storage).filter(
    (k) => storage[k] === 'true' || storage[k] === '1' || storage[k] === 'checked'
    // Add or remove conditions based on your findings
  )
);
```

And update the ID-matching logic in the `filter()` call if needed.

---

## 10. Initial Setup Checklist

Work through this top-to-bottom before the first midnight trigger:

```
ENVIRONMENT
  □ Node.js 20.x LTS installed and verified (node --version)
  □ All npm dependencies installed (npm install in project root)
  □ node-windows installed globally (npm install -g node-windows)

CREDENTIALS & CONFIGURATION
  □ .env file created with ALL fields filled in (no placeholders remaining)
  □ Anthropic API key added — test with: node -e "require('./config/config').anthropic.apiKey && console.log('OK')"
  □ LinkedIn app created at developers.linkedin.com
  □ LinkedIn Client ID and Secret added to .env
  □ node src/linkedinAuth.js run successfully — tokens saved to ~/.sde-agent/
  □ GitHub SSH key configured and tested: ssh -T git@github.com

GIT SETUP
  □ SDE Sheet folder is a git repo: cd "D:\RISHABH\Code Playground\DSA\SDE SHEET CHALLENGE" && git status
  □ Remote is configured correctly: git remote -v (should show git@github.com:PRishabhKumar/...)
  □ Branch name matches GIT_BRANCH in .env

TUF SHEET SCRAPER
  □ debugLocalStorage() run to discover exact localStorage key format
  □ sdeSheetScraper.js updated with the correct checkedSet filter
  □ Manual scraper test: node -e "require('./src/sdeSheetScraper').getTodaysProblems().then(console.log)"
    (Should print an array of 3 problem objects)

AGENT TEST RUN
  □ Run agent directly (not as service): node main.js
  □ System tray icon appears ✅
  □ Manually trigger midnight from tray → Day folder and .java files created?
  □ Manually trigger "Force Git Commit" from tray → code pushed to GitHub?
  □ Check logs/agent.log for any errors

SERVICE INSTALLATION
  □ install-service.js run as Administrator
  □ Service appears in Task Manager > Services
  □ Reboot machine → agent auto-starts and tray icon appears
```

---

## 11. Debugging & Troubleshooting

### Common Issues

| Symptom | Most Likely Cause | Fix |
|---------|------------------|-----|
| Puppeteer launches but finds 0 problems | TUF changed their DOM structure | Re-run `debugLocalStorage()` and update selectors in `sdeSheetScraper.js` |
| `waitForSelector` timeout | TUF page is slow or down | Check if TUF is accessible in Chrome manually; check internet connection |
| Git push rejected | SSH key not authorized | Run `ssh -T git@github.com` to test; re-add key to GitHub if needed |
| LinkedIn post gives 403 | OAuth token expired (60-day lifetime) | Run `node src/linkedinAuth.js` again |
| System tray icon doesn't appear | systray-v2 binary issue | Check `node_modules/systray-v2/` for the tray binary; try reinstalling |
| Midnight trigger never fires | Wrong timezone or system clock drift | Verify with `node -e "console.log(new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'}))"` |
| Claude API returns invalid JSON | Claude added markdown fences | The parser in linkedinPost.js already strips these; check logs for the raw response |
| Windows Service won't start | node path issue | Check the service's event log in Event Viewer; try `node main.js` directly first |

### Manual Override Commands

Run any step manually without waiting for the scheduler:

```powershell
# Force midnight workflow (folder creation + file scaffolding)
node -e "
  require('dotenv').config();
  const { createDayFolders } = require('./src/folderManager');
  const { getTodaysProblems } = require('./src/sdeSheetScraper');
  const { createJavaFiles } = require('./src/fileCreator');
  const { writeState } = require('./src/utils/stateManager');
  (async () => {
    const day = await createDayFolders();
    const problems = await getTodaysProblems();
    await writeState({ todayProblems: problems });
    await createJavaFiles(problems, day);
    console.log('Done! Day', day, 'ready.');
  })();
"

# Force git commit for day 20
node -e "
  require('dotenv').config();
  require('./src/gitAutomation').commitAndPush(20).then(() => console.log('Pushed!'));
"

# Test LinkedIn post generation without publishing
node -e "
  require('dotenv').config();
  const Anthropic = require('@anthropic-ai/sdk');
  const { toBold } = require('./src/utils/unicodeBold');
  console.log(toBold('M Coloring Problem'));
  console.log(toBold('Rat in a Maze'));
"

# Check what's in state.json
node -e "require('./src/utils/stateManager').readState().then(s => console.log(JSON.stringify(s, null, 2)));"
```

### Viewing Logs

```powershell
# Open in Notepad from system tray (View Logs menu item)
# Or directly:
Get-Content "D:\RISHABH\Tools\sde-agent\logs\agent.log" -Tail 50

# Watch live as agent runs:
Get-Content "D:\RISHABH\Tools\sde-agent\logs\agent.log" -Wait
```