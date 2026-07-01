# SDE Sheet Challenge Automation Agent
## Technical Requirements Document (TRD)

**Version:** 1.0
**Author:** Rishabh Kumar
**Date:** June 2026

---

## 1. System Architecture Overview

The agent is a **Node.js background daemon** registered as a Windows Service. It is composed of 8 independent, single-responsibility modules coordinated by a central `main.js` orchestrator using Node.js `EventEmitter`. The system is entirely local — no server required — and communicates with three external services: the TUF website (via headless Puppeteer), the Anthropic Claude API, and the LinkedIn API v2.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  SDE Agent (Node.js Daemon — Windows Service)           │
│                                                                         │
│  ┌──────────────────┐    ┌──────────────────┐    ┌────────────────────┐│
│  │  Scheduler       │    │  Folder Manager  │    │  SDE Sheet Scraper ││
│  │  (node-cron)     │───▶│  (fs/promises)   │───▶│  (Puppeteer)       ││
│  │  Midnight: IST   │    │  Day N+1 folders │    │  TUF localStorage  ││
│  └──────────────────┘    └──────────────────┘    └────────────────────┘│
│           │                                                │            │
│           └─────────────────┐                             │            │
│                             ▼                             ▼            │
│                  ┌─────────────────────────────────────────────────┐   │
│                  │           Orchestrator (main.js)                │   │
│                  │           EventEmitter-based coordinator        │   │
│                  └───────────────────────┬─────────────────────────┘   │
│                                          │                              │
│           ┌──────────────────────────────┼──────────────────────────┐  │
│           ▼                              ▼                           ▼  │
│  ┌─────────────────┐   ┌──────────────────────┐  ┌────────────────────┐│
│  │ Submission      │   │  Git Automation      │  │ LinkedIn Automation ││
│  │ Monitor         │──▶│  (simple-git)        │─▶│ (Anthropic API +   ││
│  │ (Puppeteer poll)│   │  Commit + push       │  │  LinkedIn API v2)  ││
│  └─────────────────┘   └──────────────────────┘  └────────────────────┘│
│                                                                         │
│  ┌─────────────────┐   ┌────────────────────────────────────────────┐  │
│  │ System Tray     │   │ Utilities: Logger + Notifier + State Mgr   │  │
│  │ (systray-v2)    │   │ (winston + node-notifier + state.json)     │  │
│  └─────────────────┘   └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘

External Services:
┌────────────────────┐   ┌───────────────────┐   ┌──────────────────────┐
│ takeuforward.org   │   │ api.anthropic.com  │   │ api.linkedin.com/v2  │
│ (Puppeteer access) │   │ /v1/messages       │   │ /ugcPosts            │
└────────────────────┘   └───────────────────┘   └──────────────────────┘
```

---

## 2. Tech Stack

| Component | Library / Tool | Version | Justification |
|-----------|---------------|---------|---------------|
| Runtime | Node.js | 20.x LTS | Excellent async I/O for automation; strong ecosystem; long-term support |
| Scheduler | node-cron | ^3.0 | Cron expressions with timezone support (IST); lightweight; no external dependencies |
| Browser Automation | Puppeteer | ^22.x | Full headless Chrome control; essential for TUF's React-rendered DOM and localStorage access |
| File System | `fs/promises` | built-in | Native Node.js async file I/O; no external dependency needed |
| Git Operations | simple-git | ^3.x | Clean Promise-based wrapper around the local `git` binary; no spawning shell commands manually |
| HTTP Requests | axios | ^1.x | LinkedIn API calls; cleaner than native `fetch` for OAuth flows with interceptors |
| AI Content | `@anthropic-ai/sdk` | latest | Official Anthropic Node.js SDK; generates LinkedIn post paragraphs from problem names |
| System Tray | systray-v2 | ^1.x | Native Windows/Mac tray icon without requiring full Electron runtime |
| Notifications | node-notifier | ^10.x | Windows toast notifications with action buttons; works without Electron |
| Logging | winston | ^3.x | Structured JSON logging with file rotation; industry standard |
| Configuration | dotenv | ^16.x | Loads `.env` into `process.env`; keeps secrets out of source code |
| Windows Service | node-windows | ^1.x | Registers the Node.js process as a proper Windows Service; enables auto-start and crash recovery |
| Unicode Bold | Custom utility | — | Pure JS character remapping; no library needed for Mathematical Bold Sans-Serif Unicode conversion |

---

## 3. Module Specifications

### 3.1 Scheduler Module (`src/scheduler.js`)

**Responsibility:** Fire timed events that drive the other modules. Single source of time-based truth for the system.

**Cron Jobs Registered:**

| Cron Expression | Trigger | Event Emitted |
|----------------|---------|---------------|
| `0 0 * * *` | Every midnight, IST | `midnight` |

**Timezone:** `Asia/Kolkata` (IST, UTC+5:30) — hard-configured.

**Output:** Emits named events on a shared `EventEmitter` that the Orchestrator subscribes to.

**Dependencies:** `node-cron`

**No internal state** — stateless, purely reactive.

---

### 3.2 Folder Manager (`src/folderManager.js`)

**Responsibility:** Detect the current highest day number from disk and create the next day's folders.

**Algorithm:**
```
1. Read all directory entries in SDE_SHEET_PATH
2. Filter entries matching /^Day \d+$/i
3. Parse numeric value from each match, find max → N
4. Construct:
     codeFolderPath = SDE_SHEET_PATH + "\Day {N+1}"
     imgFolderPath  = IMAGES_PATH    + "\day {N+1}"
