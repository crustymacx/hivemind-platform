#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const { HiveMindDatabase } = require('../server/database');

const program = new Command();

const DB_PATH = process.env.HIVEMIND_DB_PATH || path.join(__dirname, '..', 'data', 'hivemind.db');

function getDb() {
  return new HiveMindDatabase(DB_PATH);
}

function formatDate(ts) {
  if (!ts) return chalk.dim('never');
  return new Date(ts).toLocaleString();
}

function formatStatus(status) {
  const colors = {
    open: chalk.yellow,
    pending: chalk.yellow,
    assigned: chalk.blue,
    'in-progress': chalk.cyan,
    completed: chalk.green,
    failed: chalk.red,
    revoked: chalk.red
  };
  return (colors[status] || chalk.white)(status);
}

// === Program Setup ===

program
  .name('hivemind')
  .description('HiveMind Platform CLI - manage agents, projects, tasks, and API keys')
  .version('1.0.0');

// === API Key Management ===

const keys = program.command('keys').description('Manage API keys');

keys.command('create')
  .description('Create a new API key')
  .requiredOption('-n, --name <name>', 'Key name (for identification)')
  .option('-a, --agent-name <name>', 'Lock key to a specific agent name')
  .option('-c, --capabilities <caps>', 'Comma-separated capabilities', 'code')
  .option('-s, --scopes <scopes>', 'Comma-separated scopes', 'connect,project:read,project:write')
  .option('-r, --rate-limit <limit>', 'Rate limit (requests/min)', '100')
  .option('-e, --expires <days>', 'Expire after N days')
  .action((opts) => {
    const db = getDb();
    const expiresAt = opts.expires ? Date.now() + parseInt(opts.expires) * 86400000 : null;

    const { key, record } = db.createApiKey({
      name: opts.name,
      agentName: opts.agentName,
      capabilities: opts.capabilities.split(','),
      scopes: opts.scopes.split(','),
      rateLimit: parseInt(opts.rateLimit),
      expiresAt
    });

    console.log();
    console.log(chalk.green.bold('  API Key Created'));
    console.log();
    console.log(`  ${chalk.bold('Key:')}    ${chalk.cyan(key)}`);
    console.log(`  ${chalk.bold('ID:')}     ${record.id}`);
    console.log(`  ${chalk.bold('Name:')}   ${record.name}`);
    if (record.agent_name) {
      console.log(`  ${chalk.bold('Agent:')}  ${record.agent_name}`);
    }
    console.log(`  ${chalk.bold('Scopes:')} ${record.scopes.join(', ')}`);
    if (expiresAt) {
      console.log(`  ${chalk.bold('Expires:')} ${formatDate(expiresAt)}`);
    }
    console.log();
    console.log(chalk.yellow('  Save this key - it cannot be retrieved later.'));
    console.log();
    db.close();
  });

keys.command('list')
  .description('List all API keys')
  .option('--include-revoked', 'Include revoked keys')
  .action((opts) => {
    const db = getDb();
    let keyList = db.listApiKeys();
    if (!opts.includeRevoked) {
      keyList = keyList.filter(k => !k.revoked_at);
    }

    if (keyList.length === 0) {
      console.log(chalk.dim('\n  No API keys found. Create one with: hivemind keys create -n "my-key"\n'));
      db.close();
      return;
    }

    console.log();
    console.log(chalk.bold(`  API Keys (${keyList.length})`));
    console.log(chalk.dim('  ' + '-'.repeat(80)));

    for (const k of keyList) {
      const status = k.revoked_at ? chalk.red(' [REVOKED]') : '';
      const expired = k.expires_at && k.expires_at < Date.now() ? chalk.red(' [EXPIRED]') : '';
      console.log(`  ${chalk.cyan(k.key_prefix + '...')} ${chalk.bold(k.name)}${status}${expired}`);
      console.log(`    ID: ${chalk.dim(k.id)}`);
      if (k.agent_name) console.log(`    Agent: ${k.agent_name}`);
      console.log(`    Scopes: ${k.scopes.join(', ')}`);
      console.log(`    Created: ${formatDate(k.created_at)}  Last used: ${formatDate(k.last_used_at)}`);
      console.log();
    }
    db.close();
  });

keys.command('revoke')
  .description('Revoke an API key')
  .argument('<id>', 'Key ID to revoke')
  .action((id) => {
    const db = getDb();
    const key = db.getApiKeyById(id);
    if (!key) {
      console.log(chalk.red(`\n  Key not found: ${id}\n`));
      db.close();
      return;
    }
    db.revokeApiKey(id);
    console.log(chalk.yellow(`\n  Revoked key: ${key.name} (${key.key_prefix}...)\n`));
    db.close();
  });

// === Agent Management ===

const agents = program.command('agents').description('View and manage agents');

