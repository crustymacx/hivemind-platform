const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config();

const SocketHandler = require('./socket-handler');
const AgentManager = require('./agent-manager');
const ProjectManager = require('./project-manager');
const SyncEngine = require('./sync-engine');

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
app.use(express.static(path.join(__dirname, '../client')));

// Core services
const agentManager = new AgentManager();
const projectManager = new ProjectManager();
const syncEngine = new SyncEngine();
const socketHandler = new SocketHandler(io, agentManager, projectManager, syncEngine);

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.get('/api/projects', (req, res) => {
  res.json(projectManager.getAllProjects());
});

app.get('/api/projects/:id', (req, res) => {
  const project = projectManager.getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json(project);
});

app.get('/api/agents', (req, res) => {
  res.json(agentManager.getAllAgents());
});

app.get('/api/leaderboard', (req, res) => {
  res.json({
    leaders: agentManager.getLeaderboard(10)
  });
});

app.post('/api/agents/:id/resources', (req, res) => {
  const updated = agentManager.updateResources(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  res.json(updated);
});

app.get('/api/stats', (req, res) => {
  res.json({
    agents: agentManager.getAgentCount(),
    projects: projectManager.getProjectCount(),
    activeConnections: io.engine.clientsCount,
    uptime: process.uptime()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Initialize socket handling
socketHandler.initialize();

// Start demo mode - spawn simulated agents (disabled by default)
if (process.env.ENABLE_DEMO === 'true') {
  setTimeout(() => {
    socketHandler.startDemoMode();
  }, 2000);
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🐝 HiveMind Platform running on port ${PORT}`);
  console.log(`🔭 Observatory: http://localhost:${PORT}`);
  console.log(`🌐 WebSocket: ws://localhost:${PORT}`);
});

module.exports = { app, io, agentManager, projectManager, syncEngine };