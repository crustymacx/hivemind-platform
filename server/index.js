const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config();

const SocketHandler = require('./socket-handler');
const AgentManager = require('./agent-manager');
const ProjectManager = require('./project-manager');
const SyncEngine = require('./sync-engine');
const MemoryBus = require('./memory-bus');
const TaskEngine = require('./task-engine');
const { getDatabase } = require('./database');
const { apiKeyMiddleware, socketAuthMiddleware, AUTH_REQUIRED } = require('./auth');
const { SkillRegistry } = require('./skill-registry');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(express.json());

const fs = require('fs');
const clientV2Path = path.join(__dirname, '../client-v2/dist');
const legacyClientPath = path.join(__dirname, '../client');
const clientPath = fs.existsSync(clientV2Path) ? clientV2Path : legacyClientPath;
app.use(express.static(clientPath));

// Initialize database
const database = getDatabase();

// Core services
const agentManager = new AgentManager(database);
const projectManager = new ProjectManager(database);
const syncEngine = new SyncEngine();
const memoryBus = new MemoryBus(database);
const taskEngine = new TaskEngine(database);
const skillRegistry = new SkillRegistry();
const socketHandler = new SocketHandler(io, agentManager, projectManager, syncEngine, memoryBus, taskEngine, skillRegistry);

// Socket.io auth middleware
io.use(socketAuthMiddleware);

// Routes - public
app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

app.get('/health', (req, res) => {
  const stats = database.getStats();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    auth: AUTH_REQUIRED ? 'required' : 'optional',
    persistence: 'sqlite',
    ...stats
  });
});

// Routes - API (with optional auth)
app.get('/api/projects', apiKeyMiddleware, (req, res) => {
  res.json(projectManager.getAllProjects());
});

app.get('/api/projects/:id', apiKeyMiddleware, (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json(project);
});

app.post('/api/projects', apiKeyMiddleware, (req, res) => {
  const { name, description } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }
  const project = projectManager.createProject(name, description);
  res.status(201).json(project);
});

app.get('/api/agents', apiKeyMiddleware, (req, res) => {
  res.json(agentManager.getAllAgents());
});

app.get('/api/agents/history', apiKeyMiddleware, (req, res) => {
  res.json(database.getAllPersistedAgents());
});

app.get('/api/leaderboard', (req, res) => {
  res.json({
    leaders: agentManager.getLeaderboard(10)
  });
});

app.post('/api/agents/:id/resources', apiKeyMiddleware, (req, res) => {
  const updated = agentManager.updateResources(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  res.json(updated);
});

app.get('/api/stats', (req, res) => {
  const dbStats = database.getStats();
  res.json({
    agents: agentManager.getAgentCount(),
    projects: projectManager.getProjectCount(),
    activeConnections: io.engine.clientsCount,
    uptime: process.uptime(),
    persistence: dbStats
  });
});

app.get('/api/memory', apiKeyMiddleware, (req, res) => {
  res.json({ events: memoryBus.getRecent(100, req.query.projectId || null) });
});

app.post('/api/tasks', apiKeyMiddleware, (req, res) => {
  const body = req.body || {};
  if (!body.title) {
    return res.status(400).json({ error: 'Task title is required' });
  }
  const task = taskEngine.createTask(body);
  res.status(201).json({ task });
});

app.get('/api/tasks', apiKeyMiddleware, (req, res) => {
  const { status, projectId } = req.query;
  if (status) {
    res.json(database.getTasksByStatus(status, projectId));
  } else {
    const all = ['open', 'pending', 'assigned', 'in-progress', 'completed'].flatMap(
      s => database.getTasksByStatus(s, projectId)
    );
    res.json(all);
  }
});

app.get('/api/tasks/:id', apiKeyMiddleware, (req, res) => {
  const task = database.getTask(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(task);
});

app.get('/api/skills', (req, res) => {
  res.json(skillRegistry.getStats());
});

// Initialize socket handling
socketHandler.initialize();

// Start demo mode - spawn simulated agents (disabled by default)
if (process.env.ENABLE_DEMO === 'true') {
  setTimeout(() => {
    socketHandler.startDemoMode();
  }, 2000);
}

// Periodic persistence - flush agent stats every 60s
setInterval(() => {
  const agents = agentManager.getAllAgents();
  for (const agent of agents) {
    database.upsertAgent(agent);
  }
}, 60000);

// Graceful shutdown
function shutdown() {
  console.log('\nShutting down...');
  const agents = agentManager.getAllAgents();
  for (const agent of agents) {
    database.upsertAgent(agent);
  }
  for (const project of projectManager.getAllProjectsFull()) {
    database.saveProject(project);
  }
  database.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🐝 HiveMind Platform running on port ${PORT}`);
  console.log(`🔭 Observatory: http://localhost:${PORT}`);
  console.log(`🌐 WebSocket: ws://localhost:${PORT}`);
  console.log(`💾 Database: SQLite (${AUTH_REQUIRED ? 'auth required' : 'auth optional'})`);
});

module.exports = { app, io, httpServer, agentManager, projectManager, syncEngine, database };