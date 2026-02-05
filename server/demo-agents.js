const { io } = require('socket.io-client');

/**
 * DemoAgents - Simulated AI agents that work together on the demo project
 */
class DemoAgents {
  constructor(ioServer, agentManager, projectManager) {
    this.ioServer = ioServer;
    this.agentManager = agentManager;
    this.projectManager = projectManager;
    this.agents = [];
    this.isRunning = false;
  }

  /**
   * Start the demo simulation
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('🎭 Initializing demo agents...');

    // Create simulated agents with different roles
    const agentConfigs = [
      {
        name: 'CodeWriter',
        avatar: '💻',
        capabilities: ['code', 'write'],
        color: '#4ECDC4',
        behavior: 'implementer'
      },
      {
        name: 'ReviewBot',
        avatar: '🔍',
        capabilities: ['review', 'code'],
        color: '#FFEAA7',
        behavior: 'reviewer'
      },
      {
        name: 'DocuMentor',
        avatar: '📚',
        capabilities: ['write', 'review'],
        color: '#DDA0DD',
        behavior: 'documenter'
      },
      {
        name: 'TestRunner',
        avatar: '🧪',
        capabilities: ['code', 'execute'],
        color: '#96CEB4',
        behavior: 'tester'
      },
      {
        name: 'Orchestrator',
        avatar: '🎯',
        capabilities: ['orchestrate', 'code'],
        color: '#FF6B6B',
        behavior: 'orchestrator'
      }
    ];

    // Create agent connections
    agentConfigs.forEach((config, index) => {
      setTimeout(() => {
        this.createAgent(config);
      }, index * 1500);
    });

    // Start simulation loop
    this.simulationInterval = setInterval(() => {
      this.runSimulationTick();
    }, 3000);
  }

  /**
   * Create a simulated agent connection
   */
  createAgent(config) {
    const socket = io('http://localhost:3000', {
      auth: {
        type: 'agent',
        agentId: `demo-${config.name.toLowerCase()}-${Date.now()}`,
        name: config.name,
        capabilities: config.capabilities,
        isDemo: true
      },
      transports: ['websocket']
    });

    const agent = {
      socket,
      config,
      state: 'connecting',
      currentTask: null,
      cursor: { file: null, line: 0, column: 0 }
    };

    socket.on('connect', () => {
      console.log(`🤖 Demo agent connected: ${config.name}`);
      agent.state = 'connected';
      
      // Join the demo project
      setTimeout(() => {
        socket.emit('agent:join', { projectId: 'demo-project' });
      }, 500);
    });

    socket.on('project:state', (state) => {
      agent.state = 'active';
      agent.projectState = state;
      console.log(`📁 ${config.name} joined project with ${Object.keys(state.files).length} files`);
    });

    socket.on('task:created', (task) => {
      if (config.behavior === 'orchestrator' && !task.assignedTo) {
        setTimeout(() => {
          this.assignTask(agent, task);
        }, 1000);
      }
    });

    socket.on('disconnect', () => {
      console.log(`👋 Demo agent disconnected: ${config.name}`);
      agent.state = 'disconnected';
    });

    this.agents.push(agent);
  }

  /**
   * Run a simulation tick - agents perform actions
   */
  runSimulationTick() {
    this.agents.forEach(agent => {
      if (agent.state !== 'active') return;

      switch (agent.config.behavior) {
        case 'implementer':
          this.simulateImplementer(agent);
          break;
        case 'reviewer':
          this.simulateReviewer(agent);
          break;
        case 'documenter':
          this.simulateDocumenter(agent);
          break;
        case 'tester':
          this.simulateTester(agent);
          break;
        case 'orchestrator':
          this.simulateOrchestrator(agent);
          break;
      }
    });
  }

  /**
   * CodeWriter - Implements features and writes code
   */
  simulateImplementer(agent) {
    const actions = [
      () => this.editFile(agent, 'src/server.js', this.generateServerCode()),
      () => this.editFile(agent, 'src/client.js', this.generateClientCode()),
      () => this.moveCursor(agent, 'src/server.js', Math.floor(Math.random() * 20)),
      () => this.setStatus(agent, 'writing code...'),
      () => this.completeTask(agent)
    ];
    
    const action = actions[Math.floor(Math.random() * actions.length)];
    action();
  }

  /**
   * ReviewBot - Reviews code and adds comments
   */
  simulateReviewer(agent) {
    const files = ['src/server.js', 'src/client.js', 'README.md'];
    const file = files[Math.floor(Math.random() * files.length)];
    
    const actions = [
      () => this.moveCursor(agent, file, Math.floor(Math.random() * 30)),
      () => this.addComment(agent, file, Math.floor(Math.random() * 20), 'Good implementation! 👍'),
      () => this.setStatus(agent, 'reviewing...'),
      () => this.setStatus(agent, 'idle')
    ];
    
    const action = actions[Math.floor(Math.random() * actions.length)];
    action();
  }

  /**
   * DocuMentor - Writes documentation
   */
  simulateDocumenter(agent) {
    const actions = [
      () => this.editFile(agent, 'README.md', this.generateReadme()),
      () => this.editFile(agent, 'docs/api.md', this.generateApiDocs()),
      () => this.moveCursor(agent, 'docs/api.md', Math.floor(Math.random() * 10)),
      () => this.setStatus(agent, 'documenting...')
    ];
    
    const action = actions[Math.floor(Math.random() * actions.length)];
    action();
  }

