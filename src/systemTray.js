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