5. fs.access() check: skip if folder already exists (idempotency)
6. fs.mkdir(path, { recursive: true }) for each folder
7. Write { currentDay: N+1, foldersCreated: true } to state.json
8. Send Windows notification on success or failure
```

**Key Constraint:** The `images` folder itself lives inside `SDE_SHEET_PATH` and must not be counted as a "day folder." The regex `/^Day \d+$/i` safely excludes it.

**Idempotency Guard:** `fs.access()` is called before `fs.mkdir()`. If the folder already exists, the module logs a warning and returns the existing day number — no error, no duplicate.

**Output:** Returns `dayNum` (integer) to the Orchestrator for downstream use.

---

### 3.3 SDE Sheet Scraper (`src/sdeSheetScraper.js`)

**Responsibility:** Open the TUF SDE Sheet in a headless browser, extract all problem names and their check states, and return the next 3 unchecked problems.

**Why Puppeteer (not `fetch` + HTML parsing):**
The TUF SDE Sheet is a React SPA. Problem data and check states are rendered dynamically and stored in `localStorage`. A simple HTTP request returns a mostly empty HTML shell; only a full browser runtime (Puppeteer) can:
1. Execute the React bundle to render the problem list
2. Access `window.localStorage` to read checkbox states

**Process Flow:**
```
1. Launch headless Chromium with isolated --user-data-dir (not user's profile)
2. page.goto(TUF_URL, { waitUntil: 'networkidle2' })
3. page.waitForSelector('table tbody tr') — wait for problem list to render
4. page.evaluate() → extract all {id, name, difficulty, leetcodeUrl, domChecked} from DOM rows
5. page.evaluate() → read all window.localStorage entries as a plain object
6. Identify localStorage keys that correspond to checked problems
   (format determined via debugLocalStorage() one-time inspection — see Section 8)
7. Filter allProblems where: !domChecked AND !storageChecked
8. Return first 3 unchecked entries
9. browser.close()
```

**Output Schema:**
```json
[
  {
    "id": "m-coloring-problem",
    "name": "M Coloring Problem",
    "difficulty": "Medium",
    "leetcodeUrl": "https://leetcode.com/problems/..."
  },
  { ... },
  { ... }
]
```

**Note:** The exact localStorage key format used by TUF must be verified once via `debugLocalStorage()` before production use. The module includes this diagnostic function.

---

### 3.4 Java File Creator (`src/fileCreator.js`)

**Responsibility:** Given a list of problems and a day number, create scaffolded `.java` files in the correct folder.

**File Naming Rule:**
```javascript
fileName = problem.name
  .replace(/[^a-zA-Z0-9\s]/g, '')   // strip special chars
  .trim()
  .replace(/\s+/g, '_')             // spaces → underscores
  + '.java'
// "M Coloring Problem" → "M_Coloring_Problem.java"
// "Word Break (Print All Ways)" → "Word_Break_Print_All_Ways.java"
```

**Class Name Rule:**
```javascript
className = words.map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('')
// "M Coloring Problem" → "MColoringProblem"
```

**Boilerplate Template:**
```java
// Problem: M Coloring Problem
// Day: 20 / 45
// LeetCode: https://leetcode.com/problems/...
// Difficulty: Medium
// Date: 26 June 2026
// TUF SDE Sheet Challenge by Raj Vikramaditya (Striver)

public class MColoringProblem {

    // TODO: Implement solution

    public static void main(String[] args) {
        // Add test cases here
        System.out.println("Testing M Coloring Problem");
    }
}
```

**Idempotency:** If the `.java` file already exists, the module skips it and logs a warning. No overwriting of existing solution code.

---

### 3.5 Submission Monitor (`src/submissionMonitor.js`)

**Responsibility:** Poll the TUF SDE Sheet at a set interval and emit `submission_complete` when all 3 of today's assigned problems are checked.

**Polling Strategy:**
- Interval: 5 minutes (configurable via `POLL_INTERVAL_MINUTES` in `.env`)
- Each poll spawns a new Puppeteer session, reads localStorage, then closes the browser immediately
- No persistent browser process between polls

**Completion Check Algorithm:**
```
1. Read todayProblems[].id from state.json
2. Launch Puppeteer → page.goto(TUF_URL) → read localStorage
3. Build checkedIds = keys in localStorage where value === "true"
4. allDone = todayProblems.every(p => checkedIds.includes(p.id))
5. If allDone:
     a. writeState({ submissionDetected: true })
     b. clearInterval(pollingInterval)
     c. emit('submission_complete', dayNum)
6. Else: log progress (N/3 done), wait for next tick
```

**Deduplication:** Once `state.json.submissionDetected === true`, the monitor refuses to start polling (idempotent). A new poll cycle only begins after midnight resets state.

**Startup Recovery:** On agent startup, if `state.json.submissionDetected === false` and today's problems exist in state, the monitor resumes polling automatically — no re-scraping of the TUF sheet needed.

---

### 3.6 Git Automation (`src/gitAutomation.js`)

**Responsibility:** Stage all files, commit with the exact message format, and push to the configured remote. Implements retry with backoff.

**Commit Message (exact):** `"Completed Day {N}/45 of the SDE Sheet Challenge."`

**Git Operations Sequence:**
```javascript
const git = simpleGit(SDE_SHEET_PATH);
await git.add('.');                                    // Stage all
await git.commit(`Completed Day ${N}/45 of the SDE Sheet Challenge.`);  // Commit
await git.push(GIT_REMOTE, GIT_BRANCH);               // Push
```

**Retry Policy:**

| Attempt | Delay Before Retry |
|---------|-------------------|
| 1 → 2   | 5 seconds |
| 2 → 3   | 15 seconds |
| 3 (final fail) | Notify user; throw error |

**Failure Notification:** "❌ Git Push Failed — Check SSH keys or internet connection. Please push manually: `git push origin main`"

---

### 3.7 LinkedIn Post Module (`src/linkedinPost.js`)

**Responsibility:** Generate post content via Claude API, format it with Unicode bold, and publish via LinkedIn UGC Posts API.

#### Sub-module A — Content Generator

**Input:** `{ dayNum, problems: [{name, difficulty}] }`

**Claude API Call:**
- Model: `claude-sonnet-4-6`
- Max tokens: 1000
- System context: instructs Claude to return only raw JSON (no markdown fences)
- Response schema:
```json
{
  "reflection": "2-3 sentence intro paragraph about today's key learning",
  "descriptions": ["one-liner for problem 1", "...", "..."],
  "closing": "2-3 sentences on the common pattern across today's problems"
}
```

**Fallback:** If Claude API fails, the module uses a static template with placeholder text and notifies the user to edit before posting.

#### Sub-module B — Unicode Bold Formatter

Converts ASCII letters and digits to Unicode Mathematical Bold Sans-Serif characters:
- A–Z maps to `U+1D5D4`–`U+1D5ED`
- a–z maps to `U+1D5EE`–`U+1D607`
- 0–9 maps to `U+1D7EC`–`U+1D7F5`

Non-ASCII characters (spaces, hyphens, parentheses) pass through unchanged, matching the visual style in the provided LinkedIn template.

#### Sub-module C — LinkedIn API Publisher

**Endpoint:** `POST https://api.linkedin.com/v2/ugcPosts`

**Auth:** OAuth 2.0 Bearer token (`w_member_social` + `r_liteprofile` scopes)

**Request Body:**
```json
{
  "author": "urn:li:person:{personUrn}",
  "lifecycleState": "PUBLISHED",
  "specificContent": {
    "com.linkedin.ugc.ShareContent": {
      "shareCommentary": { "text": "{FULL_POST_TEXT}" },
      "shareMediaCategory": "NONE"
    }
  },
  "visibility": {
    "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
  }
}
```

**Success Response:** HTTP 201 with `x-restli-id` header containing the post ID.

**Failure Handling:** Save post text to `fallback_post_dayN.txt`, copy text to clipboard via `clip` command, notify user.

---

### 3.8 System Tray (`src/systemTray.js`)

**Responsibility:** Provide a persistent visual indicator of agent health and manual override controls.

**Tray Icon States:**
| Icon | Status | When |
|------|--------|------|
| 🟢 | Idle | Waiting for midnight or polling quietly |
| 🔵 | Working | Any active operation (scraping, git, LinkedIn) |
| 🔴 | Error | Any operation failed; check logs |

**Context Menu Items:**
```
● [Status: 🟢 Idle]        (non-clickable label)
─────────────────────
  Force Create Today's Folder
  Force Git Commit
  Force LinkedIn Post
─────────────────────
  View Logs
  Exit
```

**Library:** `systray-v2` — spawns a lightweight native tray process; no Electron runtime required.

---

## 4. Data Flow Diagrams

### 4.1 Midnight Workflow

```
[00:00 IST — node-cron fires]
           │
           ▼
[folderManager.createDayFolders()]
    • Scans SDE_SHEET_PATH for highest Day N
    • Creates /Day {N+1}/ and /images/day {N+1}/
    • Writes state.json: { currentDay: N+1, foldersCreated: true }
           │
           ▼
[sdeSheetScraper.getTodaysProblems()]
    • Launches headless Puppeteer
    • Navigates to TUF sheet
    • Reads DOM + localStorage
    • Returns next 3 unchecked problems
    • Browser closed
           │
           ▼
[state.json updated: { todayProblems: [...] }]
           │
           ▼
[fileCreator.createJavaFiles()]
    • Creates Problem1.java, Problem2.java, Problem3.java
    • Each with boilerplate in /Day {N+1}/
    • state.json: { filesCreated: true }
           │
           ▼
[submissionMonitor.startMonitoring()]
    • Registers 5-minute interval
    • Polls TUF localStorage each tick
           │
[Every 5 minutes until completion]
```

### 4.2 Completion Workflow

```
[submissionMonitor detects all 3 checked]
           │
           ▼
[state.json: { submissionDetected: true }]
    Monitor polling stops
           │
           ▼
[gitAutomation.commitAndPush(dayNum)]
    • git add . → git commit → git push
    • Retry up to 3x on failure
    • state.json: { gitPushed: true }
           │
           ▼
[Windows Notification: "Upload screenshots to LinkedIn, then confirm"]
           │
    [User clicks Confirm]
           │
           ▼
[linkedinPost.createAndPublishPost(dayNum, todayProblems)]
    │
    ├─▶ [Claude API] → reflection + descriptions + closing JSON
    │
    ├─▶ [unicodeBold()] → bold problem names
    │
    ├─▶ [formatPost()] → assemble full post string
    │
    └─▶ [LinkedIn API /v2/ugcPosts] → HTTP 201 Published
           │
           ▼
[state.json: { linkedinPosted: true }]
[Windows Notification: "🎉 Day N Complete!"]
```

---

## 5. State Management

A single `state.json` file in the project root persists the agent's operational state between restarts and polls. This makes every operation recoverable and idempotent.

**Schema:**
```json
{
  "currentDay": 20,
  "foldersCreated": true,
  "todayProblems": [
    {
      "id": "m-coloring-problem",
      "name": "M Coloring Problem",
      "difficulty": "Medium",
      "leetcodeUrl": "https://leetcode.com/..."
    },
    { "id": "rat-in-a-maze", "name": "Rat in a Maze", "difficulty": "Medium", "leetcodeUrl": "N/A" },
    { "id": "word-break-print-all-ways", "name": "Word Break (Print All Ways)", "difficulty": "Hard", "leetcodeUrl": "N/A" }
  ],
  "filesCreated": true,
  "submissionDetected": false,
  "gitPushed": false,
  "linkedinPosted": false,
  "lastUpdated": "2026-06-27T00:00:04.213Z"
}
```

**Reset Rule:** At each midnight trigger, all boolean fields are reset to `false`, `todayProblems` is cleared, and `currentDay` is incremented. The old state is not archived (logs provide sufficient audit trail).

**Access Pattern:** All modules read and write `state.json` through the `stateManager.js` utility (never directly) to ensure atomic reads and writes.

---

## 6. File System Design

### 6.1 SDE Sheet Directory Structure (Managed by Agent)

```
D:\RISHABH\Code Playground\DSA\SDE SHEET CHALLENGE\
├── Day 1\
│   ├── Set_Matrix_Zeroes.java
│   ├── Pascal_Triangle.java
│   └── Next_Permutation.java
├── Day 2\
│   └── ...
├── ...
├── Day 20\              ← Created by agent at midnight
│   ├── M_Coloring_Problem.java     ← Scaffolded by agent
│   ├── Rat_in_a_Maze.java          ← Scaffolded by agent
│   └── Word_Break_Print_All_Ways.java  ← Scaffolded by agent
└── images\
    ├── day 1\
    ├── day 2\
    └── day 20\          ← Created by agent at midnight
```

### 6.2 Agent Project Directory

```
D:\RISHABH\Tools\sde-agent\
├── src\
│   ├── scheduler.js
│   ├── folderManager.js
│   ├── sdeSheetScraper.js
│   ├── fileCreator.js
│   ├── submissionMonitor.js
│   ├── gitAutomation.js
│   ├── linkedinPost.js
│   ├── linkedinAuth.js       ← One-time OAuth script
│   ├── systemTray.js
│   └── utils\
│       ├── logger.js
│       ├── notifier.js
│       ├── unicodeBold.js
│       └── stateManager.js
├── config\
│   └── config.js
├── logs\
│   └── agent.log             ← Winston-managed, 30-day rotation
├── puppeteer-data\           ← Isolated Chrome profile for Puppeteer
├── assets\
│   └── icon.png              ← System tray icon
├── state.json                ← Operational state
├── .env                      ← Secrets (git-ignored)
├── .gitignore
├── install-service.js        ← Windows Service installer
├── main.js
└── package.json
```

---

## 7. API Integration Specifications

### 7.1 TUF SDE Sheet

| Attribute | Value |
|-----------|-------|
| URL | `https://takeuforward.org/strivers-sde-sheet-top-coding-interview-problems/` |
| Access Method | Puppeteer (headless Chromium) |
| Authentication | None (public page) |
| Rate Limit | Self-imposed: 1 request per 5-minute poll cycle; 1 request at midnight |
| Data Location | React-rendered DOM + `window.localStorage` |

### 7.2 Anthropic Claude API

| Attribute | Value |
|-----------|-------|
| Endpoint | `POST https://api.anthropic.com/v1/messages` |
| Model | `claude-sonnet-4-6` |
| Max Tokens | 1000 |
| Auth Header | `x-api-key: {ANTHROPIC_API_KEY}` |
| Calls per Day | 1 (LinkedIn post generation only) |
| Response Format | Raw JSON (prompted; no markdown fences) |

### 7.3 LinkedIn API v2

| Attribute | Value |
|-----------|-------|
| Post Endpoint | `POST https://api.linkedin.com/v2/ugcPosts` |
| Profile Endpoint | `GET https://api.linkedin.com/v2/me` |
| Auth | OAuth 2.0 Bearer token |
| Required Scopes | `w_member_social`, `r_liteprofile` |
| Token Lifetime | 60 days; stored in `%USERPROFILE%\.sde-agent\linkedin_tokens.json` |
| Protocol Version Header | `X-Restli-Protocol-Version: 2.0.0` |
| Calls per Day | 1 (post creation) |

### 7.4 GitHub (via local Git)

| Attribute | Value |
|-----------|-------|
| Method | `simple-git` wrapping local `git.exe` |
| Auth | SSH key pair (recommended) or Windows Credential Manager PAT |
| Operations | `git add .`, `git commit -m "..."`, `git push origin main` |
| Working Directory | `SDE_SHEET_PATH` (the SDE Sheet repo root) |

---

## 8. Error Handling Strategy

| Error | Detection | Response |
|-------|-----------|----------|
| Folder already exists | `fs.access()` returns no error | Log warning, skip creation, return existing day number |
| TUF page timeout | Puppeteer `page.goto()` throws | Retry once after 10s; if still fails, notify user and abort step |
| TUF DOM changed (selectors broken) | `waitForSelector` throws | Log with "selector not found" context; notify user to check TUF website |
| No unchecked problems found | Empty array returned | If < 3: use what's available + notify; if 0: notify challenge may be complete |
| Git auth failure | `simple-git` throws on push | Notify user with `ssh -T git@github.com` debug instruction |
| Git merge conflict | `simple-git` throws | Abort, notify — this should never happen on a solo repo |
| Claude API error | SDK throws / HTTP error | Use static fallback template; log full error; continue to LinkedIn step |
| LinkedIn auth expired | HTTP 401 response | Notify user to run `node src/linkedinAuth.js`; save post to fallback file |
| LinkedIn publish failure | Non-201 response | Save post to `fallback_post_day{N}.txt`; copy to clipboard via `clip` command; notify |
| Agent crash | Windows Service catches exit | Auto-restart; on next launch, reads `state.json` to resume in-progress workflows |

---

## 9. Logging Specification

**Library:** Winston 3.x

**Log File:** `logs/agent.log`

**Format:** JSON, one entry per line

**Log Entry Schema:**
```json
{
  "level": "info|warn|error",
  "message": "Human-readable description",
  "module": "moduleName",
  "timestamp": "ISO-8601",
  "...": "additional context fields"
}
```

**Log Level Policy:**
- `info` — All successful operations, poll ticks, state changes
- `warn` — Idempotency skips, retries, non-fatal issues
- `error` — Exceptions, failed API calls, unrecoverable states

**Rotation:** Daily log files, max 30 days retention, max 5MB per file (managed by `winston-daily-rotate-file` or `winston`'s built-in `maxFiles`/`maxsize`).

---

## 10. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Anthropic API key | Stored in `.env`; `.env` is in `.gitignore`; never logged |
| LinkedIn client secret | Stored in `.env`; same git-ignore policy |
| LinkedIn access token | Stored in `%USERPROFILE%\.sde-agent\` (user home, not project dir); excluded from git scope |
| GitHub credentials | SSH keys stored in `~/.ssh/`; PAT stored in Windows Credential Manager via git config; `simple-git` inherits system git config |
| Puppeteer Chrome session | Uses isolated `./puppeteer-data/` user-data-dir; completely separate from the user's Chrome profile, bookmarks, and sessions |
| Log files | No secrets or API keys are ever written to logs; `state.json` contains no credentials |

---

## 11. Dependencies Summary

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "latest",
    "axios": "^1.7.0",
    "dotenv": "^16.4.0",
    "node-cron": "^3.0.0",
    "node-notifier": "^10.0.0",
    "puppeteer": "^22.0.0",
    "simple-git": "^3.27.0",
    "systray-v2": "^1.0.0",
    "winston": "^3.13.0"
  },
  "devDependencies": {
    "node-windows": "^1.0.0"
  }
}
```

> **Note:** `node-windows` is used only during setup (service installation) and is a dev/global install, not a runtime dependency.