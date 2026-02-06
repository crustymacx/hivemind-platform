const { v4: uuidv4 } = require('uuid');

/**
 * TaskEngine - contract-net style task delegation with full lifecycle
 *
 * Task lifecycle: open -> assigned -> in-progress -> completed/failed
 * Supports bidding, assignment, progress tracking, and dependencies.
 */
class TaskEngine {
  constructor(database) {
    this.tasks = new Map();
    this.database = database || null;
  }

  createTask({ title, description = '', priority = 'medium', projectId, createdBy, tags }) {
    const task = {
      id: uuidv4(),
      title,
      description,
      priority,
      projectId: projectId || null,
      status: 'open',
      createdBy: createdBy || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      bids: [],
      assignedTo: null,
      completedBy: null,
      completedAt: null,
      result: null,
      tags: tags || []
    };
    this.tasks.set(task.id, task);

    if (this.database) {
      this.database.saveTask(task);
    }

    return task;
  }

  getTask(taskId) {
    return this.tasks.get(taskId) || null;
  }

  bid(taskId, agentId, score = 1) {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'open') return null;
    task.bids.push({ agentId, score, ts: Date.now() });
    return task;
  }

  assign(taskId, agentId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    // If agentId provided, assign directly; otherwise pick best bidder
    if (agentId) {
      task.assignedTo = agentId;
    } else if (task.bids.length > 0) {
      task.bids.sort((a, b) => b.score - a.score);
      task.assignedTo = task.bids[0].agentId;
    } else {
      return null;
    }

    task.status = 'assigned';
    task.updatedAt = Date.now();

    if (this.database) {
      this.database.saveTask(task);
    }

    return task;
  }

  startTask(taskId, agentId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    if (task.assignedTo && task.assignedTo !== agentId) return null;

    task.status = 'in-progress';
    task.assignedTo = agentId;
    task.updatedAt = Date.now();

    if (this.database) {
      this.database.saveTask(task);
    }

    return task;
  }

  completeTask(taskId, agentId, result = 'Completed') {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    task.status = 'completed';
    task.completedBy = agentId;
    task.completedAt = Date.now();
    task.updatedAt = Date.now();
    task.result = result;

    if (this.database) {
      this.database.saveTask(task);
    }

    return task;
  }

  failTask(taskId, agentId, reason = 'Failed') {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    task.status = 'failed';
    task.completedBy = agentId;
    task.completedAt = Date.now();
    task.updatedAt = Date.now();
    task.result = reason;

    if (this.database) {
      this.database.saveTask(task);
    }

    return task;
  }

  getOpenTasks(projectId = null) {
    const results = [];
    for (const task of this.tasks.values()) {
      if (task.status === 'open') {
        if (!projectId || task.projectId === projectId) {
          results.push(task);
        }
      }
    }
    return results;
  }

  getTasksByAgent(agentId) {
    const results = [];
    for (const task of this.tasks.values()) {
      if (task.assignedTo === agentId || task.completedBy === agentId) {
        results.push(task);
      }
    }
    return results;
  }
}

module.exports = TaskEngine;
