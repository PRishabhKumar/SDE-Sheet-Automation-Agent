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