# SDE Sheet Challenge Automation Agent
## Product Requirements Document (PRD)

**Version:** 1.0
**Author:** Rishabh Kumar
**Date:** June 2026
**Status:** Draft

---

## 1. Executive Summary

The SDE Sheet Challenge Automation Agent is a persistent background daemon for Windows that eliminates all the repetitive, non-coding overhead of Rishabh's daily Striver's SDE Sheet (TUF) challenge routine. The agent handles four automated workflows end-to-end: midnight folder scaffolding, Java file creation from the live SDE Sheet, GitHub commits triggered by checkbox completion, and LinkedIn post publishing — so the user can stay focused entirely on solving DSA problems.

---

## 2. Problem Statement

Rishabh follows a rigid daily routine for the 45-day Striver's SDE Sheet Challenge:

- Solve 3 specific problems each day in Java (on both LeetCode and VS Code)
- Take screenshots of VS Code and LeetCode submission confirmations
- Manually create a `Day N` folder in the code directory and a `day N` folder in the images directory
- Manually create empty `.java` files named after each problem
- Monitor his own checkbox progress on the TUF sheet and manually commit + push when all 3 are done
- Draft and publish a LinkedIn post following a strict template with Unicode-bold problem names

Each manual step is low-effort in isolation, but collectively they add 20–30 minutes of overhead daily, introduce inconsistency risk (wrong folder names, skipped pushes, formatting errors in LinkedIn posts), and interrupt the coding mindset. An agent that handles all four workflows automatically produces a consistent, zero-overhead challenge log across all 45 days.

---

## 3. Target User

**Primary User:** Rishabh Kumar — a student developer completing the Striver's SDE Sheet 45-day DSA challenge.

**Technical Profile:** High technical comfort; familiar with VS Code, Git CLI, Java, Node.js, and web technologies. Will interact with the agent primarily through a system tray icon and Windows notifications rather than a full UI.

**Operating Environment:**
- OS: Windows 11
- Editor: Visual Studio Code
- Browsers: Chrome / Brave
- Accounts: GitHub (PRishabhKumar), LinkedIn, LeetCode, Anthropic

---

## 4. Goals & Success Metrics

### 4.1 Goals

| ID  | Goal |
|-----|------|
| G1  | Eliminate all manual folder and file creation |
| G2  | Automatically detect daily challenge completion without any user trigger |
| G3  | Ensure every day's code is committed to GitHub with zero manual steps post-solve |
| G4  | Publish LinkedIn posts with perfect template formatting every single day |
| G5  | Run silently in the background — survive reboots, never require babysitting |

### 4.2 Success Metrics

| Metric | Target |
|--------|--------|
| Folder + file creation accuracy | 100% correct naming, correct paths, every midnight |
| Checkbox detection latency | < 5 minutes from 3rd checkbox check |
| Git commit success rate | ≥ 99% across 45 days (auto-retry on failure) |
| LinkedIn post format match | Template-perfect on every post |
| Agent uptime | Auto-restarts on crash; survives reboot via Windows Service |
| User manual steps after solving | Zero (except confirming LinkedIn image upload) |

---

## 5. Functional Requirements

### Feature 1 — Midnight Folder Auto-Creation

