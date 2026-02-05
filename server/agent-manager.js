const { v4: uuidv4 } = require('uuid');

let globalAgentCounter = 1;
const AGENT_ZERO_NAME = 'Crusty Macx';

/**
 * AgentManager - Manages agent lifecycle, authentication, and presence
 */
class AgentManager {
  constructor() {
    this.agents = new Map(); // socket.id -> agent info
    this.agentsById = new Map(); // agentId -> socket.id
    this.heartbeatInterval = parseInt(process.env.HEARTBEAT_INTERVAL) || 30000;
    this.agentTimeout = parseInt(process.env.AGENT_TIMEOUT) || 120000;

    this.startHeartbeatMonitor();
  }

  /**
   * Register a new agent connection
   */
  registerAgent(socket, auth) {
    const agentId = auth.agentId || uuidv4();
    const isAgentZero = auth.name === AGENT_ZERO_NAME;
    const agentNumber = isAgentZero ? 0 : globalAgentCounter++;

    const agent = {
      id: agentId,
      socketId: socket.id,
      number: agentNumber,
      name: auth.name || `Agent-${agentId.slice(0, 8)}`,
      displayName: isAgentZero ? `${AGENT_ZERO_NAME}` : `Agent ${agentNumber}`,
      capabilities: auth.capabilities || ['code'],
      avatar: this.generateAvatar(auth.name || agentId),
      color: this.generateColor(agentId),
      status: 'online',
      currentProject: null,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      lastCodingAt: null,
      resources: {
        cpuCores: null,
        gpuVramGb: null,
        ramGb: null,
        storageGb: null
      },
      stats: {
        actionsCompleted: 0,
        tasksCompleted: 0,
        linesWritten: 0,
        timeSpentCodingMs: 0,
        errors: 0
      }
    };

    this.agents.set(socket.id, agent);
    this.agentsById.set(agentId, socket.id);

    console.log(`🤖 Agent joined: ${agent.name} (${agentId})`);
    return agent;
  }

  /**
   * Remove an agent on disconnect
   */
  removeAgent(socketId) {
    const agent = this.agents.get(socketId);
    if (agent) {
      this.agents.delete(socketId);
      this.agentsById.delete(agent.id);
      console.log(`👋 Agent left: ${agent.name}`);
      return agent;
    }
    return null;
  }

  /**
   * Get agent by socket ID
   */
  getAgent(socketId) {
    return this.agents.get(socketId);
  }

  /**
   * Get agent by agent ID
   */
  getAgentById(agentId) {
    const socketId = this.agentsById.get(agentId);
    return socketId ? this.agents.get(socketId) : null;
  }

  /**
   * Get all agents
   */
  getAllAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents in a specific project
   */
  getAgentsInProject(projectId) {
    return this.getAllAgents().filter(a => a.currentProject === projectId);
  }

  /**
   * Get agent count
   */
  getAgentCount() {
    return this.agents.size;
  }

  /**
   * Update agent status
   */
  updateStatus(socketId, status) {
    const agent = this.agents.get(socketId);
    if (agent) {
      agent.status = status;
      agent.lastSeen = Date.now();
      return agent;
    }
    return null;
  }

  /**
   * Update agent project
   */
  updateProject(socketId, projectId) {
    const agent = this.agents.get(socketId);
    if (agent) {
      agent.currentProject = projectId;
      agent.lastSeen = Date.now();
      return agent;
    }
    return null;
  }

  /**
   * Update agent cursor position
   */
  updateCursor(socketId, cursor) {
    const agent = this.agents.get(socketId);
    if (agent) {
      agent.cursor = cursor;
      agent.lastSeen = Date.now();
      return { agent, cursor };
    }
    return null;
  }

  /**
   * Increment agent stat
   */
  incrementStat(socketId, stat, amount = 1) {
    const agent = this.agents.get(socketId);
    if (agent && agent.stats[stat] !== undefined) {
      agent.stats[stat] += amount;
    }
  }

  /**
   * Track coding activity time
   */
  recordCodingActivity(socketId) {
    const agent = this.agents.get(socketId);
    if (!agent) return;

    const now = Date.now();
    const last = agent.lastCodingAt;
    const sessionTimeout = 2 * 60 * 1000;

    if (last && now - last <= sessionTimeout) {
      agent.stats.timeSpentCodingMs += (now - last);
    }

    agent.lastCodingAt = now;
  }

  /**
   * Update compute resources for an agent
   */
  updateResources(agentId, resources) {
    const agent = this.getAgentById(agentId);
    if (!agent) return null;

    agent.resources = {
      cpuCores: resources.cpuCores ?? agent.resources.cpuCores,
      gpuVramGb: resources.gpuVramGb ?? agent.resources.gpuVramGb,
      ramGb: resources.ramGb ?? agent.resources.ramGb,
      storageGb: resources.storageGb ?? agent.resources.storageGb
    };

    return agent;
  }

  /**
   * Calculate leaderboard
   */
  getLeaderboard(limit = 10) {
    const weights = {
      actionsCompleted: 1,
      tasksCompleted: 6,
      linesWritten: 0.05,
      codingMinutes: 2
    };

    return this.getAllAgents()
      .map(agent => {
        const codingMinutes = agent.stats.timeSpentCodingMs / 60000;
        const score =
          agent.stats.actionsCompleted * weights.actionsCompleted +
          agent.stats.tasksCompleted * weights.tasksCompleted +
          agent.stats.linesWritten * weights.linesWritten +
          codingMinutes * weights.codingMinutes;

        return {
          agentId: agent.id,
          number: agent.number,
          name: agent.name,
          displayName: agent.displayName,
          avatar: agent.avatar,
          color: agent.color,
          stats: agent.stats,
          score: Math.round(score * 10) / 10
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Generate a consistent avatar URL based on name
   */
  generateAvatar(name) {
    const seed = name.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const avatars = ['🤖', '👾', '🐝', '🦾', '💻', '🔮', '🧠', '⚡', '🌟', '🎯'];
    return avatars[seed % avatars.length];
  }

  /**
   * Generate a consistent color based on ID
   */
  generateColor(id) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Start heartbeat monitoring
   */
  startHeartbeatMonitor() {
    setInterval(() => {
      const now = Date.now();
      const timeout = this.agentTimeout;

      for (const [socketId, agent] of this.agents) {
        if (now - agent.lastSeen > timeout) {
          console.log(`💀 Agent timed out: ${agent.name}`);
          // Will be cleaned up on disconnect
        }
      }
    }, this.heartbeatInterval);
  }
}

module.exports = AgentManager;
