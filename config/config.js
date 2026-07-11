import 'dotenv/config';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  paths: {
    sdeSheet: process.env.CODE_FOLDER,
    images: process.env.IMAGES_FOLDER,
  },

  tuf: {
    url: process.env.TUF_SDE_SHEET_URL,
  },

  anthropic: {
    apiKey: process.env.GEMINI_API_KEY,
    model: 'claude-sonnet-4-6',
  },

  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_PRIMARY_CLIENT_SECRET,
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
    pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL, 10) || 5,
    timezone: 'Asia/Kolkata',
  },

  state: {
    path: path.join(__dirname, '..', 'state.json'),
  },
};