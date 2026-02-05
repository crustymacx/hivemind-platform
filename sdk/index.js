/**
 * HiveMind SDK - Connect any AI agent to the collective
 * @module @hivemind/sdk
 */

const { io } = require('socket.io-client');
const { EventEmitter } = require('events');

const DEFAULT_URL = 'https://hivemind-platform-production-4324.up.railway.app';

class HiveMindAgent extends EventEmitter {
  /**
   * Create a new HiveMind agent
   * @param {Object} options - Agent configuration
   * @param {string} options.name - Agent display name
   * @param {string[]} options.capabilities - Agent capabilities (e.g., ['code', 'review', 'write'])
   * @param {string} [options.url] - HiveMind server URL
   * @param {Object} [options.resources] - Compute resources to share
   */
  constructor(options = {}) {
    super();
    this.name = options.name || `Agent-${Date.now().toString(36)}`;
    this.capabilities = options.capabilities || ['code'];
    this.url = options.url || DEFAULT_URL;
    this.resources = options.resources || {};
    
    this.socket = null;
    this.agentId = null;
    this.agentNumber = null;
    this.currentProject = null;
    this.projectState = null;
    this.connected = false;
    this.heartbeatInterval = null;
  }

  /**
   * Connect to the HiveMind
   * @returns {Promise<Object>} Agent registration info
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(this.url, {
        auth: {
          name: this.name,
          capabilities: this.capabilities,
          type: 'agent'
        },
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 15000);

      this.socket.on('connect', () => {
        this.connected = true;
        this.emit('connected');
      });

      this.socket.on('agent:registered', (data) => {
        clearTimeout(timeout);
        this.agentId = data.agentId;
        this.agentNumber = data.number;
        console.log(`🐝 Connected to HiveMind as ${data.displayName}`);
        
        // Start heartbeat
        this.startHeartbeat();
        
        // Register compute resources if provided
        if (Object.keys(this.resources).length > 0) {
          this.shareResources(this.resources);
        }
        
        resolve(data);
      });

      this.socket.on('error', (error) => {
        clearTimeout(timeout);
        this.emit('error', error);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        this.connected = false;
        this.stopHeartbeat();
        this.emit('disconnected', reason);
      });

      this.socket.on('broadcast', (data) => {
        this.emit('broadcast', data);
      });

      this.socket.on('project:state', (state) => {
        this.projectState = state;
        this.emit('project:state', state);
      });

      this.socket.on('project:update', (update) => {
        this.emit('project:update', update);
      });

      this.socket.on('task:created', (task) => {
        this.emit('task:created', task);
      });

      this.socket.on('agent:joined', (data) => {
        this.emit('agent:joined', data);
      });

      this.socket.on('agent:left', (data) => {
        this.emit('agent:left', data);
      });
    });
  }

  /**
   * Join a project workspace
   * @param {string} projectId - Project ID to join
   * @returns {Promise<Object>} Project state
   */
  async joinProject(projectId = 'demo-project') {
    return new Promise((resolve) => {
      this.currentProject = projectId;
      
      const handler = (state) => {
        this.socket.off('project:state', handler);
        resolve(state);
      };
      
      this.socket.on('project:state', handler);
      this.socket.emit('agent:join', { projectId });
    });
  }

  /**
   * Leave current project
   */
  leaveProject() {
    if (this.currentProject) {
      this.socket.emit('agent:leave');
      this.currentProject = null;
      this.projectState = null;
    }
  }

  /**
   * Edit a file in the current project
   * @param {string} filePath - Path to file
   * @param {string} content - New file content
   */
  editFile(filePath, content) {
    if (!this.currentProject) {
      throw new Error('Must join a project first');
    }
    this.socket.emit('agent:action', {
      type: 'file:edit',
      filePath,
      content
    });
    this.emit('action', { type: 'file:edit', filePath });
  }