**FR-1.1:** At exactly 00:00 IST each day, the agent SHALL scan `D:\RISHABH\Code Playground\DSA\SDE SHEET CHALLENGE\` and detect the highest-numbered day folder currently present (e.g., `Day 19`).

**FR-1.2:** The agent SHALL create a new code folder named `Day {N+1}` (e.g., `Day 20`) in the SDE Sheet root directory.

**FR-1.3:** The agent SHALL simultaneously create a corresponding images folder named `day {N+1}` (lowercase, e.g., `day 20`) inside the `images\` subdirectory of the SDE Sheet root.

**FR-1.4:** Folder detection SHALL use regex matching `/^Day \d+$/i` to exclude non-day entries like the `images` folder itself.

**FR-1.5:** If either folder already exists (e.g., agent restarted after midnight), the agent SHALL skip creation silently and log a warning — no duplicates shall be created.

**FR-1.6:** On failure (disk full, permissions error), the agent SHALL log the error and send a Windows toast notification with the error message.

---

### Feature 2 — SDE Sheet Scraping & Java File Scaffolding

**FR-2.1:** Immediately after folder creation, the agent SHALL launch a headless Chromium instance (via Puppeteer), navigate to the TUF SDE Sheet URL, and read all problem names and their checked/unchecked states from the page DOM and localStorage.

**FR-2.2:** The agent SHALL identify the next 3 consecutive unchecked problems in the sheet's natural order (top to bottom, preserving section order as shown on the website).

**FR-2.3:** For each of the 3 problems, the agent SHALL create a `.java` file inside the newly created `Day {N+1}` code folder. File names SHALL follow the pattern: problem name with spaces replaced by underscores, special characters stripped (e.g., `M_Coloring_Problem.java`).

**FR-2.4:** Each `.java` file SHALL contain standard boilerplate including the problem name, day number, LeetCode URL (or N/A), difficulty level, and a public class skeleton with a `main()` method.

**FR-2.5:** Problem names, difficulty levels, and LeetCode links SHALL be scraped directly from the TUF sheet DOM — no problem names shall be hardcoded in the agent.

**FR-2.6:** The 3 selected problems and their IDs SHALL be persisted to `state.json` for use by the Submission Monitor in Feature 3.

**FR-2.7:** If fewer than 3 unchecked problems remain (near the end of the 45-day set), the agent SHALL create files for however many remain and notify the user that the challenge is nearly complete.

---

### Feature 3 — Submission Detection & Automatic GitHub Commit

**FR-3.1:** After file scaffolding, the agent SHALL begin polling the TUF SDE Sheet every 5 minutes (configurable) to detect when all 3 of the day's assigned problems have been checked.

**FR-3.2:** Detection SHALL compare the problem IDs stored in `state.json` (from Feature 2) against the checked items found in the TUF sheet's localStorage on each poll.

**FR-3.3:** When all 3 problems are detected as checked, the agent SHALL immediately trigger a `git add .` across the entire SDE Sheet Challenge directory.

**FR-3.4:** The commit message SHALL follow exactly: `"Completed Day {N}/45 of the SDE Sheet Challenge."` — no deviation.

**FR-3.5:** The agent SHALL push the commit to the configured remote and branch (default: `origin/main`).

**FR-3.6:** On push failure, the agent SHALL retry up to 3 times with exponential backoff (5s, 15s, 30s). After all retries are exhausted, the agent SHALL send a Windows notification prompting the user to push manually.

**FR-3.7:** On successful push, the agent SHALL send a Windows notification: "✅ Day {N} committed and pushed to GitHub!"

**FR-3.8:** The monitor SHALL stop polling for the current day once submission is detected, and SHALL NOT re-trigger a commit for the same day.

---

### Feature 4 — LinkedIn Post Automation

**FR-4.1:** Immediately after a successful GitHub push, the agent SHALL send a Windows notification asking the user to manually upload their screenshots to LinkedIn. The notification SHALL include a "Confirm — Images Uploaded" action button.

**FR-4.2:** The agent SHALL wait for the user to click confirm before proceeding. Without confirmation, the LinkedIn post step SHALL be paused indefinitely (not skipped).

**FR-4.3:** Once confirmed, the agent SHALL call the Anthropic Claude API (`claude-sonnet-4-6`) to generate the variable sections of the LinkedIn post: a reflection paragraph, one-line descriptions per problem, and a closing paragraph.

**FR-4.4:** The post SHALL be assembled in the following template:

```
✅Day {N}/45 completed of the #SDESheetChallenge by TUF and Raj Vikramaditya sir.
{AI_GENERATED_REFLECTION}
1️⃣ {BOLD_PROBLEM_1} --> {AI_GENERATED_DESCRIPTION_1}
2️⃣ {BOLD_PROBLEM_2} --> {AI_GENERATED_DESCRIPTION_2}
3️⃣ {BOLD_PROBLEM_3} --> {AI_GENERATED_DESCRIPTION_3}
{AI_GENERATED_CLOSING}
A huge thanks to takeUforward and Raj Vikramaditya sir for this challenge.
Looking forward to Day {N+1} 💪💪
#SDESheetChallenge #StriversA2ZSheet #DSA #CodingJourney #ProblemSolving #LeetCode #SoftwareEngineering
```

**FR-4.5:** Problem names in the post SHALL appear in Unicode Mathematical Bold Sans-Serif characters, matching the visual style shown in the provided LinkedIn template example.

**FR-4.6:** The post SHALL be published via the LinkedIn UGC Posts API v2 using a stored OAuth 2.0 Bearer token with `w_member_social` scope.

**FR-4.7:** If the Claude API or LinkedIn API call fails, the agent SHALL save the generated post text to a fallback `.txt` file and notify the user to post manually, without losing the content.

---

## 6. Non-Functional Requirements

| ID    | Requirement |
|-------|-------------|
| NFR-1 | The agent SHALL auto-start with Windows login, implemented as a Windows Service via `node-windows` |
| NFR-2 | Memory footprint SHALL remain below 200MB at idle (Puppeteer processes are spawned and killed per use) |
| NFR-3 | All credentials (API keys, OAuth tokens) SHALL be stored in `.env` or a protected directory; never hardcoded or committed to git |
| NFR-4 | All operations SHALL be idempotent — re-running any step after a crash SHALL NOT create duplicate folders, files, or posts |
| NFR-5 | The agent SHALL write structured JSON logs to `logs/agent.log` with module name, timestamp, and severity |
| NFR-6 | A system tray icon SHALL provide status visibility (`🟢 Idle`, `🔵 Working`, `🔴 Error`) and manual override controls |
| NFR-7 | The agent SHALL use IST (Asia/Kolkata) as the reference timezone for all scheduled events |
| NFR-8 | The agent SHALL survive process crashes via Windows Service auto-restart |

---

## 7. User Stories

| ID   | Story |
|------|-------|
| US-1 | As Rishabh, I want a new `Day N` folder to appear automatically at midnight so I can open VS Code and start coding immediately without any setup. |
| US-2 | As Rishabh, I want pre-created `.java` files with correct problem names waiting in that folder so I can start writing solutions without renaming anything. |
| US-3 | As Rishabh, I want my code committed and pushed the moment I check the 3rd problem on TUF so I never forget to push my daily progress. |
| US-4 | As Rishabh, I want a LinkedIn post published automatically with the correct format so my challenge log is consistent across all 45 days. |
| US-5 | As Rishabh, I want to control the agent from a system tray icon so I can pause, check status, or force-run any step without opening a terminal. |
| US-6 | As Rishabh, I want the agent to survive a reboot and pick up exactly where it left off so I never have to re-start it manually. |

---

## 8. Constraints

- The TUF SDE Sheet has no public API; the agent must use browser automation (Puppeteer) to read its state.
- LinkedIn API requires manual OAuth setup once (token valid for 60 days); renewal must be user-triggered.
- The agent runs only on Windows (no cross-platform requirement).
- Git operations depend on SSH keys or a Personal Access Token being pre-configured on the machine.

---

## 9. Out of Scope (v1.0)

- Automatically solving DSA problems
- LeetCode submission automation or status monitoring
- Generating or uploading LinkedIn images automatically (user uploads screenshots manually)
- Multi-user or multi-device support
- Mobile notifications (Windows desktop toast notifications only)
- macOS or Linux support
- Analytics dashboard for challenge progress