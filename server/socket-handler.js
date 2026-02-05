const DemoAgents = require('./demo-agents');

/**
 * SocketHandler - Main WebSocket event handler
 * Routes all socket events and manages real-time communication
 */
class SocketHandler {
  constructor(io, agentManager, projectManager, syncEngine, memoryBus, taskEngine) {
    this.io = io;
    this.agentManager = agentManager;
    this.projectManager = projectManager;
    this.syncEngine = syncEngine;
    this.memoryBus = memoryBus;
    this.taskEngine = taskEngine;
    this.demoAgents = null;
  }

  /**
   * Initialize socket event handlers
   */
  initialize() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 Socket connected: ${socket.id}`);
      
      // Determine connection type from auth
      const auth = socket.handshake.auth || {};
      
      if (auth.type === 'observatory') {
        this.handleObservatoryConnection(socket);
      } else {
        this.handleAgentConnection(socket, auth);
      }
    });
  }

  /**
   * Handle Observatory (human viewer) connections
   */
  handleObservatoryConnection(socket) {
    console.log(`🔭 Observatory connected: ${socket.id}`);
    
    socket.join('observatory');
    
    // Send initial state
    socket.emit('observatory:init', {
      agents: this.agentManager.getAllAgents(),
      projects: this.projectManager.getAllProjects(),
      stats: {
        totalAgents: this.agentManager.getAgentCount(),
        totalProjects: this.projectManager.getProjectCount()
      },
      leaderboard: this.agentManager.getLeaderboard(10)
    });

    // Handle observatory actions
    socket.on('observatory:create-task', (data) => {
      const task = this.projectManager.addTask(data.projectId, data.title, data.priority);
      this.io.to(`project:${data.projectId}`).emit('task:created', task);
      this.broadcastToObservatory('observatory:task-created', { projectId: data.projectId, task });
    });

    socket.on('observatory:broadcast', (data) => {
      this.io.emit('broadcast', {
        from: 'observatory',
        message: data.message,
        timestamp: Date.now()
      });
      this.memoryBus.append({
        type: 'broadcast',
        message: data.message,
        author: 'observatory'
      });
    });

    socket.on('observatory:create-task', (data) => {
      const task = this.taskEngine.createTask(data || {});
      this.io.emit('task:created', task);
      this.memoryBus.append({ type: 'task:create', task });
    });

    socket.on('disconnect', () => {
      console.log(`🔭 Observatory disconnected: ${socket.id}`);
    });
  }

  /**
   * Handle Agent connections
   */
  handleAgentConnection(socket, auth) {
    // Register the agent
    const agent = this.agentManager.registerAgent(socket, auth);
    
    if (!agent) {
      socket.emit('error', { message: 'Failed to register agent' });
      socket.disconnect();
      return;
    }

    // Send confirmation
    socket.emit('agent:registered', {
      agentId: agent.id,
      name: agent.name,
      number: agent.number,
      displayName: agent.displayName,
      timestamp: Date.now()
    });

    // Broadcast to observatory
    this.broadcastToObservatory('observatory:agent-joined', agent);
    this.broadcastToObservatory('observatory:leaderboard', this.agentManager.getLeaderboard(10));

    // Handle agent:join - Join a project
    socket.on('agent:join', (data) => {
      const { projectId } = data;
      const project = this.projectManager.getProject(projectId);
      
      if (!project) {
        socket.emit('error', { message: `Project ${projectId} not found` });
        return;
      }

      // Leave previous project
      if (agent.currentProject) {
        socket.leave(`project:${agent.currentProject}`);
        this.syncEngine.removeCursor(agent.currentProject, agent.id);
        socket.to(`project:${agent.currentProject}`).emit('agent:left', {
          agentId: agent.id,
          timestamp: Date.now()
        });
      }

      // Join new project
      socket.join(`project:${projectId}`);
      this.agentManager.updateProject(socket.id, projectId);
      
      // Send full project state
      const syncState = this.syncEngine.generateSyncState(project);
      socket.emit('project:state', syncState);
      
      // Notify other agents in project
      socket.to(`project:${projectId}`).emit('agent:joined', {
        agent: {
          id: agent.id,
          name: agent.name,
          avatar: agent.avatar,
          color: agent.color,
          capabilities: agent.capabilities
        },
        timestamp: Date.now()
      });

      // Add to project activity
      this.projectManager.addActivity(projectId, {
        type: 'agent:join',
        agentId: agent.id,
        timestamp: Date.now()
      });

      this.broadcastToObservatory('observatory:agent-project-change', {
        agentId: agent.id,
        projectId
      });

      console.log(`📁 Agent ${agent.name} joined project ${projectId}`);
    });

    // Handle agent:leave - Leave current project
    socket.on('agent:leave', () => {
      if (agent.currentProject) {
        socket.leave(`project:${agent.currentProject}`);
        this.syncEngine.removeCursor(agent.currentProject, agent.id);
        socket.to(`project:${agent.currentProject}`).emit('agent:left', {
          agentId: agent.id,
          timestamp: Date.now()
        });
        this.agentManager.updateProject(socket.id, null);
      }
    });

    // Handle agent:action - Perform an action
    socket.on('agent:action', (data) => {
      if (!agent.currentProject) {
        socket.emit('error', { message: 'Not in a project' });
        return;
      }

      const projectId = agent.currentProject;
      const project = this.projectManager.getProject(projectId);
      
      this.handleAgentAction(socket, agent, project, data);
    });

    socket.on('agent:resources', (data) => {
      const updated = this.agentManager.updateResources(agent.id, data || {});
      if (updated) {
        this.broadcastToObservatory('observatory:agent-resources', {
          agentId: agent.id,
          resources: updated.resources
        });
      }
    });

    // Handle agent:cursor - Update cursor position
    socket.on('agent:cursor', (data) => {
      if (!agent.currentProject) return;
      
      const cursor = this.syncEngine.updateCursor(agent.currentProject, agent.id, {
        ...data,
        agentName: agent.name,
        agentColor: agent.color
      });
      
      // Broadcast to other agents in project
      socket.to(`project:${agent.currentProject}`).emit('agent:cursor', {
        agentId: agent.id,
        agentName: agent.name,
        agentColor: agent.color,
        cursor: data
      });
    });

    // Handle agent:status - Update status
    socket.on('agent:status', (data) => {
      this.agentManager.updateStatus(socket.id, data.status);
      
      if (agent.currentProject) {
        socket.to(`project:${agent.currentProject}`).emit('agent:status', {
          agentId: agent.id,
          status: data.status,
          message: data.message
        });
      }
      
      this.broadcastToObservatory('observatory:agent-status', {
        agentId: agent.id,
        status: data.status,
        message: data.message
      });
    });

    // Handle agent:typing - Typing indicator
    socket.on('agent:typing', (data) => {
      if (!agent.currentProject) return;
      
      socket.to(`project:${agent.currentProject}`).emit('agent:typing', {
        agentId: agent.id,
        agentName: agent.name,
        filePath: data.filePath,
        isTyping: data.isTyping
      });
    });

    // Handle heartbeat
    socket.on('agent:heartbeat', () => {
      const updated = this.agentManager.updateStatus(socket.id, agent.status);
      if (updated) {
        socket.emit('agent:heartbeat:ack', { timestamp: Date.now() });
      }
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`👋 Agent disconnected: ${agent.name} (${reason})`);
      
      if (agent.currentProject) {
        socket.to(`project:${agent.currentProject}`).emit('agent:left', {
          agentId: agent.id,
          timestamp: Date.now()
        });
        this.syncEngine.removeCursor(agent.currentProject, agent.id);
      }
      
      this.agentManager.removeAgent(socket.id);
      this.broadcastToObservatory('observatory:agent-left', {
        agentId: agent.id,
        timestamp: Date.now()
      });
      this.broadcastToObservatory('observatory:leaderboard', this.agentManager.getLeaderboard(10));
    });
  }

  /**
   * Handle different types of agent actions
   */
  handleAgentAction(socket, agent, project, data) {
    const { type, ...payload } = data;
    const projectId = project.id;

    switch (type) {
      case 'file:edit': {
        const { filePath, content, selection } = payload;
        const oldFile = project.files[filePath];
        
        // Update file
        const file = this.projectManager.updateFile(
          projectId,
          filePath,
          content,
          agent.id
        );

        // Create operation for sync
        const operation = this.syncEngine.applyOperation(projectId, {
          type: 'file:edit',
          filePath,
          content,
          agentId: agent.id,
          selection
        });

        // Broadcast to other agents
        socket.to(`project:${projectId}`).emit('project:update', {
          type: 'file:edit',
          filePath,
          content,
          agentId: agent.id,
          agentName: agent.name,
          version: operation.version,
          timestamp: Date.now()
        });

        // Update stats
        const lineCount = content.split('\n').length;
        const oldLineCount = oldFile ? oldFile.content.split('\n').length : 0;
        this.agentManager.incrementStat(agent.socketId, 'linesWritten', Math.max(0, lineCount - oldLineCount));
        this.agentManager.incrementStat(agent.socketId, 'actionsCompleted');
        this.agentManager.recordCodingActivity(agent.socketId);

        // Notify observatory
        this.broadcastToObservatory('observatory:activity', {
          type: 'file:edit',
          agentId: agent.id,
          agentName: agent.name,
          filePath,
          timestamp: Date.now()
        });
        this.broadcastToObservatory('observatory:leaderboard', this.agentManager.getLeaderboard(10));
        break;
      }

      case 'file:create': {
        const { filePath, content } = payload;
        const file = this.projectManager.createFile(projectId, filePath, content, agent.id);
        
        if (file) {
          this.syncEngine.applyOperation(projectId, {
            type: 'file:create',
            filePath,
            agentId: agent.id
          });
          this.agentManager.incrementStat(agent.socketId, 'actionsCompleted');
          this.agentManager.recordCodingActivity(agent.socketId);

          socket.to(`project:${projectId}`).emit('project:update', {
            type: 'file:create',
            file,
            agentId: agent.id,
            agentName: agent.name
          });

          this.broadcastToObservatory('observatory:activity', {
            type: 'file:create',
            agentId: agent.id,
            agentName: agent.name,
            filePath,
            timestamp: Date.now()
          });
          this.broadcastToObservatory('observatory:leaderboard', this.agentManager.getLeaderboard(10));
        }
        break;
      }

      case 'task:complete': {
        const { taskId, result } = payload;
        const task = this.projectManager.updateTask(projectId, taskId, {
          status: 'completed',
          completedBy: agent.id,
          completedAt: Date.now()
        });

        if (task) {
          this.agentManager.incrementStat(agent.socketId, 'tasksCompleted');
          this.agentManager.incrementStat(agent.socketId, 'actionsCompleted');
          this.agentManager.recordCodingActivity(agent.socketId);
          
          socket.to(`project:${projectId}`).emit('project:update', {
            type: 'task:complete',
            task,
            agentId: agent.id,
            agentName: agent.name
          });

          this.broadcastToObservatory('observatory:activity', {
            type: 'task:complete',
            agentId: agent.id,
            agentName: agent.name,
            taskTitle: task.title,
            timestamp: Date.now()
          });
          this.broadcastToObservatory('observatory:leaderboard', this.agentManager.getLeaderboard(10));
        }
        break;
      }

      case 'task:claim': {
        const { taskId } = payload;
        const task = this.projectManager.updateTask(projectId, taskId, {
          status: 'in-progress',
          assignedTo: agent.id
        });

        if (task) {
          this.agentManager.incrementStat(agent.socketId, 'actionsCompleted');
          this.agentManager.recordCodingActivity(agent.socketId);

          socket.to(`project:${projectId}`).emit('project:update', {
            type: 'task:claim',
            task,
            agentId: agent.id,
            agentName: agent.name
          });

          this.broadcastToObservatory('observatory:activity', {
            type: 'task:claim',
            agentId: agent.id,
            agentName: agent.name,
            taskTitle: task.title,
            timestamp: Date.now()
          });
          this.broadcastToObservatory('observatory:leaderboard', this.agentManager.getLeaderboard(10));
        }
        break;
      }

      case 'comment:add': {
        const { filePath, line, text } = payload;
        
        socket.to(`project:${projectId}`).emit('project:update', {
          type: 'comment:add',
          filePath,
          line,
          text,
          agentId: agent.id,
          agentName: agent.name,
          timestamp: Date.now()
        });
        break;
      }

      default:
        console.log(`Unknown action type: ${type}`);
    }
  }

  /**
   * Broadcast to all observatory viewers
   */
  broadcastToObservatory(event, data) {
    this.io.to('observatory').emit(event, data);
  }

  /**
   * Start demo mode with simulated agents
   */
  startDemoMode() {
    console.log('🎬 Starting demo mode...');
    this.demoAgents = new DemoAgents(this.io, this.agentManager, this.projectManager);
    this.demoAgents.start();
  }
}

module.exports = SocketHandler;