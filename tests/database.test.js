const path = require('path');
const fs = require('fs');
const { HiveMindDatabase } = require('../server/database');

const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'test.db');

let db;

beforeEach(() => {
  // Clean up any existing test db
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  db = new HiveMindDatabase(TEST_DB_PATH);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

describe('API Keys', () => {
  test('create and validate an API key', () => {
    const { key, record } = db.createApiKey({
      name: 'test-key',
      agentName: 'TestBot',
      capabilities: ['code', 'review'],
      scopes: ['connect', 'project:read', 'project:write']
    });

    expect(key).toMatch(/^hm_/);
    expect(record.name).toBe('test-key');
    expect(record.agent_name).toBe('TestBot');
    expect(record.capabilities).toEqual(['code', 'review']);

    // Validate the key
    const validated = db.validateApiKey(key);
    expect(validated).not.toBeNull();
    expect(validated.name).toBe('test-key');
    expect(validated.capabilities).toEqual(['code', 'review']);
  });

  test('reject invalid API key', () => {
    const result = db.validateApiKey('hm_invalid_key');
    expect(result).toBeNull();
  });

  test('reject revoked API key', () => {
    const { key, record } = db.createApiKey({ name: 'revokable-key' });
    db.revokeApiKey(record.id);

    const result = db.validateApiKey(key);
    expect(result).toBeNull();
  });

  test('reject expired API key', () => {
    const { key } = db.createApiKey({
      name: 'expired-key',
      expiresAt: Date.now() - 1000 // already expired
    });

    const result = db.validateApiKey(key);
    expect(result).toBeNull();
  });

  test('list API keys', () => {
    db.createApiKey({ name: 'key-1' });
    db.createApiKey({ name: 'key-2' });

    const keys = db.listApiKeys();
    expect(keys.length).toBe(2);
    const names = keys.map(k => k.name);
    expect(names).toContain('key-1');
    expect(names).toContain('key-2');
  });
});

describe('Agent Persistence', () => {
  test('upsert and retrieve agent', () => {
    const agent = {
      id: 'agent-001',
      name: 'TestBot',
      displayName: 'Agent 1',
      number: 1,
      capabilities: ['code', 'review'],
      avatar: '🤖',
      color: '#FF6B6B',
      stats: {
        actionsCompleted: 10,
        tasksCompleted: 2,
        linesWritten: 100,
        timeSpentCodingMs: 60000,
        errors: 1
      }
    };

    db.upsertAgent(agent);

    const retrieved = db.getPersistedAgent('agent-001');
    expect(retrieved).not.toBeNull();
    expect(retrieved.name).toBe('TestBot');
    expect(retrieved.capabilities).toEqual(['code', 'review']);
    expect(retrieved.total_actions).toBe(10);
  });

  test('accumulate stats on second upsert', () => {
    const agent = {
      id: 'agent-002',
      name: 'Accumulator',
      displayName: 'Agent 2',
      capabilities: ['code'],
      avatar: '🐝',
      color: '#4ECDC4',
      stats: { actionsCompleted: 5, tasksCompleted: 1, linesWritten: 50, timeSpentCodingMs: 0, errors: 0 }
    };

    db.upsertAgent(agent);
    db.upsertAgent({ ...agent, stats: { actionsCompleted: 3, tasksCompleted: 0, linesWritten: 20, timeSpentCodingMs: 0, errors: 0 } });

    const retrieved = db.getPersistedAgent('agent-002');
    expect(retrieved.total_actions).toBe(8); // 5 + 3
    expect(retrieved.total_lines_written).toBe(70); // 50 + 20
  });

  test('list all agents', () => {
    db.upsertAgent({ id: 'a1', name: 'A1', capabilities: [], stats: { actionsCompleted: 0, tasksCompleted: 0, linesWritten: 0, timeSpentCodingMs: 0, errors: 0 } });
    db.upsertAgent({ id: 'a2', name: 'A2', capabilities: [], stats: { actionsCompleted: 0, tasksCompleted: 0, linesWritten: 0, timeSpentCodingMs: 0, errors: 0 } });

    const all = db.getAllPersistedAgents();
    expect(all.length).toBe(2);
  });
});

describe('Project Persistence', () => {
  test('save and load a project', () => {
    const project = {
      id: 'proj-001',
      name: 'Test Project',
      description: 'A test project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: {
        'README.md': {
          id: 'file-1',
          name: 'README.md',
          type: 'markdown',
          content: '# Hello World',
          lastModified: Date.now(),
          modifiedBy: null
        }
      },
      tasks: [
        {
          id: 'task-1',
          title: 'First task',
          priority: 'high',
          status: 'pending',
          createdAt: Date.now()
        }
      ]
    };

    db.saveProject(project);

    const loaded = db.loadProject('proj-001');
    expect(loaded).not.toBeNull();
    expect(loaded.name).toBe('Test Project');
    expect(Object.keys(loaded.files)).toHaveLength(1);
    expect(loaded.files['README.md'].content).toBe('# Hello World');
    expect(loaded.tasks).toHaveLength(1);
    expect(loaded.tasks[0].title).toBe('First task');
  });

  test('load all projects', () => {
    db.saveProject({ id: 'p1', name: 'P1', createdAt: Date.now(), updatedAt: Date.now(), files: {}, tasks: [] });
    db.saveProject({ id: 'p2', name: 'P2', createdAt: Date.now(), updatedAt: Date.now(), files: {}, tasks: [] });

    const all = db.loadAllProjects();
    expect(all.length).toBe(2);
  });
});

describe('Task Operations', () => {
  test('save and retrieve a task', () => {
    const task = {
      id: 'task-100',
      projectId: 'proj-001',
      title: 'Build feature X',
      description: 'Detailed description',
      priority: 'high',
      status: 'open',
      createdAt: Date.now(),
      tags: ['feature', 'priority']
    };

    db.saveTask(task);

    const retrieved = db.getTask('task-100');
    expect(retrieved).not.toBeNull();
    expect(retrieved.title).toBe('Build feature X');
    expect(retrieved.tags).toEqual(['feature', 'priority']);
  });

  test('filter tasks by status', () => {
    db.saveTask({ id: 't1', title: 'Open', status: 'open', createdAt: Date.now() });
    db.saveTask({ id: 't2', title: 'Done', status: 'completed', createdAt: Date.now() });
    db.saveTask({ id: 't3', title: 'Also Open', status: 'open', createdAt: Date.now() });

    const open = db.getTasksByStatus('open');
    expect(open.length).toBe(2);

    const completed = db.getTasksByStatus('completed');
    expect(completed.length).toBe(1);
  });
});

describe('Events', () => {
  test('append and retrieve events', () => {
    db.appendEvent({ type: 'agent:join', agentId: 'a1', data: { name: 'TestBot' } });
    db.appendEvent({ type: 'file:edit', agentId: 'a1', projectId: 'p1', data: { file: 'test.js' } });
    db.appendEvent({ type: 'task:complete', agentId: 'a2', projectId: 'p1', data: { taskId: 't1' } });

    const all = db.getRecentEvents(10);
    expect(all.length).toBe(3);

    const byProject = db.getRecentEvents(10, 'p1');
    expect(byProject.length).toBe(2);
  });
});

describe('Skills', () => {
  test('register and find skill providers', () => {
    db.registerSkill('agent-1', 'code-review');
    db.registerSkill('agent-2', 'code-review');
    db.registerSkill('agent-1', 'testing');

    const reviewers = db.getSkillProviders('code-review');
    expect(reviewers).toEqual(['agent-1', 'agent-2']);

    const skills = db.getAgentSkills('agent-1');
    expect(skills).toEqual(['code-review', 'testing']);
  });

  test('remove agent skills on disconnect', () => {
    db.registerSkill('agent-1', 'code-review');
    db.registerSkill('agent-1', 'testing');
    db.removeAgentSkills('agent-1');

    const skills = db.getAgentSkills('agent-1');
    expect(skills).toEqual([]);
  });
});

describe('Stats', () => {
  test('return aggregate statistics', () => {
    db.saveProject({ id: 'p1', name: 'P1', createdAt: Date.now(), updatedAt: Date.now(), files: {}, tasks: [] });
    db.upsertAgent({ id: 'a1', name: 'A1', capabilities: [], stats: { actionsCompleted: 0, tasksCompleted: 0, linesWritten: 0, timeSpentCodingMs: 0, errors: 0 } });
    db.saveTask({ id: 't1', title: 'T1', status: 'open', createdAt: Date.now() });
    db.createApiKey({ name: 'k1' });

    const stats = db.getStats();
    expect(stats.agents).toBe(1);
    expect(stats.projects).toBe(1);
    expect(stats.tasks).toBe(1);
    expect(stats.apiKeys).toBe(1);
  });
});