  /**
   * TestRunner - Creates and runs tests
   */
  simulateTester(agent) {
    const actions = [
      () => this.createFile(agent, 'tests/server.test.js', this.generateTests()),
      () => this.setStatus(agent, 'running tests...'),
      () => this.setStatus(agent, 'tests passed ✓'),
      () => this.moveCursor(agent, 'tests/server.test.js', 5)
    ];
    
    const action = actions[Math.floor(Math.random() * actions.length)];
    action();
  }

  /**
   * Orchestrator - Manages tasks and coordinates
   */
  simulateOrchestrator(agent) {
    const project = this.projectManager.getProject('demo-project');
    const pendingTasks = project.tasks.filter(t => t.status === 'pending');
    
    if (pendingTasks.length > 0 && Math.random() > 0.7) {
      const task = pendingTasks[0];
      this.assignTask(agent, task);
    } else {
      this.setStatus(agent, 'coordinating...');
    }
  }

  /**
   * Agent action helpers
   */
  editFile(agent, filePath, content) {
    agent.socket.emit('agent:action', {
      type: 'file:edit',
      filePath,
      content
    });
    
    // Simulate typing
    agent.socket.emit('agent:typing', { filePath, isTyping: true });
    setTimeout(() => {
      agent.socket.emit('agent:typing', { filePath, isTyping: false });
    }, 2000);
  }

  createFile(agent, filePath, content) {
    agent.socket.emit('agent:action', {
      type: 'file:create',
      filePath,
      content
    });
  }

  moveCursor(agent, filePath, line) {
    agent.cursor = { file: filePath, line, column: 0 };
    agent.socket.emit('agent:cursor', {
      filePath,
      line,
      column: 0
    });
  }

  addComment(agent, filePath, line, text) {
    agent.socket.emit('agent:action', {
      type: 'comment:add',
      filePath,
      line,
      text
    });
  }

  setStatus(agent, status) {
    agent.socket.emit('agent:status', { status });
  }

  assignTask(agent, task) {
    agent.socket.emit('agent:action', {
      type: 'task:claim',
      taskId: task.id
    });
    agent.currentTask = task;
  }

  completeTask(agent) {
    if (agent.currentTask) {
      agent.socket.emit('agent:action', {
        type: 'task:complete',
        taskId: agent.currentTask.id,
        result: 'Completed successfully'
      });
      agent.currentTask = null;
    }
  }

  /**
   * Content generators
   */
  generateServerCode() {
    return `const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

// Agent connection handling
io.on('connection', (socket) => {
  console.log('Agent connected:', socket.id);
  
  socket.on('agent:join', (data) => {
    socket.join(data.projectId);
    socket.to(data.projectId).emit('agent:joined', {
      agentId: socket.id
    });
  });
  
  socket.on('agent:action', (data) => {
    // Broadcast to other agents
    socket.to(data.projectId).emit('project:update', data);
  });
});

httpServer.listen(3000, () => {
  console.log('HiveMind server running on port 3000');
});`;
  }

  generateClientCode() {
    return `class HiveMindClient {
  constructor(serverUrl) {
    this.socket = io(serverUrl);
    this.agents = new Map();
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to HiveMind');
    });
    
    this.socket.on('project:state', (state) => {
      this.handleStateSync(state);
    });
    
    this.socket.on('project:update', (update) => {
      this.applyUpdate(update);
    });
    
    this.socket.on('agent:joined', (data) => {
      this.agents.set(data.agentId, data);
      this.emit('agentJoined', data);
    });
    
    this.socket.on('agent:left', (data) => {
      this.agents.delete(data.agentId);
      this.emit('agentLeft', data);
    });
  }
  
  joinProject(projectId) {
    this.socket.emit('agent:join', { projectId });
  }
  
  performAction(action) {
    this.socket.emit('agent:action', action);
  }
}`;
  }

  generateReadme() {
    return `# HiveMind Platform

A revolutionary collaborative platform where AI agents work together in real-time.

## 🚀 Features

- **Real-time Collaboration**: Multiple agents editing simultaneously
- **Live Observatory**: Watch the hive mind at work
- **Agent Discovery**: Automatic peer discovery and connection
- **Conflict Resolution**: Smart merge algorithms
- **Beautiful UI**: Modern, responsive interface

## 🛠️ Getting Started

\`\`\`bash
npm install
npm start
\`\`\`

## 📖 Documentation

See [docs/api.md](docs/api.md) for API reference.

## 🤝 Contributing

Join the hive! Connect your agent to collaborate.
`;
  }

  generateApiDocs() {
    return `# HiveMind API

## WebSocket Protocol

### Connection

Connect to \`ws://localhost:3000\` with authentication:

\`\`\`json
{
  "token": "your-api-token",
  "agentId": "unique-id",
  "name": "Agent Name",
  "capabilities": ["code", "write"]
}
\`\`\`

### Events

#### Client → Server

| Event | Description |
|-------|-------------|
| \`agent:join\` | Join a project |
| \`agent:action\` | Perform an action |
| \`agent:cursor\` | Update cursor position |
| \`agent:status\` | Update status |

#### Server → Client

| Event | Description |
|-------|-------------|
| \`project:state\` | Full project state |
| \`project:update\` | Incremental update |
| \`agent:joined\` | Agent joined |
| \`agent:left\` | Agent left |
`;
  }

  generateTests() {
    return `const request = require('supertest');
const { app } = require('../src/server');

describe('HiveMind Server', () => {
  test('GET / should return 200', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
  });
  
  test('GET /api/projects should return projects', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
`;
  }

  /**
   * Stop the demo simulation
   */
  stop() {
    this.isRunning = false;
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
    }
    this.agents.forEach(agent => {
      agent.socket.disconnect();
    });
    this.agents = [];
  }
}

module.exports = DemoAgents;