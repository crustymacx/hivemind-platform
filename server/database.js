const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.HIVEMIND_DB_PATH || path.join(__dirname, '..', 'data', 'hivemind.db');

/**
 * Database - SQLite persistence layer for HiveMind Platform
 *
 * Replaces in-memory Maps with durable storage.
 * Uses better-sqlite3 for synchronous, fast access.
 */
class HiveMindDatabase {
  constructor(dbPath = DB_PATH) {
    const fs = require('fs');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._migrate();
  }

  /**
   * Run schema migrations
   */
  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        name TEXT NOT NULL,
        agent_name TEXT,
        capabilities TEXT DEFAULT '["code"]',
        scopes TEXT DEFAULT '["connect","project:read","project:write"]',
        rate_limit INTEGER DEFAULT 100,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        revoked_at INTEGER,
        expires_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        display_name TEXT,
        number INTEGER,
        capabilities TEXT DEFAULT '[]',
        avatar TEXT,
        color TEXT,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER,
        total_actions INTEGER DEFAULT 0,
        total_tasks_completed INTEGER DEFAULT 0,
        total_lines_written INTEGER DEFAULT 0,
        total_coding_ms INTEGER DEFAULT 0,
        total_errors INTEGER DEFAULT 0,
        metadata TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        path TEXT NOT NULL,
        type TEXT DEFAULT 'text',
        content TEXT DEFAULT '',
        modified_by TEXT,
        modified_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        UNIQUE(project_id, path)
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'open',
        created_by TEXT,
        assigned_to TEXT,
        completed_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        result TEXT,
        tags TEXT DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        agent_id TEXT,
        type TEXT NOT NULL,
        data TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS skills (
        agent_id TEXT NOT NULL,
        skill_name TEXT NOT NULL,
        registered_at INTEGER NOT NULL,
        PRIMARY KEY (agent_id, skill_name)
      );

      CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
      CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
      CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(skill_name);
    `);
  }

  // === API Key Operations ===

  /**
   * Generate a new API key
   * @returns {{ key: string, record: Object }} The raw key (show once) and DB record
   */
  createApiKey({ name, agentName, capabilities, scopes, rateLimit, expiresAt }) {
    const rawKey = `hm_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 10);
    const id = crypto.randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO api_keys (id, key_hash, key_prefix, name, agent_name, capabilities, scopes, rate_limit, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      keyHash,
      keyPrefix,
      name,
      agentName || null,
      JSON.stringify(capabilities || ['code']),
      JSON.stringify(scopes || ['connect', 'project:read', 'project:write']),
      rateLimit || 100,
      Date.now(),
      expiresAt || null
    );

    return {
      key: rawKey,
      record: this.getApiKeyById(id)
    };
  }

  /**
   * Validate an API key and return the record
   */
  validateApiKey(rawKey) {
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const record = this.db.prepare(`
      SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL
    `).get(keyHash);

    if (!record) return null;
    if (record.expires_at && record.expires_at < Date.now()) return null;

    // Update last_used_at
    this.db.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`).run(Date.now(), record.id);

    return {
      ...record,
      capabilities: JSON.parse(record.capabilities),
      scopes: JSON.parse(record.scopes)
    };
  }

  getApiKeyById(id) {
    const record = this.db.prepare(`SELECT * FROM api_keys WHERE id = ?`).get(id);
    if (!record) return null;
    return {
      ...record,
      capabilities: JSON.parse(record.capabilities),
      scopes: JSON.parse(record.scopes)
    };
  }

  listApiKeys() {
    return this.db.prepare(`
      SELECT id, key_prefix, name, agent_name, capabilities, scopes, rate_limit,
             created_at, last_used_at, revoked_at, expires_at
      FROM api_keys ORDER BY created_at DESC
    `).all().map(r => ({
      ...r,
      capabilities: JSON.parse(r.capabilities),
      scopes: JSON.parse(r.scopes)
    }));
  }

  revokeApiKey(id) {
    return this.db.prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ?`).run(Date.now(), id);
  }

  // === Agent Persistence ===

  upsertAgent(agent) {
    const existing = this.db.prepare(`SELECT * FROM agents WHERE id = ?`).get(agent.id);

    if (existing) {
      this.db.prepare(`
        UPDATE agents SET
          name = ?, display_name = ?, capabilities = ?, avatar = ?, color = ?,
          last_seen_at = ?,
          total_actions = total_actions + ?,
          total_tasks_completed = total_tasks_completed + ?,
          total_lines_written = total_lines_written + ?,
          total_coding_ms = total_coding_ms + ?,
          total_errors = total_errors + ?
        WHERE id = ?
      `).run(
        agent.name,
        agent.displayName || agent.display_name,
        JSON.stringify(agent.capabilities || []),
        agent.avatar,
        agent.color,
        Date.now(),
        agent.stats?.actionsCompleted || 0,
        agent.stats?.tasksCompleted || 0,
        agent.stats?.linesWritten || 0,
        agent.stats?.timeSpentCodingMs || 0,
        agent.stats?.errors || 0,
        agent.id
      );
    } else {
      this.db.prepare(`
        INSERT INTO agents (id, name, display_name, number, capabilities, avatar, color, first_seen_at, last_seen_at,
          total_actions, total_tasks_completed, total_lines_written, total_coding_ms, total_errors)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        agent.id,
        agent.name,
        agent.displayName || agent.display_name,
        agent.number,
        JSON.stringify(agent.capabilities || []),
        agent.avatar,
        agent.color,
        Date.now(),
        Date.now(),
        agent.stats?.actionsCompleted || 0,
        agent.stats?.tasksCompleted || 0,
        agent.stats?.linesWritten || 0,
        agent.stats?.timeSpentCodingMs || 0,
        agent.stats?.errors || 0
      );
    }
  }

  getPersistedAgent(agentId) {
    const row = this.db.prepare(`SELECT * FROM agents WHERE id = ?`).get(agentId);
    if (!row) return null;
    return { ...row, capabilities: JSON.parse(row.capabilities), metadata: JSON.parse(row.metadata) };
  }

  getAllPersistedAgents() {
    return this.db.prepare(`SELECT * FROM agents ORDER BY last_seen_at DESC`).all()
      .map(r => ({ ...r, capabilities: JSON.parse(r.capabilities), metadata: JSON.parse(r.metadata) }));
  }

  getAgentLifetimeStats(agentId) {
    return this.db.prepare(`
      SELECT total_actions, total_tasks_completed, total_lines_written, total_coding_ms, total_errors
      FROM agents WHERE id = ?
    `).get(agentId);
  }

  // === Project Persistence ===

  saveProject(project) {
    this.db.prepare(`
      INSERT OR REPLACE INTO projects (id, name, description, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      project.id,
      project.name,
      project.description || '',
      project.createdAt || Date.now(),
      project.updatedAt || Date.now(),
      JSON.stringify(project.metadata || {})
    );

    // Save files
    if (project.files) {
      const upsertFile = this.db.prepare(`
        INSERT OR REPLACE INTO files (id, project_id, path, type, content, modified_by, modified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const saveFiles = this.db.transaction((files) => {
        for (const [filePath, file] of Object.entries(files)) {
          upsertFile.run(
            file.id || crypto.randomUUID(),
            project.id,
            filePath,
            file.type || 'text',
            file.content || '',
            file.modifiedBy || null,
            file.lastModified || Date.now()
          );
        }
      });
      saveFiles(project.files);
    }

    // Save tasks
    if (project.tasks) {
      const upsertTask = this.db.prepare(`
        INSERT OR REPLACE INTO tasks (id, project_id, title, description, priority, status, assigned_to, completed_by, created_at, updated_at, completed_at, result)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const saveTasks = this.db.transaction((tasks) => {
        for (const task of tasks) {
          upsertTask.run(
            task.id,
            project.id,
            task.title,
            task.description || '',
            task.priority || 'medium',
            task.status || 'pending',
            task.assignedTo || null,
            task.completedBy || null,
            task.createdAt || Date.now(),
            task.updatedAt || Date.now(),
            task.completedAt || null,
            task.result || null
          );
        }
      });
      saveTasks(project.tasks);
    }
  }

  loadProject(projectId) {
    const project = this.db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId);
    if (!project) return null;

    const files = this.db.prepare(`SELECT * FROM files WHERE project_id = ?`).all(projectId);
    const tasks = this.db.prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at`).all(projectId);

    const fileMap = {};
    for (const f of files) {
      fileMap[f.path] = {
        id: f.id,
        name: f.path,
        type: f.type,
        content: f.content,
        lastModified: f.modified_at,
        modifiedBy: f.modified_by
      };
    }

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      files: fileMap,
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        assignedTo: t.assigned_to,
        completedBy: t.completed_by,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        completedAt: t.completed_at,
        result: t.result,
        tags: JSON.parse(t.tags || '[]')
      })),
      activity: [],
      metadata: JSON.parse(project.metadata || '{}')
    };
  }

  loadAllProjects() {
    return this.db.prepare(`SELECT id FROM projects`).all().map(r => this.loadProject(r.id));
  }

  // === File Operations ===

  saveFile(projectId, filePath, file) {
    this.db.prepare(`
      INSERT OR REPLACE INTO files (id, project_id, path, type, content, modified_by, modified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      file.id || crypto.randomUUID(),
      projectId,
      filePath,
      file.type || 'text',
      file.content || '',
      file.modifiedBy || null,
      file.lastModified || Date.now()
    );
  }

  // === Task Operations ===

  saveTask(task) {
    this.db.prepare(`
      INSERT OR REPLACE INTO tasks (id, project_id, title, description, priority, status, created_by, assigned_to, completed_by, created_at, updated_at, completed_at, result, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id,
      task.projectId || null,
      task.title,
      task.description || '',
      task.priority || 'medium',
      task.status || 'open',
      task.createdBy || null,
      task.assignedTo || null,
      task.completedBy || null,
      task.createdAt || Date.now(),
      Date.now(),
      task.completedAt || null,
      task.result || null,
      JSON.stringify(task.tags || [])
    );
  }

  getTask(taskId) {
    const t = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(taskId);
    if (!t) return null;
    return {
      id: t.id, projectId: t.project_id, title: t.title, description: t.description,
      priority: t.priority, status: t.status, createdBy: t.created_by,
      assignedTo: t.assigned_to, completedBy: t.completed_by,
      createdAt: t.created_at, updatedAt: t.updated_at, completedAt: t.completed_at,
      result: t.result, tags: JSON.parse(t.tags || '[]')
    };
  }

  getTasksByStatus(status, projectId = null) {
    let query = `SELECT * FROM tasks WHERE status = ?`;
    const params = [status];
    if (projectId) {
      query += ` AND project_id = ?`;
      params.push(projectId);
    }
    query += ` ORDER BY created_at DESC`;
    return this.db.prepare(query).all(...params).map(t => ({
      id: t.id, projectId: t.project_id, title: t.title, description: t.description,
      priority: t.priority, status: t.status, assignedTo: t.assigned_to,
      createdAt: t.created_at, tags: JSON.parse(t.tags || '[]')
    }));
  }

  // === Event Log ===

  appendEvent(event) {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO events (id, project_id, agent_id, type, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      event.projectId || null,
      event.agentId || null,
      event.type,
      JSON.stringify(event.data || {}),
      Date.now()
    );
    return id;
  }

  getRecentEvents(limit = 50, projectId = null) {
    let query = `SELECT * FROM events`;
    const params = [];
    if (projectId) {
      query += ` WHERE project_id = ?`;
      params.push(projectId);
    }
    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    return this.db.prepare(query).all(...params).map(r => ({
      id: r.id, projectId: r.project_id, agentId: r.agent_id,
      type: r.type, data: JSON.parse(r.data), createdAt: r.created_at
    })).reverse();
  }

  // === Skills ===

  registerSkill(agentId, skillName) {
    this.db.prepare(`
      INSERT OR REPLACE INTO skills (agent_id, skill_name, registered_at)
      VALUES (?, ?, ?)
    `).run(agentId, skillName, Date.now());
  }

  getSkillProviders(skillName) {
    return this.db.prepare(`SELECT agent_id FROM skills WHERE skill_name = ?`)
      .all(skillName).map(r => r.agent_id);
  }

  getAgentSkills(agentId) {
    return this.db.prepare(`SELECT skill_name FROM skills WHERE agent_id = ?`)
      .all(agentId).map(r => r.skill_name);
  }

  removeAgentSkills(agentId) {
    this.db.prepare(`DELETE FROM skills WHERE agent_id = ?`).run(agentId);
  }

  // === Stats ===

  getStats() {
    const agents = this.db.prepare(`SELECT COUNT(*) as count FROM agents`).get().count;
    const projects = this.db.prepare(`SELECT COUNT(*) as count FROM projects`).get().count;
    const tasks = this.db.prepare(`SELECT COUNT(*) as count FROM tasks`).get().count;
    const events = this.db.prepare(`SELECT COUNT(*) as count FROM events`).get().count;
    const openTasks = this.db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status IN ('open', 'pending')`).get().count;
    const completedTasks = this.db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status = 'completed'`).get().count;
    const apiKeys = this.db.prepare(`SELECT COUNT(*) as count FROM api_keys WHERE revoked_at IS NULL`).get().count;

    return { agents, projects, tasks, events, openTasks, completedTasks, apiKeys };
  }

  /**
   * Close the database connection
   */
  close() {
    this.db.close();
  }
}

// Singleton for the server
let instance = null;
function getDatabase(dbPath) {
  if (!instance) {
    instance = new HiveMindDatabase(dbPath);
  }
  return instance;
}

module.exports = { HiveMindDatabase, getDatabase };
