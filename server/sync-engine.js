/**
 * SyncEngine - Handles real-time state synchronization using Operational Transform
 * Simplified CRDT-like approach for collaborative editing
 */
class SyncEngine {
  constructor() {
    this.operations = new Map(); // projectId -> list of operations
    this.cursors = new Map(); // projectId -> map of agent cursors
    this.versions = new Map(); // projectId -> version number
  }

  /**
   * Initialize sync for a project
   */
  initializeProject(projectId) {
    if (!this.operations.has(projectId)) {
      this.operations.set(projectId, []);
      this.cursors.set(projectId, new Map());
      this.versions.set(projectId, 0);
    }
  }

  /**
   * Apply an operation to a document
   */
  applyOperation(projectId, operation) {
    this.initializeProject(projectId);
    
    const ops = this.operations.get(projectId);
    const version = this.versions.get(projectId) + 1;
    
    const op = {
      ...operation,
      version,
      timestamp: Date.now(),
      id: `${operation.agentId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    ops.push(op);
    this.versions.set(projectId, version);
    
    // Trim old operations (keep last 1000)
    if (ops.length > 1000) {
      this.operations.set(projectId, ops.slice(-1000));
    }
    
    return op;
  }

  /**
   * Get operations since a version
   */
  getOperationsSince(projectId, sinceVersion) {
    const ops = this.operations.get(projectId) || [];
    return ops.filter(op => op.version > sinceVersion);
  }

  /**
   * Get current version
   */
  getVersion(projectId) {
    return this.versions.get(projectId) || 0;
  }

  /**
   * Update cursor position for an agent
   */
  updateCursor(projectId, agentId, cursor) {
    this.initializeProject(projectId);
    const cursors = this.cursors.get(projectId);
    cursors.set(agentId, {
      ...cursor,
      timestamp: Date.now()
    });
    return { agentId, cursor: cursors.get(agentId) };
  }

  /**
   * Get all cursors for a project
   */
  getCursors(projectId) {
    const cursors = this.cursors.get(projectId);
    if (!cursors) return {};
    
    const result = {};
    const now = Date.now();
    const timeout = 60000; // 1 minute
    
    for (const [agentId, cursor] of cursors) {
      if (now - cursor.timestamp < timeout) {
        result[agentId] = cursor;
      }
    }
    
    return result;
  }

  /**
   * Remove cursor when agent leaves
   */
  removeCursor(projectId, agentId) {
    const cursors = this.cursors.get(projectId);
    if (cursors) {
      cursors.delete(agentId);
    }
  }

  /**
   * Transform cursor positions after an edit
   * Simplified: just notify clients to re-sync
   */
  transformCursors(projectId, operation) {
    // In a full implementation, this would adjust cursor positions
    // based on insertions/deletions before the cursor
    // For now, clients re-sync on each operation
  }

  /**
   * Create a text patch from old to new content
   */
  createPatch(oldContent, newContent, filePath, agentId) {
    // Simple line-based diff for now
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    // Find changed lines
    const changes = [];
    const maxLen = Math.max(oldLines.length, newLines.length);
    
    for (let i = 0; i < maxLen; i++) {
      if (oldLines[i] !== newLines[i]) {
        changes.push({
          line: i,
          old: oldLines[i] || '',
          new: newLines[i] || ''
        });
      }
    }
    
    return {
      type: 'text:patch',
      filePath,
      changes,
      agentId,
      timestamp: Date.now()
    };
  }

  /**
   * Resolve conflicts between concurrent edits
   * Simple last-write-wins with conflict marking
   */
  resolveConflict(localOp, remoteOp) {
    if (localOp.timestamp > remoteOp.timestamp) {
      return { winner: localOp, loser: remoteOp };
    } else {
      return { winner: remoteOp, loser: localOp };
    }
  }

  /**
   * Generate sync state for a new connection
   */
  generateSyncState(project) {
    return {
      projectId: project.id,
      version: this.getVersion(project.id),
      files: project.files,
      tasks: project.tasks,
      cursors: this.getCursors(project.id),
      timestamp: Date.now()
    };
  }
}

module.exports = SyncEngine;