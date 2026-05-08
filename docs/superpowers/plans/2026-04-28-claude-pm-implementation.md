# Claude PM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI-based AI project orchestrator that manages coding tasks through an automated pipeline (analyze → design → implement → review → verify) using Anthropic SDK for analysis and claude CLI for code execution.

**Architecture:** Hybrid orchestrator — Node.js daemon manages a SQLite task queue, dispatches Anthropic SDK calls for lightweight analysis/decisions, and spawns claude CLI subprocesses in git worktrees for actual coding work. Commander.js CLI provides user interface.

**Tech Stack:** Node.js (ESM), TypeScript, better-sqlite3, @anthropic-ai/sdk, commander.js, chalk, vitest

---

## File Structure

```
C:\Users\user\claude-pm\
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
│
├── src/
│   ├── index.ts                    # CLI entry (commander.js)
│   ├── commands/
│   │   ├── add.ts
│   │   ├── status.ts
│   │   ├── review.ts
│   │   ├── approve.ts
│   │   ├── reject.ts
│   │   ├── cancel.ts
│   │   ├── retry.ts
│   │   ├── log.ts
│   │   ├── config.ts
│   │   ├── preset.ts
│   │   ├── start.ts
│   │   ├── stop.ts
│   │   └── run.ts
│   │
│   ├── core/
│   │   ├── task-queue.ts
│   │   ├── pipeline-engine.ts
│   │   ├── pipeline-templates.ts
│   │   ├── worker-pool.ts
│   │   ├── analyzer.ts
│   │   ├── daemon.ts
│   │   └── preset-manager.ts
│   │
│   ├── workers/
│   │   ├── cli-runner.ts
│   │   └── prompts.ts
│   │
│   └── utils/
│       ├── db.ts
│       ├── git.ts
│       ├── logger.ts
│       ├── notify.ts
│       └── paths.ts
│
├── presets/
│   ├── default.json
│   └── mes.json
│
├── migrations/
│   └── 001-init.sql
│
├── tests/
│   ├── core/
│   │   ├── task-queue.test.ts
│   │   ├── pipeline-engine.test.ts
│   │   ├── worker-pool.test.ts
│   │   └── analyzer.test.ts
│   ├── workers/
│   │   └── cli-runner.test.ts
│   ├── utils/
│   │   ├── git.test.ts
│   │   └── db.test.ts
│   └── commands/
│       ├── add.test.ts
│       └── status.test.ts
│
└── data/                           # runtime, gitignored
    ├── claude-pm.db
    ├── daemon.pid
    └── logs/
```

---

## Phase 1: Project Scaffolding + Database

### Task 1: Initialize Project

**Files:**
- Create: `C:\Users\user\claude-pm\package.json`
- Create: `C:\Users\user\claude-pm\tsconfig.json`
- Create: `C:\Users\user\claude-pm\.env.example`
- Create: `C:\Users\user\claude-pm\.gitignore`

- [ ] **Step 1: Create project directory and initialize**

```bash
mkdir C:\Users\user\claude-pm
cd C:\Users\user\claude-pm
git init
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "claude-pm",
  "version": "0.1.0",
  "type": "module",
  "description": "AI project orchestrator using Claude",
  "bin": {
    "pm": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.52.0",
    "better-sqlite3": "^11.7.0",
    "chalk": "^5.4.1",
    "commander": "^13.1.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.10.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.3",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create .env.example**

```
ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
data/
.env
*.db
```

- [ ] **Step 6: Install dependencies**

```bash
cd C:\Users\user\claude-pm
npm install
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors (no source files yet, clean exit)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: initialize claude-pm project"
```

---

### Task 2: SQLite Database Layer

**Files:**
- Create: `src/utils/paths.ts`
- Create: `src/utils/db.ts`
- Create: `migrations/001-init.sql`
- Test: `tests/utils/db.test.ts`

- [ ] **Step 1: Create paths utility**

```typescript
// src/utils/paths.ts
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '../..');

export function getDataDir(): string {
  const dir = path.join(PROJECT_ROOT, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'claude-pm.db');
}

export function getMigrationsDir(): string {
  return path.join(PROJECT_ROOT, 'migrations');
}

export function getPresetsDir(): string {
  return path.join(PROJECT_ROOT, 'presets');
}
```

- [ ] **Step 2: Create migration SQL**

```sql
-- migrations/001-init.sql
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  status      TEXT NOT NULL DEFAULT 'QUEUED',
  complexity  TEXT,
  description TEXT NOT NULL,
  pipeline    TEXT,
  current_step TEXT,
  branch      TEXT,
  project     TEXT NOT NULL,
  preset      TEXT,
  result      TEXT,
  error       TEXT,
  retries     INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id),
  step       TEXT NOT NULL,
  role       TEXT NOT NULL,
  input      TEXT,
  output     TEXT,
  duration   INTEGER,
  tokens     INTEGER,
  status     TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

- [ ] **Step 3: Write failing test for db initialization**

```typescript
// tests/utils/db.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getDatabase, closeDatabase } from '../../src/utils/db.js';

const TEST_DB = path.join(import.meta.dirname, '../../data/test.db');

afterEach(() => {
  closeDatabase();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

describe('Database', () => {
  it('should initialize with schema', () => {
    const db = getDatabase(TEST_DB);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('tasks');
    expect(names).toContain('task_logs');
    expect(names).toContain('config');
  });

  it('should insert and retrieve a task', () => {
    const db = getDatabase(TEST_DB);
    const stmt = db.prepare(
      'INSERT INTO tasks (description, project) VALUES (?, ?)'
    );
    const result = stmt.run('test task', '/tmp/project');
    expect(result.lastInsertRowid).toBe(1);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(1) as any;
    expect(task.description).toBe('test task');
    expect(task.status).toBe('QUEUED');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run tests/utils/db.test.ts
```

Expected: FAIL — `getDatabase` not found

- [ ] **Step 5: Implement db.ts**

```typescript
// src/utils/db.ts
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { getDbPath, getMigrationsDir } from './paths.js';

let db: Database.Database | null = null;

export function getDatabase(dbPath?: string): Database.Database {
  if (db) return db;

  const resolvedPath = dbPath ?? getDbPath();
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function runMigrations(database: Database.Database): void {
  const migrationsDir = getMigrationsDir();
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    database.exec(sql);
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run tests/utils/db.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add SQLite database layer with migrations"
```

---

### Task 3: TaskQueue

**Files:**
- Create: `src/core/task-queue.ts`
- Test: `tests/core/task-queue.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/task-queue.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TaskQueue } from '../../src/core/task-queue.js';
import { closeDatabase } from '../../src/utils/db.js';

const TEST_DB = path.join(import.meta.dirname, '../../data/test-queue.db');
let queue: TaskQueue;

beforeEach(() => {
  queue = new TaskQueue(TEST_DB);
});

afterEach(() => {
  closeDatabase();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

describe('TaskQueue', () => {
  it('should add a task and return its id', () => {
    const id = queue.add('fix login bug', '/tmp/project');
    expect(id).toBe(1);
  });

  it('should list all tasks', () => {
    queue.add('task one', '/tmp/project');
    queue.add('task two', '/tmp/project');
    const tasks = queue.list();
    expect(tasks).toHaveLength(2);
    expect(tasks[0].status).toBe('QUEUED');
  });

  it('should get a task by id', () => {
    const id = queue.add('specific task', '/tmp/project', 'mes');
    const task = queue.get(id);
    expect(task).not.toBeNull();
    expect(task!.description).toBe('specific task');
    expect(task!.preset).toBe('mes');
  });

  it('should update task status', () => {
    const id = queue.add('task', '/tmp/project');
    queue.updateStatus(id, 'ANALYZE');
    const task = queue.get(id);
    expect(task!.status).toBe('ANALYZE');
  });

  it('should update task fields', () => {
    const id = queue.add('task', '/tmp/project');
    queue.update(id, {
      complexity: 'MEDIUM',
      pipeline: JSON.stringify([{ name: 'DESIGN' }, { name: 'IMPLEMENT' }]),
      branch: 'pm/task-1',
    });
    const task = queue.get(id);
    expect(task!.complexity).toBe('MEDIUM');
    expect(task!.branch).toBe('pm/task-1');
  });

  it('should get queued tasks', () => {
    queue.add('task1', '/tmp/project');
    queue.add('task2', '/tmp/project');
    const id3 = queue.add('task3', '/tmp/project');
    queue.updateStatus(id3, 'RUNNING');
    const queued = queue.getByStatus('QUEUED');
    expect(queued).toHaveLength(2);
  });

  it('should add and retrieve logs', () => {
    const id = queue.add('task', '/tmp/project');
    queue.addLog(id, {
      step: 'ANALYZE',
      role: 'SDK_ANALYZER',
      output: 'SIMPLE',
      status: 'SUCCESS',
      duration: 2,
    });
    const logs = queue.getLogs(id);
    expect(logs).toHaveLength(1);
    expect(logs[0].step).toBe('ANALYZE');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/core/task-queue.test.ts
```

