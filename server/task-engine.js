const { v4: uuidv4 } = require('uuid');

/**
 * TaskEngine - contract-net style task delegation
 */
class TaskEngine {
  constructor() {
    this.tasks = new Map();
  }

  createTask({ title, description = '', priority = 'medium', projectId }) {
    const task = {
      id: uuidv4(),
      title,
      description,
      priority,
      projectId,
      status: 'open',
      createdAt: Date.now(),
      bids: [],
      assignedTo: null
    };
    this.tasks.set(task.id, task);
    return task;
  }

  bid(taskId, agentId, score = 1) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.bids.push({ agentId, score, ts: Date.now() });
    return task;
  }

  assign(taskId) {
    const task = this.tasks.get(taskId);
    if (!task || task.bids.length === 0) return null;
    task.bids.sort((a,b) => b.score - a.score);
    task.assignedTo = task.bids[0].agentId;
    task.status = 'assigned';
    return task;
  }
}

module.exports = TaskEngine;
