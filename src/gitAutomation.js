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