Expected: FAIL — `TaskQueue` not found

- [ ] **Step 3: Implement TaskQueue**

```typescript
// src/core/task-queue.ts
import { getDatabase } from '../utils/db.js';
import type Database from 'better-sqlite3';

export interface Task {
  id: number;
  status: string;
  complexity: string | null;
  description: string;
  pipeline: string | null;
  current_step: string | null;
  branch: string | null;
  project: string;
  preset: string | null;
  result: string | null;
  error: string | null;
  retries: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
}

export interface TaskLog {
  id: number;
  task_id: number;
  step: string;
  role: string;
  input: string | null;
  output: string | null;
  duration: number | null;
  tokens: number | null;
  status: string;
  created_at: string;
}

export interface TaskUpdate {
  status?: string;
  complexity?: string;
  pipeline?: string;
  current_step?: string;
  branch?: string;
  result?: string;
  error?: string;
  retries?: number;
}

export interface LogEntry {
  step: string;
  role: string;
  input?: string;
  output?: string;
  duration?: number;
  tokens?: number;
  status: string;
}

export class TaskQueue {
  private db: Database.Database;

  constructor(dbPath?: string) {
    this.db = getDatabase(dbPath);
  }

  add(description: string, project: string, preset?: string): number {
    const stmt = this.db.prepare(
      'INSERT INTO tasks (description, project, preset) VALUES (?, ?, ?)'
    );
    const result = stmt.run(description, project, preset ?? null);
    return Number(result.lastInsertRowid);
  }

  get(id: number): Task | null {
    return this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | null;
  }

  list(): Task[] {
    return this.db.prepare('SELECT * FROM tasks ORDER BY id DESC').all() as Task[];
  }

  getByStatus(status: string): Task[] {
    return this.db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY id ASC').all(status) as Task[];
  }

  updateStatus(id: number, status: string): void {
    this.db.prepare(
      "UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(status, id);
  }

  update(id: number, fields: TaskUpdate): void {
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;

    const sets = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = entries.map(([, v]) => v);

    this.db.prepare(
      `UPDATE tasks SET ${sets}, updated_at = datetime('now') WHERE id = ?`
    ).run(...values, id);
  }

  addLog(taskId: number, entry: LogEntry): void {
    this.db.prepare(
      `INSERT INTO task_logs (task_id, step, role, input, output, duration, tokens, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      taskId, entry.step, entry.role,
      entry.input ?? null, entry.output ?? null,
      entry.duration ?? null, entry.tokens ?? null,
      entry.status
    );
  }

  getLogs(taskId: number): TaskLog[] {
    return this.db.prepare(
      'SELECT * FROM task_logs WHERE task_id = ? ORDER BY id ASC'
    ).all(taskId) as TaskLog[];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/core/task-queue.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add TaskQueue with SQLite storage"
```

---

## Phase 2: CLI Foundation

### Task 4: Logger Utility

**Files:**
- Create: `src/utils/logger.ts`

- [ ] **Step 1: Implement logger**

```typescript
// src/utils/logger.ts
import chalk from 'chalk';

const STATUS_COLORS: Record<string, (s: string) => string> = {
  QUEUED:  chalk.gray,
  ANALYZE: chalk.cyan,
  WAITING: chalk.yellow,
  RUNNING: chalk.blue,
  REVIEW:  chalk.magenta,
  DONE:    chalk.green,
  FAILED:  chalk.red,
  CANCELLED: chalk.gray,
};

export function formatStatus(status: string): string {
  const colorFn = STATUS_COLORS[status] ?? chalk.white;
  return colorFn(status.padEnd(8));
}

export function formatTaskRow(task: {
  id: number;
  description: string;
  status: string;
  complexity?: string | null;
}): string {
  const id = chalk.dim(`#${task.id}`.padEnd(5));
  const desc = task.description.split('\n')[0].slice(0, 50);
  const status = formatStatus(task.status);
  const badge = task.status === 'WAITING' || task.status === 'REVIEW'
    ? chalk.yellow(' ⚠')
    : '';
  const complexity = task.complexity ? chalk.dim(` [${task.complexity}]`) : '';
  return `  ${id} ${desc.padEnd(52)} ${status}${badge}${complexity}`;
}

export const log = {
  info: (msg: string) => console.log(chalk.blue('ℹ'), msg),
  success: (msg: string) => console.log(chalk.green('✓'), msg),
  warn: (msg: string) => console.log(chalk.yellow('⚠'), msg),
  error: (msg: string) => console.error(chalk.red('✗'), msg),
};
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add logger utility with colored output"
```

---

### Task 5: CLI Entry + `add` Command

**Files:**
- Create: `src/index.ts`
- Create: `src/commands/add.ts`
- Test: `tests/commands/add.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/commands/add.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TaskQueue } from '../../src/core/task-queue.js';
import { handleAdd } from '../../src/commands/add.js';
import { closeDatabase } from '../../src/utils/db.js';

const TEST_DB = path.join(import.meta.dirname, '../../data/test-add.db');