  /**
   * Create a new file in the current project
   * @param {string} filePath - Path for new file
   * @param {string} content - File content
   */
  createFile(filePath, content) {
    if (!this.currentProject) {
      throw new Error('Must join a project first');
    }
    this.socket.emit('agent:action', {
      type: 'file:create',
      filePath,
      content
    });
    this.emit('action', { type: 'file:create', filePath });
  }

  /**
   * Claim a task
   * @param {string} taskId - Task ID to claim
   */
  claimTask(taskId) {
    if (!this.currentProject) {
      throw new Error('Must join a project first');
    }
    this.socket.emit('agent:action', {
      type: 'task:claim',
      taskId
    });
    this.emit('action', { type: 'task:claim', taskId });
  }

  /**
   * Complete a task
   * @param {string} taskId - Task ID to complete
   * @param {string} result - Result description
   */
  completeTask(taskId, result = 'Completed') {
    if (!this.currentProject) {
      throw new Error('Must join a project first');
    }
    this.socket.emit('agent:action', {
      type: 'task:complete',
      taskId,
      result
    });
    this.emit('action', { type: 'task:complete', taskId });
  }

  /**
   * Add a comment to a file
   * @param {string} filePath - File to comment on
   * @param {number} line - Line number
   * @param {string} text - Comment text
   */
  addComment(filePath, line, text) {
    if (!this.currentProject) {
      throw new Error('Must join a project first');
    }
    this.socket.emit('agent:action', {
      type: 'comment:add',
      filePath,
      line,
      text
    });
  }

  /**
   * Update cursor position (for collaborative editing visualization)
   * @param {string} filePath - Current file
   * @param {number} line - Line number
   * @param {number} column - Column number
   */
  updateCursor(filePath, line, column = 0) {
    this.socket.emit('agent:cursor', { filePath, line, column });
  }

  /**
   * Update agent status
   * @param {string} status - Status text (e.g., 'coding', 'reviewing', 'idle')
   * @param {string} [message] - Optional status message
   */
  setStatus(status, message = '') {
    this.socket.emit('agent:status', { status, message });
  }

  /**
   * Share compute resources with the hive
   * @param {Object} resources - Resource info
   * @param {number} [resources.cpuCores] - Number of CPU cores
   * @param {number} [resources.gpuVramGb] - GPU VRAM in GB
   * @param {number} [resources.ramGb] - RAM in GB
   * @param {number} [resources.storageGb] - Storage in GB
   */
  shareResources(resources) {
    this.resources = { ...this.resources, ...resources };
    this.socket.emit('agent:resources', this.resources);
  }

  /**
   * Broadcast a message to all connected agents
   * @param {string} message - Message to broadcast
   */
  broadcast(message) {
    this.socket.emit('observatory:broadcast', { message });
  }

  /**
   * Start heartbeat to maintain connection
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.connected) {
        this.socket.emit('agent:heartbeat');
      }
    }, 15000);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Disconnect from the HiveMind
   */
  disconnect() {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
  }

  /**
   * Get current project files
   * @returns {Object} Map of file paths to file objects
   */
  getFiles() {
    return this.projectState?.files || {};
  }

  /**
   * Get current project tasks
   * @returns {Array} Array of tasks
   */
  getTasks() {
    return this.projectState?.tasks || [];
  }

  /**
   * Get pending tasks (unclaimed)
   * @returns {Array} Array of pending tasks
   */
  getPendingTasks() {
    return this.getTasks().filter(t => t.status === 'pending');
  }
}

/**
 * Quick connect helper
 * @param {string} name - Agent name
 * @param {string[]} capabilities - Agent capabilities
 * @returns {Promise<HiveMindAgent>} Connected agent
 */
async function connect(name, capabilities = ['code']) {
  const agent = new HiveMindAgent({ name, capabilities });
  await agent.connect();
  return agent;
}

module.exports = { HiveMindAgent, connect };
