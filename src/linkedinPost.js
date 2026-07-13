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