afterEach(() => {
  closeDatabase();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

describe('add command', () => {
  it('should create a task with description and project', () => {
    const queue = new TaskQueue(TEST_DB);
    const id = handleAdd(queue, 'fix bug', { project: '/tmp/project' });
    expect(id).toBe(1);
    const task = queue.get(1);
    expect(task!.description).toBe('fix bug');
    expect(task!.project).toBe('/tmp/project');
  });

  it('should use preset if provided', () => {
    const queue = new TaskQueue(TEST_DB);
    const id = handleAdd(queue, 'fix bug', { project: '/tmp/project', preset: 'mes' });
    const task = queue.get(id);
    expect(task!.preset).toBe('mes');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/commands/add.test.ts
```

Expected: FAIL — `handleAdd` not found

- [ ] **Step 3: Implement add command**

```typescript
// src/commands/add.ts
import { TaskQueue } from '../core/task-queue.js';
import { log } from '../utils/logger.js';

interface AddOptions {
  project: string;
  preset?: string;
}

export function handleAdd(queue: TaskQueue, description: string, opts: AddOptions): number {
  const id = queue.add(description, opts.project, opts.preset);
  log.success(`Task #${id} created (QUEUED)`);
  return id;
}
```

- [ ] **Step 4: Implement CLI entry**

```typescript
// src/index.ts
#!/usr/bin/env node
import { Command } from 'commander';
import { TaskQueue } from './core/task-queue.js';
import { handleAdd } from './commands/add.js';

const program = new Command();

program
  .name('pm')
  .description('AI project orchestrator using Claude')
  .version('0.1.0');

function getQueue(): TaskQueue {
  return new TaskQueue();
}

program
  .command('add')
  .description('Add a new task')
  .argument('<description>', 'Task description (supports multi-line in quotes)')
  .option('-p, --project <path>', 'Target project path', process.cwd())
  .option('--preset <name>', 'Preset to use')
  .action((description: string, opts: { project: string; preset?: string }) => {
    const queue = getQueue();
    handleAdd(queue, description, opts);
  });

program.parse();
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/commands/add.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 6: Test CLI manually**

```bash
cd C:\Users\user\claude-pm
npx tsx src/index.ts add "test task" -p C:\Users\user\dongsan_mes
```

Expected: `✓ Task #1 created (QUEUED)`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add CLI entry and 'add' command"
```

---

### Task 6: `status` Command

**Files:**
- Create: `src/commands/status.ts`
- Modify: `src/index.ts`
- Test: `tests/commands/status.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/commands/status.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TaskQueue } from '../../src/core/task-queue.js';
import { getStatusOutput, getDetailOutput } from '../../src/commands/status.js';
import { closeDatabase } from '../../src/utils/db.js';

const TEST_DB = path.join(import.meta.dirname, '../../data/test-status.db');

afterEach(() => {
  closeDatabase();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

describe('status command', () => {
  it('should return empty message when no tasks', () => {
    const queue = new TaskQueue(TEST_DB);
    const output = getStatusOutput(queue);
    expect(output).toContain('No tasks');
  });

  it('should list all tasks', () => {
    const queue = new TaskQueue(TEST_DB);
    queue.add('task one', '/tmp');
    queue.add('task two', '/tmp');
    const output = getStatusOutput(queue);
    expect(output).toContain('#1');
    expect(output).toContain('#2');
    expect(output).toContain('task one');
  });

  it('should show detail for specific task', () => {
    const queue = new TaskQueue(TEST_DB);
    queue.add('detailed task', '/tmp/project');
    queue.update(1, { complexity: 'MEDIUM', branch: 'pm/task-1' });
    const output = getDetailOutput(queue, 1);
    expect(output).toContain('detailed task');
    expect(output).toContain('MEDIUM');
    expect(output).toContain('pm/task-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/commands/status.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement status command**

```typescript
// src/commands/status.ts
import chalk from 'chalk';
import { TaskQueue, type Task } from '../core/task-queue.js';
import { formatTaskRow } from '../utils/logger.js';

export function getStatusOutput(queue: TaskQueue): string {
  const tasks = queue.list();
  if (tasks.length === 0) return chalk.dim('  No tasks yet. Use `pm add` to create one.');

  const lines = [chalk.bold('  Tasks:'), ''];
  for (const task of tasks) {
    lines.push(formatTaskRow(task));
  }
  return lines.join('\n');
}

export function getDetailOutput(queue: TaskQueue, id: number): string {
  const task = queue.get(id);
  if (!task) return chalk.red(`  Task #${id} not found`);

  const logs = queue.getLogs(id);
  const lines = [
    chalk.bold(`  Task #${task.id}`),
    '',
    `  Description:  ${task.description}`,
    `  Status:       ${task.status}`,
    `  Complexity:   ${task.complexity ?? 'pending'}`,
    `  Project:      ${task.project}`,
    `  Branch:       ${task.branch ?? 'none'}`,
    `  Preset:       ${task.preset ?? 'default'}`,
    `  Created:      ${task.created_at}`,
  ];

  if (task.error) {
    lines.push(`  Error:        ${chalk.red(task.error)}`);
  }

  if (logs.length > 0) {
    lines.push('', chalk.bold('  Pipeline Log:'));
    for (const entry of logs) {
      const icon = entry.status === 'SUCCESS' ? chalk.green('✓') :
                   entry.status === 'FAILED' ? chalk.red('✗') : chalk.gray('○');
      const dur = entry.duration ? chalk.dim(` (${entry.duration}s)`) : '';
      lines.push(`    ${icon} ${entry.step} — ${entry.role}${dur}`);
    }
  }

  return lines.join('\n');
}

export function handleStatus(queue: TaskQueue, id?: number): void {
  if (id) {
    console.log(getDetailOutput(queue, id));
  } else {
    console.log(getStatusOutput(queue));
  }
}
```

- [ ] **Step 4: Register in CLI entry**

Add to `src/index.ts` after the `add` command:

```typescript
import { handleStatus } from './commands/status.js';

program
  .command('status')
  .description('Show task status')
  .argument('[id]', 'Task ID for detail view')
  .action((id?: string) => {
    const queue = getQueue();
    handleStatus(queue, id ? parseInt(id, 10) : undefined);
  });
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/commands/status.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add 'status' command with list and detail views"
```

---

## Phase 3: Analyzer (Anthropic SDK)

### Task 7: Analyzer

**Files:**
- Create: `src/core/analyzer.ts`
- Test: `tests/core/analyzer.test.ts`

- [ ] **Step 1: Write failing test (mocked SDK)**

```typescript
// tests/core/analyzer.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Analyzer } from '../../src/core/analyzer.js';

// Mock the SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'SIMPLE' }],
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
      };
    },
  };
});

describe('Analyzer', () => {
  it('should analyze complexity', async () => {
    const analyzer = new Analyzer();
    const result = await analyzer.analyzeComplexity('fix a typo in login page');
    expect(['SIMPLE', 'MEDIUM', 'COMPLEX']).toContain(result.complexity);
  });

  it('should return pipeline for complexity', async () => {
    const analyzer = new Analyzer();
    const result = await analyzer.analyzeComplexity('fix a typo');
    expect(result.pipeline).toBeDefined();
    expect(Array.isArray(result.pipeline)).toBe(true);
    expect(result.pipeline.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/analyzer.test.ts
```

Expected: FAIL — `Analyzer` not found

- [ ] **Step 3: Create pipeline templates**

```typescript
// src/core/pipeline-templates.ts
export interface PipelineStep {
  name: string;
  executor: 'sdk' | 'cli';
  model: 'opus' | 'sonnet' | 'haiku';
  timeout: number;
  waitForApproval?: boolean;
  conditional?: boolean;
  retryable?: boolean;
}

export type Complexity = 'SIMPLE' | 'MEDIUM' | 'COMPLEX';

export const PIPELINES: Record<Complexity, PipelineStep[]> = {
  SIMPLE: [
    { name: 'IMPLEMENT', executor: 'cli', model: 'sonnet', timeout: 600, retryable: true },
    { name: 'VERIFY',    executor: 'cli', model: 'sonnet', timeout: 120 },
  ],
  MEDIUM: [
    { name: 'DESIGN',    executor: 'cli', model: 'sonnet', timeout: 300, waitForApproval: true },
    { name: 'IMPLEMENT', executor: 'cli', model: 'sonnet', timeout: 600, retryable: true },
    { name: 'REVIEW',    executor: 'cli', model: 'haiku',  timeout: 180 },
    { name: 'VERIFY',    executor: 'cli', model: 'sonnet', timeout: 120 },
  ],
  COMPLEX: [
    { name: 'DESIGN',        executor: 'cli', model: 'opus',   timeout: 600, waitForApproval: true },
    { name: 'DESIGN_REVIEW', executor: 'cli', model: 'sonnet', timeout: 300 },
    { name: 'IMPLEMENT',     executor: 'cli', model: 'sonnet', timeout: 900, retryable: true },
    { name: 'REVIEW',        executor: 'cli', model: 'haiku',  timeout: 300 },
    { name: 'FIX',           executor: 'cli', model: 'sonnet', timeout: 600, conditional: true },
    { name: 'VERIFY',        executor: 'cli', model: 'sonnet', timeout: 120 },
  ],
};
```

- [ ] **Step 4: Implement Analyzer**

```typescript
// src/core/analyzer.ts
import Anthropic from '@anthropic-ai/sdk';
import { PIPELINES, type Complexity, type PipelineStep } from './pipeline-templates.js';

interface AnalysisResult {
  complexity: Complexity;
  pipeline: PipelineStep[];
  reasoning: string;
}

interface ReviewEvaluation {
  pass: boolean;
  issues: string[];
}

export class Analyzer {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  async analyzeComplexity(
    description: string,
    context?: string,
  ): Promise<AnalysisResult> {
    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Classify this coding task complexity as exactly one of: SIMPLE, MEDIUM, COMPLEX.

Rules:
- SIMPLE: bug fix, typo, single-file change, clear instruction
- MEDIUM: new feature, 2-5 files, involves API + frontend
- COMPLEX: large feature, structural change, 6+ files, cross-cutting

${context ? `Project context: ${context}\n` : ''}
Task: ${description}

Respond with ONLY the word: SIMPLE, MEDIUM, or COMPLEX`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    const complexity = (['SIMPLE', 'MEDIUM', 'COMPLEX'].includes(text) ? text : 'MEDIUM') as Complexity;

    return {
      complexity,
      pipeline: PIPELINES[complexity],
      reasoning: text,
    };
  }

  async evaluateReview(reviewText: string): Promise<ReviewEvaluation> {
    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Evaluate this code review. Are there blocking issues that require fixes?

Review:
${reviewText}

Respond in JSON format:
{"pass": true/false, "issues": ["issue1", "issue2"]}`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    try {
      return JSON.parse(text);
    } catch {
      return { pass: true, issues: [] };
    }
  }

  async summarize(description: string, logs: string): Promise<string> {
    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Summarize this completed task in 2-3 sentences for the developer to review.

Task: ${description}
Execution log: ${logs}

Write a concise summary in Korean.`,
      }],
    });

    return response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/core/analyzer.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Analyzer with Anthropic SDK for complexity analysis"
```

---

## Phase 4: Git Utilities + CLI Runner

### Task 8: Git Utilities

**Files:**
- Create: `src/utils/git.ts`
- Test: `tests/utils/git.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/utils/git.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createWorktree, removeWorktree, mergeBranch } from '../../src/utils/git.js';

const TEMP_REPO = path.join(os.tmpdir(), 'claude-pm-test-repo');

beforeAll(() => {
  if (fs.existsSync(TEMP_REPO)) fs.rmSync(TEMP_REPO, { recursive: true });
  fs.mkdirSync(TEMP_REPO, { recursive: true });
  execSync('git init', { cwd: TEMP_REPO });
  execSync('git config user.email "test@test.com"', { cwd: TEMP_REPO });
  execSync('git config user.name "Test"', { cwd: TEMP_REPO });
  fs.writeFileSync(path.join(TEMP_REPO, 'README.md'), '# Test');
  execSync('git add -A && git commit -m "init"', { cwd: TEMP_REPO });
});

afterAll(() => {
  if (fs.existsSync(TEMP_REPO)) fs.rmSync(TEMP_REPO, { recursive: true, force: true });
});

describe('Git utilities', () => {
  it('should create a worktree', () => {
    const worktreePath = createWorktree(TEMP_REPO, 1);
    expect(fs.existsSync(worktreePath)).toBe(true);
    // Clean up
    removeWorktree(TEMP_REPO, 1);
  });

  it('should remove a worktree', () => {
    const worktreePath = createWorktree(TEMP_REPO, 2);
    removeWorktree(TEMP_REPO, 2);
    expect(fs.existsSync(worktreePath)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/utils/git.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement git utilities**

```typescript
// src/utils/git.ts
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

function exec(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

export function createWorktree(projectPath: string, taskId: number): string {
  const worktreeDir = path.join(projectPath, '.worktrees', `task-${taskId}`);
  const branch = `pm/task-${taskId}`;

  if (fs.existsSync(worktreeDir)) {
    removeWorktree(projectPath, taskId);
  }

  exec(`git worktree add "${worktreeDir}" -b ${branch}`, projectPath);
  return worktreeDir;
}

export function removeWorktree(projectPath: string, taskId: number): void {
  const worktreeDir = path.join(projectPath, '.worktrees', `task-${taskId}`);
  const branch = `pm/task-${taskId}`;

  try {
    exec(`git worktree remove "${worktreeDir}" --force`, projectPath);
  } catch {
    if (fs.existsSync(worktreeDir)) {
      fs.rmSync(worktreeDir, { recursive: true, force: true });
    }
    try { exec('git worktree prune', projectPath); } catch { /* ignore */ }
  }

  try { exec(`git branch -D ${branch}`, projectPath); } catch { /* branch may not exist */ }
}

export function mergeBranch(projectPath: string, taskId: number): { success: boolean; message: string } {
  const branch = `pm/task-${taskId}`;
  try {
    const result = exec(`git merge ${branch} --no-ff -m "pm: merge task #${taskId}"`, projectPath);
    return { success: true, message: result };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

export function getDiff(projectPath: string, taskId: number): string {
  const branch = `pm/task-${taskId}`;
  try {
    return exec(`git diff main...${branch} --stat`, projectPath);
  } catch {
    return exec(`git log ${branch} --oneline -5`, projectPath);
  }
}

export function getDiffFull(projectPath: string, taskId: number): string {
  const branch = `pm/task-${taskId}`;
  try {
    return exec(`git diff main...${branch}`, projectPath);
  } catch {
    return '';
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/utils/git.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add git worktree utilities"
```

---

### Task 9: CLI Runner + Prompt Templates

**Files:**
- Create: `src/workers/prompts.ts`
- Create: `src/workers/cli-runner.ts`
- Test: `tests/workers/cli-runner.test.ts`

- [ ] **Step 1: Create prompt templates**

```typescript
// src/workers/prompts.ts
export interface PromptContext {
  taskId: number;
  description: string;
  project: string;
  preset?: {
    systemPrompt?: string;
    verify?: string;
    conventions?: Record<string, string>;
  };
  previousOutput?: string;
}

export function buildPrompt(step: string, ctx: PromptContext): string {
  const base = ctx.preset?.systemPrompt
    ? `Project context: ${ctx.preset.systemPrompt}\n\n`
    : '';

  switch (step) {
    case 'DESIGN':
      return `${base}You are designing a solution for this task. Write a concise design document.

Task: ${ctx.description}

Write a design that covers:
1. What changes are needed and which files to modify
2. Implementation approach
3. Edge cases to handle

Save the design to a file: .pm/task-${ctx.taskId}-design.md
Be concise. No boilerplate.`;

    case 'DESIGN_REVIEW':
      return `${base}Review this design for issues, gaps, or risks.

Task: ${ctx.description}

Read the design at .pm/task-${ctx.taskId}-design.md and write your review.
Focus on: missing edge cases, incorrect assumptions, better alternatives.
Save review to: .pm/task-${ctx.taskId}-design-review.md`;

    case 'IMPLEMENT':
      return `${base}Implement this task. ${ctx.previousOutput ? `Follow this design:\n${ctx.previousOutput}\n\n` : ''}
Task: ${ctx.description}

Rules:
- Make the minimal changes needed
- Run the build/typecheck command after implementation: ${ctx.preset?.verify ?? 'npm run build'}
- If typecheck fails, fix the errors
- Commit your changes with a descriptive message`;

    case 'REVIEW':
      return `${base}Review the code changes made for this task. Check for:
- Bugs or logic errors
- Security issues
- Missing error handling at system boundaries
- Consistency with existing code patterns

Task: ${ctx.description}

Run: git diff main...HEAD
Write your review findings. Be specific about what needs to change, if anything.`;

    case 'FIX':
      return `${base}Fix the issues found in code review.

Task: ${ctx.description}
Review feedback: ${ctx.previousOutput}

Fix each issue, then run: ${ctx.preset?.verify ?? 'npm run build'}
Commit the fixes.`;

    case 'VERIFY':
      return `${base}Run final verification for this task.

Run these commands and report results:
${ctx.preset?.verify ?? 'npm run build'}

If any command fails, try to fix the issue and re-run.
Report: PASS if all commands succeed, FAIL if unfixable issues remain.`;

    default:
      return `${base}Execute step "${step}" for task: ${ctx.description}`;
  }
}
```

- [ ] **Step 2: Write failing test for CLI Runner**

```typescript
// tests/workers/cli-runner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildCliArgs } from '../../src/workers/cli-runner.js';

describe('CLI Runner', () => {
  it('should build correct CLI arguments', () => {
    const args = buildCliArgs({
      prompt: 'implement this feature',
      model: 'sonnet',
      projectPath: '/tmp/project',
      maxBudget: 1.0,
    });

    expect(args).toContain('-p');
    expect(args).toContain('implement this feature');
    expect(args).toContain('--model');
    expect(args).toContain('sonnet');
    expect(args).toContain('--output-format');
    expect(args).toContain('json');
  });

  it('should include project path as add-dir', () => {
    const args = buildCliArgs({
      prompt: 'test',
      model: 'sonnet',
      projectPath: '/tmp/project',
    });

    expect(args).toContain('--add-dir');
    expect(args).toContain('/tmp/project');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/workers/cli-runner.test.ts
```

Expected: FAIL

- [ ] **Step 4: Implement CLI Runner**

```typescript
// src/workers/cli-runner.ts
import { spawn, type ChildProcess } from 'node:child_process';
import { log } from '../utils/logger.js';

export interface CliOptions {
  prompt: string;
  model: 'opus' | 'sonnet' | 'haiku';
  projectPath: string;
  maxBudget?: number;
  timeout?: number;
  allowedTools?: string[];
}

export interface CliResult {
  success: boolean;
  output: string;
  duration: number;
  exitCode: number | null;
}

const MODEL_MAP: Record<string, string> = {
  opus: 'opus',
  sonnet: 'sonnet',
  haiku: 'haiku',
};

export function buildCliArgs(opts: CliOptions): string[] {
  const args: string[] = [
    '-p', opts.prompt,
    '--model', MODEL_MAP[opts.model] ?? opts.model,
    '--print',
    '--output-format', 'json',
    '--add-dir', opts.projectPath,
  ];

  if (opts.maxBudget) {
    args.push('--max-budget-usd', opts.maxBudget.toString());
  }

  if (opts.allowedTools) {
    args.push('--allowedTools', opts.allowedTools.join(' '));
  }

  return args;
}

export function runCli(opts: CliOptions): { process: ChildProcess; result: Promise<CliResult> } {
  const args = buildCliArgs(opts);
  const startTime = Date.now();

  const child = spawn('claude', args, {
    cwd: opts.projectPath,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  let stdout = '';
  let stderr = '';

  child.stdout?.on('data', (data: Buffer) => {
    stdout += data.toString();
  });

  child.stderr?.on('data', (data: Buffer) => {
    stderr += data.toString();
  });

  const result = new Promise<CliResult>((resolve) => {
    const timer = opts.timeout
      ? setTimeout(() => {
          child.kill('SIGTERM');
          resolve({
            success: false,
            output: `Timeout after ${opts.timeout}s\n${stdout}\n${stderr}`,
            duration: Math.round((Date.now() - startTime) / 1000),
            exitCode: null,
          });
        }, opts.timeout * 1000)
      : null;

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const duration = Math.round((Date.now() - startTime) / 1000);
      resolve({
        success: code === 0,
        output: stdout || stderr,
        duration,
        exitCode: code,
      });
    });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      resolve({
        success: false,
        output: `Process error: ${err.message}`,
        duration: Math.round((Date.now() - startTime) / 1000),
        exitCode: null,
      });
    });
  });

  return { process: child, result };
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/workers/cli-runner.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add CLI runner and prompt templates"
```

---

## Phase 5: Pipeline Engine

### Task 10: Pipeline Engine

**Files:**
- Create: `src/core/pipeline-engine.ts`
- Test: `tests/core/pipeline-engine.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/pipeline-engine.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PipelineEngine } from '../../src/core/pipeline-engine.js';
import { TaskQueue } from '../../src/core/task-queue.js';
import { closeDatabase } from '../../src/utils/db.js';

const TEST_DB = path.join(import.meta.dirname, '../../data/test-pipeline.db');

// Mock cli-runner
vi.mock('../../src/workers/cli-runner.js', () => ({
  runCli: vi.fn().mockReturnValue({
    process: { kill: vi.fn() },
    result: Promise.resolve({
      success: true,
      output: 'implementation done',
      duration: 10,
      exitCode: 0,
    }),
  }),
  buildCliArgs: vi.fn().mockReturnValue([]),
}));

// Mock analyzer
vi.mock('../../src/core/analyzer.js', () => ({
  Analyzer: class {
    analyzeComplexity = vi.fn().mockResolvedValue({
      complexity: 'SIMPLE',
      pipeline: [
        { name: 'IMPLEMENT', executor: 'cli', model: 'sonnet', timeout: 600 },
        { name: 'VERIFY', executor: 'cli', model: 'sonnet', timeout: 120 },
      ],
      reasoning: 'SIMPLE',
    });
    evaluateReview = vi.fn().mockResolvedValue({ pass: true, issues: [] });
    summarize = vi.fn().mockResolvedValue('Task completed successfully.');
  },
}));

// Mock git
vi.mock('../../src/utils/git.js', () => ({
  createWorktree: vi.fn().mockReturnValue('/tmp/worktree'),
  removeWorktree: vi.fn(),
  mergeBranch: vi.fn().mockReturnValue({ success: true, message: 'merged' }),
  getDiff: vi.fn().mockReturnValue('1 file changed'),
  getDiffFull: vi.fn().mockReturnValue(''),
}));

let queue: TaskQueue;
let engine: PipelineEngine;

beforeEach(() => {
  queue = new TaskQueue(TEST_DB);
  engine = new PipelineEngine(queue);
});

afterEach(() => {
  closeDatabase();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

describe('PipelineEngine', () => {
  it('should analyze a queued task and set pipeline', async () => {
    const id = queue.add('fix bug', '/tmp/project');
    await engine.analyzeTask(id);
    const task = queue.get(id);
    expect(task!.complexity).toBe('SIMPLE');
    expect(task!.pipeline).not.toBeNull();
    expect(task!.status).toBe('RUNNING');
  });

  it('should execute next step of a running task', async () => {
    const id = queue.add('fix bug', '/tmp/project');
    await engine.analyzeTask(id);
    await engine.executeNextStep(id);
    const task = queue.get(id);
    const logs = queue.getLogs(id);
    expect(logs.length).toBeGreaterThan(0);
  });

  it('should transition to REVIEW when pipeline is complete', async () => {
    const id = queue.add('fix bug', '/tmp/project');
    await engine.analyzeTask(id);

    // Execute all steps
    let task = queue.get(id);
    while (task && task.status === 'RUNNING') {
      await engine.executeNextStep(id);
      task = queue.get(id);
    }

    expect(task!.status).toBe('REVIEW');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/pipeline-engine.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement PipelineEngine**

```typescript
// src/core/pipeline-engine.ts
import { TaskQueue, type Task } from './task-queue.js';
import { Analyzer } from './analyzer.js';
import { type PipelineStep } from './pipeline-templates.js';
import { runCli } from '../workers/cli-runner.js';
import { buildPrompt, type PromptContext } from '../workers/prompts.js';
import { createWorktree, removeWorktree } from '../utils/git.js';
import { log } from '../utils/logger.js';

export class PipelineEngine {
  private queue: TaskQueue;
  private analyzer: Analyzer;

  constructor(queue: TaskQueue) {
    this.queue = queue;
    this.analyzer = new Analyzer();
  }

  async analyzeTask(taskId: number): Promise<void> {
    const task = this.queue.get(taskId);
    if (!task || task.status !== 'QUEUED') return;

    this.queue.updateStatus(taskId, 'ANALYZE');
    log.info(`Task #${taskId}: Analyzing complexity...`);

    try {
      const result = await this.analyzer.analyzeComplexity(task.description);

      this.queue.update(taskId, {
        complexity: result.complexity,
        pipeline: JSON.stringify(result.pipeline),
        current_step: result.pipeline[0]?.name ?? null,
      });

      this.queue.addLog(taskId, {
        step: 'ANALYZE',
        role: 'SDK_ANALYZER',
        output: `${result.complexity}: ${result.reasoning}`,
        status: 'SUCCESS',
        duration: 0,
      });

      // Check if first step needs approval
      const firstStep = result.pipeline[0];
      if (firstStep?.waitForApproval) {
        this.queue.updateStatus(taskId, 'WAITING');
        log.warn(`Task #${taskId}: Design approval needed (${result.complexity})`);
      } else {
        // Create worktree and start running
        const worktreePath = createWorktree(task.project, taskId);
        this.queue.update(taskId, { branch: `pm/task-${taskId}` });
        this.queue.updateStatus(taskId, 'RUNNING');
        log.info(`Task #${taskId}: Starting execution (${result.complexity})`);
      }
    } catch (err) {
      this.queue.update(taskId, { error: String(err) });
      this.queue.updateStatus(taskId, 'FAILED');
      this.queue.addLog(taskId, {
        step: 'ANALYZE',
        role: 'SDK_ANALYZER',
        output: String(err),
        status: 'FAILED',
      });
    }
  }

  async executeNextStep(taskId: number): Promise<void> {
    const task = this.queue.get(taskId);
    if (!task || task.status !== 'RUNNING') return;

    const pipeline: PipelineStep[] = JSON.parse(task.pipeline ?? '[]');
    const logs = this.queue.getLogs(taskId);
    const completedSteps = logs
      .filter(l => l.status === 'SUCCESS' && l.step !== 'ANALYZE')
      .map(l => l.step);

    // Find next uncompleted step
    const nextStep = pipeline.find(s => !completedSteps.includes(s.name));
    if (!nextStep) {
      // All steps done — move to REVIEW
      this.queue.updateStatus(taskId, 'REVIEW');
      log.success(`Task #${taskId}: Pipeline complete, awaiting review`);
      return;
    }

    // Skip conditional steps if previous review passed
    if (nextStep.conditional) {
      const lastReviewLog = logs.findLast(l => l.step === 'REVIEW');
      if (lastReviewLog) {
        try {
          const evaluation = await this.analyzer.evaluateReview(lastReviewLog.output ?? '');
          if (evaluation.pass) {
            this.queue.addLog(taskId, {
              step: nextStep.name,
              role: 'SKIPPED',
              output: 'Review passed, no fixes needed',
              status: 'SUCCESS',
              duration: 0,
            });
            // Recurse to next step
            return this.executeNextStep(taskId);
          }
        } catch {
          // If evaluation fails, proceed with the fix step anyway
        }
      }
    }

    this.queue.update(taskId, { current_step: nextStep.name });
    log.info(`Task #${taskId}: Executing ${nextStep.name} (${nextStep.model})`);

    const worktreePath = `${task.project}/.worktrees/task-${taskId}`;
    const lastOutput = logs.findLast(l => l.status === 'SUCCESS')?.output ?? '';

    const promptCtx: PromptContext = {
      taskId,
      description: task.description,
      project: task.project,
      previousOutput: lastOutput,
    };

    const prompt = buildPrompt(nextStep.name, promptCtx);

    try {
      const { result } = runCli({
        prompt,
        model: nextStep.model,
        projectPath: worktreePath,
        timeout: nextStep.timeout,
        maxBudget: 2.0,
      });

      const cliResult = await result;

      this.queue.addLog(taskId, {
        step: nextStep.name,
        role: `CLI_${nextStep.model.toUpperCase()}`,
        input: prompt.slice(0, 500),
        output: cliResult.output.slice(0, 2000),
        duration: cliResult.duration,
        status: cliResult.success ? 'SUCCESS' : 'FAILED',
      });

      if (!cliResult.success) {
        const retries = task.retries + 1;
        if (nextStep.retryable && retries <= task.max_retries) {
          this.queue.update(taskId, { retries });
          log.warn(`Task #${taskId}: ${nextStep.name} failed, retrying (${retries}/${task.max_retries})`);
        } else {
          this.queue.update(taskId, { error: cliResult.output.slice(0, 1000) });
          this.queue.updateStatus(taskId, 'FAILED');
          log.error(`Task #${taskId}: ${nextStep.name} failed`);
        }
      }
    } catch (err) {
      this.queue.addLog(taskId, {
        step: nextStep.name,
        role: `CLI_${nextStep.model.toUpperCase()}`,
        output: String(err),
        status: 'FAILED',
      });
      this.queue.update(taskId, { error: String(err) });
      this.queue.updateStatus(taskId, 'FAILED');
    }
  }

  async approveTask(taskId: number): Promise<void> {
    const task = this.queue.get(taskId);
    if (!task || task.status !== 'WAITING') return;

    createWorktree(task.project, taskId);
    this.queue.update(taskId, { branch: `pm/task-${taskId}` });
    this.queue.updateStatus(taskId, 'RUNNING');
    log.success(`Task #${taskId}: Approved, starting execution`);
  }

  async rejectTask(taskId: number, feedback: string): Promise<void> {
    const task = this.queue.get(taskId);
    if (!task) return;

    if (task.status === 'REVIEW') {
      // Re-run from implementation with feedback
      this.queue.update(taskId, {
        error: null,
        current_step: 'IMPLEMENT',
        retries: 0,
      });
      this.queue.addLog(taskId, {
        step: 'REJECT',
        role: 'USER',
        output: feedback,
        status: 'SUCCESS',
      });
      this.queue.updateStatus(taskId, 'RUNNING');
      log.info(`Task #${taskId}: Rejected with feedback, re-running`);
    } else if (task.status === 'WAITING') {
      // Design rejected, re-do design
      this.queue.addLog(taskId, {
        step: 'REJECT',
        role: 'USER',
        output: feedback,
        status: 'SUCCESS',
      });
      this.queue.updateStatus(taskId, 'QUEUED');
      log.info(`Task #${taskId}: Design rejected, will re-analyze`);
    }
  }

  cancelTask(taskId: number): void {
    const task = this.queue.get(taskId);
    if (!task) return;

    try { removeWorktree(task.project, taskId); } catch { /* ignore */ }
    this.queue.updateStatus(taskId, 'CANCELLED');
    log.info(`Task #${taskId}: Cancelled`);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/core/pipeline-engine.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add PipelineEngine state machine"
```

---

## Phase 6: Worker Pool + Daemon

### Task 11: Worker Pool

**Files:**
- Create: `src/core/worker-pool.ts`
- Test: `tests/core/worker-pool.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/worker-pool.test.ts
import { describe, it, expect } from 'vitest';
import { WorkerPool } from '../../src/core/worker-pool.js';

describe('WorkerPool', () => {
  it('should respect max workers limit', () => {
    const pool = new WorkerPool(2);
    expect(pool.canAccept()).toBe(true);
    pool.register(1);
    pool.register(2);
    expect(pool.canAccept()).toBe(false);
  });

  it('should free slot when task completes', () => {
    const pool = new WorkerPool(1);
    pool.register(1);
    expect(pool.canAccept()).toBe(false);
    pool.release(1);
    expect(pool.canAccept()).toBe(true);
  });

  it('should track active task ids', () => {
    const pool = new WorkerPool(3);
    pool.register(1);
    pool.register(5);
    expect(pool.getActiveTaskIds()).toEqual([1, 5]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/worker-pool.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement WorkerPool**

```typescript
// src/core/worker-pool.ts
import type { ChildProcess } from 'node:child_process';

export class WorkerPool {
  private maxWorkers: number;
  private active: Map<number, ChildProcess | null> = new Map();

  constructor(maxWorkers: number = 3) {
    this.maxWorkers = maxWorkers;
  }

  canAccept(): boolean {
    return this.active.size < this.maxWorkers;
  }

  register(taskId: number, process?: ChildProcess): void {
    this.active.set(taskId, process ?? null);
  }

  release(taskId: number): void {
    const proc = this.active.get(taskId);
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
    this.active.delete(taskId);
  }

  kill(taskId: number): void {
    const proc = this.active.get(taskId);
    if (proc && !proc.killed) {
      proc.kill('SIGKILL');
    }
    this.active.delete(taskId);
  }

  getActiveTaskIds(): number[] {
    return Array.from(this.active.keys());
  }

  get size(): number {
    return this.active.size;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/core/worker-pool.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add WorkerPool for concurrent task management"
```

---

### Task 12: Daemon

**Files:**
- Create: `src/core/daemon.ts`
- Create: `src/commands/start.ts`
- Create: `src/commands/stop.ts`
- Create: `src/commands/run.ts`

- [ ] **Step 1: Implement Daemon**

```typescript
// src/core/daemon.ts
import { TaskQueue } from './task-queue.js';
import { PipelineEngine } from './pipeline-engine.js';
import { WorkerPool } from './worker-pool.js';
import { log } from '../utils/logger.js';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../utils/paths.js';

export class Daemon {
  private queue: TaskQueue;
  private engine: PipelineEngine;
  private pool: WorkerPool;
  private running = false;
  private interval: ReturnType<typeof setInterval> | null = null;
  private pollMs: number;

  constructor(maxWorkers: number = 3, pollMs: number = 3000) {
    this.queue = new TaskQueue();
    this.engine = new PipelineEngine(this.queue);
    this.pool = new WorkerPool(maxWorkers);
    this.pollMs = pollMs;
  }

  async tick(): Promise<void> {
    // 1. Pick up QUEUED tasks if pool has capacity
    if (this.pool.canAccept()) {
      const queued = this.queue.getByStatus('QUEUED');
      for (const task of queued) {
        if (!this.pool.canAccept()) break;
        this.pool.register(task.id);
        this.engine.analyzeTask(task.id).catch(err => {
          log.error(`Task #${task.id} analyze error: ${err}`);
          this.pool.release(task.id);
        });
      }
    }

    // 2. Advance RUNNING tasks
    const running = this.queue.getByStatus('RUNNING');
    for (const task of running) {
      if (!this.pool.getActiveTaskIds().includes(task.id)) {
        this.pool.register(task.id);
      }
      this.engine.executeNextStep(task.id).catch(err => {
        log.error(`Task #${task.id} step error: ${err}`);
      });
    }

    // 3. Clean up completed/failed tasks from pool
    for (const taskId of this.pool.getActiveTaskIds()) {
      const task = this.queue.get(taskId);
      if (task && !['QUEUED', 'ANALYZE', 'RUNNING'].includes(task.status)) {
        this.pool.release(taskId);
      }
    }

    // 4. Auto-retry FAILED tasks
    const failed = this.queue.getByStatus('FAILED');
    for (const task of failed) {
      if (task.retries < task.max_retries) {
        this.queue.updateStatus(task.id, 'RUNNING');
        log.info(`Task #${task.id}: Auto-retrying (${task.retries + 1}/${task.max_retries})`);
      }
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    log.info('Daemon started');
    this.writePid();

    this.interval = setInterval(() => {
      this.tick().catch(err => log.error(`Daemon tick error: ${err}`));
    }, this.pollMs);
  }

  stop(): void {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.removePid();
    log.info('Daemon stopped');
  }

  private writePid(): void {
    const pidFile = path.join(getDataDir(), 'daemon.pid');
    fs.writeFileSync(pidFile, process.pid.toString());
  }

  private removePid(): void {
    const pidFile = path.join(getDataDir(), 'daemon.pid');
    if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
  }

  static getPid(): number | null {
    const pidFile = path.join(getDataDir(), 'daemon.pid');
    if (!fs.existsSync(pidFile)) return null;
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
    try {
      process.kill(pid, 0);
      return pid;
    } catch {
      fs.unlinkSync(pidFile);
      return null;
    }
  }
}
```

- [ ] **Step 2: Implement start/stop/run commands**

```typescript
// src/commands/start.ts
import { spawn } from 'node:child_process';
import { Daemon } from '../core/daemon.js';
import { log } from '../utils/logger.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function handleStart(opts: { workers: number }): void {
  const existing = Daemon.getPid();
  if (existing) {
    log.warn(`Daemon already running (PID ${existing})`);
    return;
  }

  const scriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    'run.js'
  );

  const child = spawn('node', [scriptPath, '--workers', opts.workers.toString()], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();
  log.success(`Daemon started (PID ${child.pid})`);
}
```

```typescript
// src/commands/stop.ts
import { Daemon } from '../core/daemon.js';
import { log } from '../utils/logger.js';

export function handleStop(): void {
  const pid = Daemon.getPid();
  if (!pid) {
    log.warn('No daemon running');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    log.success(`Daemon stopped (PID ${pid})`);
  } catch {
    log.error(`Failed to stop daemon (PID ${pid})`);
  }
}
```

```typescript
// src/commands/run.ts
import { Daemon } from '../core/daemon.js';
import { log } from '../utils/logger.js';

export function handleRun(opts: { workers: number }): void {
  const existing = Daemon.getPid();
  if (existing) {
    log.warn(`Daemon already running (PID ${existing})`);
    return;
  }

  const daemon = new Daemon(opts.workers);
  daemon.start();

  log.info('Running in foreground. Press Ctrl+C to stop.');

  process.on('SIGINT', () => {
    daemon.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    daemon.stop();
    process.exit(0);
  });
}
```

- [ ] **Step 3: Register in CLI entry**

Add to `src/index.ts`:

```typescript
import { handleStart } from './commands/start.js';
import { handleStop } from './commands/stop.js';
import { handleRun } from './commands/run.js';

program
  .command('start')
  .description('Start background daemon')
  .option('-w, --workers <n>', 'Max concurrent workers', '3')
  .action((opts: { workers: string }) => {
    handleStart({ workers: parseInt(opts.workers, 10) });
  });

program
  .command('stop')
  .description('Stop background daemon')
  .action(() => handleStop());

program
  .command('run')
  .description('Run daemon in foreground')
  .option('-w, --workers <n>', 'Max concurrent workers', '3')
  .action((opts: { workers: string }) => {
    handleRun({ workers: parseInt(opts.workers, 10) });
  });
```

- [ ] **Step 4: Verify build**

```bash
cd C:\Users\user\claude-pm
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Daemon with start/stop/run commands"
```

---

## Phase 7: Remaining CLI Commands

### Task 13: review / approve / reject / cancel / retry / log Commands

**Files:**
- Create: `src/commands/review.ts`
- Create: `src/commands/approve.ts`
- Create: `src/commands/reject.ts`
- Create: `src/commands/cancel.ts`
- Create: `src/commands/retry.ts`
- Create: `src/commands/log.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Implement review command**

```typescript
// src/commands/review.ts
import chalk from 'chalk';
import readline from 'node:readline';
import { TaskQueue } from '../core/task-queue.js';
import { PipelineEngine } from '../core/pipeline-engine.js';
import { getDiff, getDiffFull, mergeBranch, removeWorktree } from '../utils/git.js';
import { log } from '../utils/logger.js';

export async function handleReview(queue: TaskQueue, id: number): Promise<void> {
  const task = queue.get(id);
  if (!task) { log.error(`Task #${id} not found`); return; }
  if (task.status !== 'REVIEW') {
    log.warn(`Task #${id} is ${task.status}, not REVIEW`);
    return;
  }

  console.log(chalk.bold(`\n  Review: Task #${id}`));
  console.log(`  Branch:     ${task.branch}`);
  console.log(`  Complexity: ${task.complexity}`);
  console.log(`  Project:    ${task.project}`);
  console.log('');

  const diff = getDiff(task.project, id);
  console.log(chalk.bold('  Changes:'));
  console.log(`  ${diff.replace(/\n/g, '\n  ')}`);
  console.log('');

  const logs = queue.getLogs(id);
  const lastLog = logs.findLast(l => l.step !== 'ANALYZE');
  if (lastLog?.output) {
    console.log(chalk.bold('  Last output:'));
    console.log(`  ${lastLog.output.slice(0, 500).replace(/\n/g, '\n  ')}`);
    console.log('');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => {
    rl.question('  Approve? (y/n/d for full diff): ', resolve);
  });

  if (answer.toLowerCase() === 'd') {
    const fullDiff = getDiffFull(task.project, id);
    console.log(fullDiff);
    const answer2 = await new Promise<string>(resolve => {
      rl.question('\n  Approve? (y/n): ', resolve);
    });
    rl.close();
    if (answer2.toLowerCase() === 'y') {
      await mergeAndClean(queue, task.project, id);
    } else {
      const feedback = await new Promise<string>(resolve => {
        const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl2.question('  Feedback: ', (f) => { rl2.close(); resolve(f); });
      });
      const engine = new PipelineEngine(queue);
      await engine.rejectTask(id, feedback);
    }
  } else if (answer.toLowerCase() === 'y') {
    rl.close();
    await mergeAndClean(queue, task.project, id);
  } else {
    const feedback = await new Promise<string>(resolve => {
      rl.question('  Feedback: ', (f) => { rl.close(); resolve(f); });
    });
    const engine = new PipelineEngine(queue);
    await engine.rejectTask(id, feedback);
  }
}

async function mergeAndClean(queue: TaskQueue, project: string, id: number): Promise<void> {
  const mergeResult = mergeBranch(project, id);
  if (mergeResult.success) {
    removeWorktree(project, id);
    queue.updateStatus(id, 'DONE');
    log.success(`Task #${id} merged to main`);
  } else {
    log.error(`Merge failed: ${mergeResult.message}`);
  }
}
```

- [ ] **Step 2: Implement approve/reject/cancel/retry/log commands**

```typescript
// src/commands/approve.ts
import { TaskQueue } from '../core/task-queue.js';
import { PipelineEngine } from '../core/pipeline-engine.js';
import { log } from '../utils/logger.js';

export async function handleApprove(queue: TaskQueue, id: number): Promise<void> {
  const task = queue.get(id);
  if (!task) { log.error(`Task #${id} not found`); return; }
  if (task.status !== 'WAITING') {
    log.warn(`Task #${id} is ${task.status}, not WAITING`);
    return;
  }
  const engine = new PipelineEngine(queue);
  await engine.approveTask(id);
}
```

```typescript
// src/commands/reject.ts
import { TaskQueue } from '../core/task-queue.js';
import { PipelineEngine } from '../core/pipeline-engine.js';
import { log } from '../utils/logger.js';

export async function handleReject(queue: TaskQueue, id: number, feedback: string): Promise<void> {
  const task = queue.get(id);
  if (!task) { log.error(`Task #${id} not found`); return; }
  if (!['WAITING', 'REVIEW'].includes(task.status)) {
    log.warn(`Task #${id} is ${task.status}, cannot reject`);
    return;
  }
  const engine = new PipelineEngine(queue);
  await engine.rejectTask(id, feedback);
}
```

```typescript
// src/commands/cancel.ts
import { TaskQueue } from '../core/task-queue.js';
import { PipelineEngine } from '../core/pipeline-engine.js';
import { log } from '../utils/logger.js';

export function handleCancel(queue: TaskQueue, id: number): void {
  const task = queue.get(id);
  if (!task) { log.error(`Task #${id} not found`); return; }
  if (task.status === 'DONE') {
    log.warn(`Task #${id} already done`);
    return;
  }
  const engine = new PipelineEngine(queue);
  engine.cancelTask(id);
}
```

```typescript
// src/commands/retry.ts
import { TaskQueue } from '../core/task-queue.js';
import { log } from '../utils/logger.js';

export function handleRetry(queue: TaskQueue, id: number): void {
  const task = queue.get(id);
  if (!task) { log.error(`Task #${id} not found`); return; }
  if (task.status !== 'FAILED') {
    log.warn(`Task #${id} is ${task.status}, not FAILED`);
    return;
  }
  queue.update(id, { retries: 0, error: null });
  queue.updateStatus(id, 'RUNNING');
  log.success(`Task #${id} queued for retry`);
}
```

```typescript
// src/commands/log.ts
import chalk from 'chalk';
import { TaskQueue } from '../core/task-queue.js';
import { log } from '../utils/logger.js';

export function handleLog(queue: TaskQueue, id: number): void {
  const task = queue.get(id);
  if (!task) { log.error(`Task #${id} not found`); return; }

  const logs = queue.getLogs(id);
  if (logs.length === 0) {
    console.log(chalk.dim('  No logs yet'));
    return;
  }

  console.log(chalk.bold(`\n  Pipeline Log: Task #${id}\n`));
  for (const entry of logs) {
    const icon = entry.status === 'SUCCESS' ? chalk.green('✓') :
                 entry.status === 'FAILED' ? chalk.red('✗') :
                 chalk.gray('○');
    const dur = entry.duration ? chalk.dim(` ${entry.duration}s`) : '';
    console.log(`  ${icon} ${entry.step.padEnd(16)} ${entry.role.padEnd(14)}${dur}`);
    if (entry.output) {
      const preview = entry.output.split('\n')[0].slice(0, 80);
      console.log(chalk.dim(`    ${preview}`));
    }
  }
}
```

- [ ] **Step 3: Register all commands in CLI entry**

Add to `src/index.ts`:

```typescript
import { handleReview } from './commands/review.js';
import { handleApprove } from './commands/approve.js';
import { handleReject } from './commands/reject.js';
import { handleCancel } from './commands/cancel.js';
import { handleRetry } from './commands/retry.js';
import { handleLog } from './commands/log.js';

program
  .command('review')
  .description('Review a completed task')
  .argument('<id>', 'Task ID')
  .action(async (id: string) => {
    const queue = getQueue();
    await handleReview(queue, parseInt(id, 10));
  });

program
  .command('approve')
  .description('Approve a waiting task')
  .argument('<id>', 'Task ID')
  .action(async (id: string) => {
    const queue = getQueue();
    await handleApprove(queue, parseInt(id, 10));
  });

program
  .command('reject')
  .description('Reject a task with feedback')
  .argument('<id>', 'Task ID')
  .argument('<feedback>', 'Rejection feedback')
  .action(async (id: string, feedback: string) => {
    const queue = getQueue();
    await handleReject(queue, parseInt(id, 10), feedback);
  });

program
  .command('cancel')
  .description('Cancel a task')
  .argument('<id>', 'Task ID')
  .action((id: string) => {
    const queue = getQueue();
    handleCancel(queue, parseInt(id, 10));
  });

program
  .command('retry')
  .description('Retry a failed task')
  .argument('<id>', 'Task ID')
  .action((id: string) => {
    const queue = getQueue();
    handleRetry(queue, parseInt(id, 10));
  });

program
  .command('log')
  .description('Show pipeline log for a task')
  .argument('<id>', 'Task ID')
  .action((id: string) => {
    const queue = getQueue();
    handleLog(queue, parseInt(id, 10));
  });
```

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add review, approve, reject, cancel, retry, log commands"
```

---

## Phase 8: Config + Presets

### Task 14: Config Command + Preset Manager

**Files:**
- Create: `src/commands/config.ts`
- Create: `src/core/preset-manager.ts`
- Create: `src/commands/preset.ts`
- Create: `presets/default.json`
- Create: `presets/mes.json`
- Modify: `src/index.ts`

- [ ] **Step 1: Implement config command**

```typescript
// src/commands/config.ts
import chalk from 'chalk';
import { TaskQueue } from '../core/task-queue.js';
import { getDatabase } from '../utils/db.js';
import { log } from '../utils/logger.js';

export function handleConfigSet(key: string, value: string): void {
  const db = getDatabase();
  db.prepare(
    'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)'
  ).run(key, value);
  log.success(`${key} = ${value}`);
}

export function handleConfigGet(key: string): void {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  if (row) {
    console.log(`  ${key} = ${row.value}`);
  } else {
    console.log(chalk.dim(`  ${key} not set`));
  }
}

export function handleConfigList(): void {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM config ORDER BY key').all() as { key: string; value: string }[];
  if (rows.length === 0) {
    console.log(chalk.dim('  No config set. Defaults apply.'));
    return;
  }
  console.log(chalk.bold('\n  Configuration:\n'));
  for (const row of rows) {
    console.log(`  ${row.key.padEnd(24)} ${row.value}`);
  }
}

export function getConfig(key: string, defaultValue: string): string {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? defaultValue;
}
```

- [ ] **Step 2: Implement preset manager**

```typescript
// src/core/preset-manager.ts
import fs from 'node:fs';
import path from 'node:path';
import { getPresetsDir } from '../utils/paths.js';

export interface Preset {
  name: string;
  description: string;
  project?: string;
  systemPrompt?: string;
  verify?: string;
  smoke?: string;
  maxBudgetPerTask?: number;
  conventions?: {
    branch?: string;
    commitPrefix?: string;
  };
}

export class PresetManager {
  private dir: string;

  constructor() {
    this.dir = getPresetsDir();
  }

  list(): Preset[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const content = fs.readFileSync(path.join(this.dir, f), 'utf-8');
        return JSON.parse(content) as Preset;
      });
  }

  get(name: string): Preset | null {
    const filePath = path.join(this.dir, `${name}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  create(name: string, preset: Preset): void {
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    const filePath = path.join(this.dir, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(preset, null, 2));
  }
}
```

- [ ] **Step 3: Create preset files**

```json
// presets/default.json
{
  "name": "default",
  "description": "Default preset",
  "verify": "npm run build",
  "maxBudgetPerTask": 2.00,
  "conventions": {
    "branch": "pm/task-{id}",
    "commitPrefix": "feat|fix|refactor"
  }
}
```

```json
// presets/mes.json
{
  "name": "mes",
  "description": "동산현수막 ERP+MES",
  "project": "C:\\Users\\user\\dongsan_mes",
  "systemPrompt": "이 프로젝트는 Cloudflare Workers + Hono + D1 기반 ERP+MES. CLAUDE.md를 반드시 읽고 따를 것.",
  "verify": "npm run verify",
  "smoke": "npm run smoke",
  "maxBudgetPerTask": 3.00,
  "conventions": {
    "branch": "pm/task-{id}",
    "commitPrefix": "feat|fix|refactor"
  }
}
```

- [ ] **Step 4: Implement preset command**

```typescript
// src/commands/preset.ts
import chalk from 'chalk';
import { PresetManager } from '../core/preset-manager.js';
import { log } from '../utils/logger.js';

export function handlePresetList(): void {
  const manager = new PresetManager();
  const presets = manager.list();
  if (presets.length === 0) {
    console.log(chalk.dim('  No presets found'));
    return;
  }
  console.log(chalk.bold('\n  Presets:\n'));
  for (const p of presets) {
    console.log(`  ${chalk.cyan(p.name.padEnd(16))} ${p.description}`);
  }
}

export function handlePresetShow(name: string): void {
  const manager = new PresetManager();
  const preset = manager.get(name);
  if (!preset) {
    log.error(`Preset '${name}' not found`);
    return;
  }
  console.log(JSON.stringify(preset, null, 2));
}
```

- [ ] **Step 5: Register config and preset commands in CLI entry**

Add to `src/index.ts`:

```typescript
import { handleConfigSet, handleConfigGet, handleConfigList } from './commands/config.js';
import { handlePresetList, handlePresetShow } from './commands/preset.js';

const configCmd = program
  .command('config')
  .description('Manage configuration');

configCmd
  .command('set')
  .argument('<key>')
  .argument('<value>')
  .action((key: string, value: string) => handleConfigSet(key, value));

configCmd
  .command('get')
  .argument('<key>')
  .action((key: string) => handleConfigGet(key));

configCmd
  .command('list')
  .action(() => handleConfigList());

const presetCmd = program
  .command('preset')
  .description('Manage presets');

presetCmd
  .command('list')
  .action(() => handlePresetList());

presetCmd
  .command('show')
  .argument('<name>')
  .action((name: string) => handlePresetShow(name));
```

- [ ] **Step 6: Verify build**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add config management and preset system"
```

---

## Phase 9: Integration + Polish

### Task 15: Notification Utility

**Files:**
- Create: `src/utils/notify.ts`

- [ ] **Step 1: Implement Windows notification**

```typescript
// src/utils/notify.ts
import { execSync } from 'node:child_process';
import { getConfig } from '../commands/config.js';

export function notify(title: string, message: string): void {
  const enabled = getConfig('notifications', 'false');
  if (enabled !== 'true') return;

  try {
    // Windows PowerShell toast notification
    const ps = `
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
      $textNodes = $template.GetElementsByTagName("text")
      $textNodes.Item(0).AppendChild($template.CreateTextNode("${title.replace(/"/g, '`"')}")) | Out-Null
      $textNodes.Item(1).AppendChild($template.CreateTextNode("${message.replace(/"/g, '`"')}")) | Out-Null
      $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
      [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Claude PM").Show($toast)
    `.trim();

    execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'ignore', timeout: 5000 });
  } catch {
    // Silently fail — notifications are best-effort
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add Windows toast notification utility"
```

---

### Task 16: End-to-End Smoke Test

**Files:**
- Create: `tests/e2e.test.ts`

- [ ] **Step 1: Write E2E test**

```typescript
// tests/e2e.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { closeDatabase } from '../src/utils/db.js';

const CLI = 'npx tsx src/index.ts';

afterEach(() => {
  closeDatabase();
  const dbPath = path.join(import.meta.dirname, '../data/claude-pm.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('E2E CLI', () => {
  it('should add a task and show in status', () => {
    const addResult = execSync(`${CLI} add "test task" -p /tmp`, { encoding: 'utf-8' });
    expect(addResult).toContain('Task #1 created');

    const statusResult = execSync(`${CLI} status`, { encoding: 'utf-8' });
    expect(statusResult).toContain('test task');
    expect(statusResult).toContain('#1');
  });

  it('should show task detail', () => {
    execSync(`${CLI} add "detailed task" -p /tmp`, { encoding: 'utf-8' });
    const detail = execSync(`${CLI} status 1`, { encoding: 'utf-8' });
    expect(detail).toContain('detailed task');
    expect(detail).toContain('QUEUED');
  });

  it('should manage config', () => {
    execSync(`${CLI} config set max-workers 5`, { encoding: 'utf-8' });
    const result = execSync(`${CLI} config get max-workers`, { encoding: 'utf-8' });
    expect(result).toContain('5');
  });

  it('should list presets', () => {
    const result = execSync(`${CLI} preset list`, { encoding: 'utf-8' });
    expect(result).toContain('default');
    expect(result).toContain('mes');
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
npx vitest run tests/e2e.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass

- [ ] **Step 4: Verify full build**

```bash
npx tsc && echo "Build OK"
```

Expected: Build OK

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: add E2E smoke tests"
```

---

### Task 17: npm link for Global CLI Access

- [ ] **Step 1: Add shebang to built entry and link**

Ensure `src/index.ts` has `#!/usr/bin/env node` at the top (already added in Task 5).

```bash
cd C:\Users\user\claude-pm
npm run build
npm link
```

- [ ] **Step 2: Verify global access**

```bash
pm --version
pm --help
pm add "test" -p C:\Users\user\dongsan_mes --preset mes
pm status
```

Expected: All commands work globally

- [ ] **Step 3: Commit final state**

```bash
git add -A
git commit -m "chore: configure npm link for global CLI access"
```

---

## Post-Implementation Checklist

- [ ] All unit tests pass (`npx vitest run`)
- [ ] TypeScript compiles clean (`npx tsc --noEmit`)
- [ ] CLI works globally (`pm --help`)
- [ ] `pm add` creates tasks
- [ ] `pm status` shows tasks
- [ ] `pm start` launches daemon
- [ ] `pm run` runs in foreground
- [ ] `pm config set/get/list` works
- [ ] `pm preset list/show` works
- [ ] MES preset correctly configured
