const { v4: uuidv4 } = require('uuid');

/**
 * MemoryBus - shared event-sourced memory across agents/projects
 * Stores events + derived state snapshots for quick retrieval.
 */
class MemoryBus {
  constructor(database) {
    this.events = []; // in-memory event log for real-time access
    this.byProject = new Map();
    this.database = database || null;
  }

  append(event) {
    const enriched = {
      id: uuidv4(),
      ts: Date.now(),
      ...event
    };
    this.events.push(enriched);

    if (event.projectId) {
      if (!this.byProject.has(event.projectId)) this.byProject.set(event.projectId, []);
      this.byProject.get(event.projectId).push(enriched);
    }

    // Persist to database
    if (this.database) {
      this.database.appendEvent({
        type: event.type || 'unknown',
        projectId: event.projectId || null,
        agentId: event.agentId || event.author || null,
        data: event
      });
    }

    return enriched;
  }

  getRecent(limit = 50, projectId = null) {
    const list = projectId ? (this.byProject.get(projectId) || []) : this.events;
    return list.slice(-limit);
  }
}

module.exports = MemoryBus;