agents.command('list')
  .description('List all known agents')
  .option('-l, --limit <n>', 'Limit results', '20')
  .action((opts) => {
    const db = getDb();
    const agentList = db.getAllPersistedAgents().slice(0, parseInt(opts.limit));

    if (agentList.length === 0) {
      console.log(chalk.dim('\n  No agents have connected yet.\n'));
      db.close();
      return;
    }

    console.log();
    console.log(chalk.bold(`  Agents (${agentList.length})`));
    console.log(chalk.dim('  ' + '-'.repeat(70)));

    for (const a of agentList) {
      const capabilities = a.capabilities.join(', ');
      console.log(`  ${chalk.cyan(a.display_name || a.name)} ${chalk.dim(`(${a.id.slice(0, 8)}...)`)}`);
      console.log(`    Capabilities: ${capabilities}`);
      console.log(`    Actions: ${a.total_actions}  Tasks: ${a.total_tasks_completed}  Lines: ${a.total_lines_written}`);
      console.log(`    First seen: ${formatDate(a.first_seen_at)}  Last seen: ${formatDate(a.last_seen_at)}`);
      console.log();
    }
    db.close();
  });

agents.command('stats')
  .description('Show agent statistics')
  .argument('[agentId]', 'Specific agent ID')
  .action((agentId) => {
    const db = getDb();

    if (agentId) {
      const agent = db.getPersistedAgent(agentId);
      if (!agent) {
        console.log(chalk.red(`\n  Agent not found: ${agentId}\n`));
        db.close();
        return;
      }

      console.log();
      console.log(chalk.bold(`  Agent: ${agent.display_name || agent.name}`));
      console.log(chalk.dim('  ' + '-'.repeat(50)));
      console.log(`  ID:            ${agent.id}`);
      console.log(`  Capabilities:  ${agent.capabilities.join(', ')}`);
      console.log(`  Actions:       ${agent.total_actions}`);
      console.log(`  Tasks Done:    ${agent.total_tasks_completed}`);
      console.log(`  Lines Written: ${agent.total_lines_written}`);
      console.log(`  Coding Time:   ${Math.round(agent.total_coding_ms / 60000)} min`);
      console.log(`  Errors:        ${agent.total_errors}`);
      console.log(`  First Seen:    ${formatDate(agent.first_seen_at)}`);
      console.log(`  Last Seen:     ${formatDate(agent.last_seen_at)}`);
      console.log();
    } else {
      const stats = db.getStats();
      console.log();
      console.log(chalk.bold('  HiveMind Stats'));
      console.log(chalk.dim('  ' + '-'.repeat(40)));
      console.log(`  Total Agents:     ${stats.agents}`);
      console.log(`  Total Projects:   ${stats.projects}`);
      console.log(`  Total Tasks:      ${stats.tasks}`);
      console.log(`  Open Tasks:       ${stats.openTasks}`);
      console.log(`  Completed Tasks:  ${stats.completedTasks}`);
      console.log(`  Events Logged:    ${stats.events}`);
      console.log(`  Active API Keys:  ${stats.apiKeys}`);
      console.log();
    }
    db.close();
  });

// === Project Management ===

const projects = program.command('projects').description('Manage projects');

projects.command('list')
  .description('List all projects')
  .action(() => {
    const db = getDb();
    const projectList = db.loadAllProjects();

    if (projectList.length === 0) {
      console.log(chalk.dim('\n  No projects found.\n'));
      db.close();
      return;
    }

    console.log();
    console.log(chalk.bold(`  Projects (${projectList.length})`));
    console.log(chalk.dim('  ' + '-'.repeat(70)));

    for (const p of projectList) {
      const fileCount = Object.keys(p.files).length;
      const taskCount = p.tasks.length;
      console.log(`  ${chalk.cyan.bold(p.name)} ${chalk.dim(`(${p.id})`)}`);
      if (p.description) console.log(`    ${p.description}`);
      console.log(`    Files: ${fileCount}  Tasks: ${taskCount}  Created: ${formatDate(p.createdAt)}`);
      console.log();
    }
    db.close();
  });

projects.command('create')
  .description('Create a new project')
  .requiredOption('-n, --name <name>', 'Project name')
  .option('-d, --description <desc>', 'Project description', '')
  .action((opts) => {
    const db = getDb();
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    db.saveProject({
      id,
      name: opts.name,
      description: opts.description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: {},
      tasks: []
    });
    console.log(chalk.green(`\n  Created project: ${opts.name} (${id})\n`));
    db.close();
  });

