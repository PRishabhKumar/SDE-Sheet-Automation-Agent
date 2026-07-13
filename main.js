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
  logger.info('SDE Sheet Challenge Agent starting...', { module: 'orchestrator' });

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