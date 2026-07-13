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