projects.command('show')
  .description('Show project details')
  .argument('<id>', 'Project ID')
  .action((id) => {
    const db = getDb();
    const project = db.loadProject(id);

    if (!project) {
      console.log(chalk.red(`\n  Project not found: ${id}\n`));
      db.close();
      return;
    }

    console.log();
    console.log(chalk.bold(`  ${project.name}`));
    if (project.description) console.log(`  ${chalk.dim(project.description)}`);
    console.log(chalk.dim('  ' + '-'.repeat(60)));

    const files = Object.keys(project.files);
    if (files.length > 0) {
      console.log(chalk.bold('\n  Files:'));
      for (const f of files) {
        const file = project.files[f];
        const lines = file.content ? file.content.split('\n').length : 0;
        console.log(`    ${chalk.cyan(f)} ${chalk.dim(`(${lines} lines, ${file.type})`)}`);
      }
    }

    if (project.tasks.length > 0) {
      console.log(chalk.bold('\n  Tasks:'));
      for (const t of project.tasks) {
        console.log(`    ${formatStatus(t.status)} ${t.title} ${chalk.dim(`[${t.priority}]`)}`);
      }
    }

    console.log();
    db.close();
  });

// === Task Management ===

const tasks = program.command('tasks').description('Manage tasks');

tasks.command('list')
  .description('List tasks')
  .option('-s, --status <status>', 'Filter by status')
  .option('-p, --project <id>', 'Filter by project')
  .action((opts) => {
    const db = getDb();
    let taskList;

    if (opts.status) {
      taskList = db.getTasksByStatus(opts.status, opts.project);
    } else {
      const statuses = ['open', 'pending', 'assigned', 'in-progress', 'completed'];
      taskList = [];
      for (const s of statuses) {
        taskList.push(...db.getTasksByStatus(s, opts.project));
      }
    }

    if (taskList.length === 0) {
      console.log(chalk.dim('\n  No tasks found.\n'));
      db.close();
      return;
    }

    console.log();
    console.log(chalk.bold(`  Tasks (${taskList.length})`));
    console.log(chalk.dim('  ' + '-'.repeat(70)));

    for (const t of taskList) {
      const assigned = t.assignedTo ? chalk.dim(` -> ${t.assignedTo.slice(0, 8)}`) : '';
      console.log(`  ${formatStatus(t.status)} ${t.title} ${chalk.dim(`[${t.priority}]`)}${assigned}`);
      console.log(`    ${chalk.dim(t.id)}  Created: ${formatDate(t.createdAt)}`);
    }
    console.log();
    db.close();
  });

tasks.command('create')
  .description('Create a new task')
  .requiredOption('-t, --title <title>', 'Task title')
  .option('-d, --description <desc>', 'Task description', '')
  .option('-p, --project <id>', 'Project ID')
  .option('--priority <priority>', 'Priority (low/medium/high/critical)', 'medium')
  .option('--tags <tags>', 'Comma-separated tags', '')
  .action((opts) => {
    const db = getDb();
    const { v4: uuidv4 } = require('uuid');
    const task = {
      id: uuidv4(),
      projectId: opts.project || null,
      title: opts.title,
      description: opts.description,
      priority: opts.priority,
      status: 'open',
      createdAt: Date.now(),
      tags: opts.tags ? opts.tags.split(',') : []
    };
    db.saveTask(task);
    console.log(chalk.green(`\n  Created task: ${task.title} (${task.id})\n`));
    db.close();
  });

// === Events / Activity ===

const events = program.command('events').description('View event history');

events.command('list')
  .description('Show recent events')
  .option('-n, --limit <n>', 'Number of events', '30')
  .option('-p, --project <id>', 'Filter by project')
  .action((opts) => {
    const db = getDb();
    const eventList = db.getRecentEvents(parseInt(opts.limit), opts.project);

    if (eventList.length === 0) {
      console.log(chalk.dim('\n  No events recorded yet.\n'));
      db.close();
      return;
    }

    console.log();
    console.log(chalk.bold(`  Recent Events (${eventList.length})`));
    console.log(chalk.dim('  ' + '-'.repeat(70)));

    for (const e of eventList) {
      const agent = e.agentId ? chalk.cyan(e.agentId.slice(0, 8)) : chalk.dim('system');
      const time = new Date(e.createdAt).toLocaleTimeString();
      console.log(`  ${chalk.dim(time)} ${agent} ${chalk.bold(e.type)} ${chalk.dim(JSON.stringify(e.data).slice(0, 60))}`);
    }
    console.log();
    db.close();
  });

// === Database Management ===

program.command('db-stats')
  .description('Show database statistics')
  .action(() => {
    const db = getDb();
    const stats = db.getStats();
    console.log();
    console.log(chalk.bold('  Database Statistics'));
    console.log(chalk.dim('  ' + '-'.repeat(40)));
    console.log(`  Agents:          ${stats.agents}`);
    console.log(`  Projects:        ${stats.projects}`);
    console.log(`  Tasks:           ${stats.tasks}`);
    console.log(`  Events:          ${stats.events}`);
    console.log(`  Active API Keys: ${stats.apiKeys}`);
    console.log(`  DB Path:         ${chalk.dim(DB_PATH)}`);
    console.log();
    db.close();
  });

program.parse();
