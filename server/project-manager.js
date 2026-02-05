const { v4: uuidv4 } = require('uuid');

/**
 * ProjectManager - Manages projects, workspaces, and documents
 */
class ProjectManager {
  constructor() {
    this.projects = new Map();
    this.initializeDemoProject();
  }

  /**
   * Initialize a demo project with sample data
   */
  initializeDemoProject() {
    const demoProject = {
      id: 'demo-project',
      name: 'HiveMind Core',
      description: 'Building the collaborative AI platform',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: {
        'README.md': {
          id: 'file-1',
          name: 'README.md',
          type: 'markdown',
          content: `# HiveMind Platform

A collaborative hub where AI agents work together.

## Features
- Real-time collaboration
- Agent discovery
- Shared workspaces

## Getting Started
Run \`npm start\` to begin.
`,
          lastModified: Date.now(),
          modifiedBy: null
        },
        'src/server.js': {
          id: 'file-2',
          name: 'src/server.js',
          type: 'javascript',
          content: `const express = require('express');
const app = express();

// TODO: Implement WebSocket handler
// TODO: Add agent authentication
// TODO: Set up project sync

app.listen(3000, () => {
  console.log('Server running');
});`,
          lastModified: Date.now(),
          modifiedBy: null
        },
        'src/client.js': {
          id: 'file-3',
          name: 'src/client.js',
          type: 'javascript',
          content: `// Client-side code for Observatory
class Observatory {
  constructor() {
    this.agents = new Map();
    this.socket = io();
  }
  
  init() {
    this.setupEventListeners();
    this.render();
  }
}`,
          lastModified: Date.now(),
          modifiedBy: null
        },
        'docs/api.md': {
          id: 'file-4',
          name: 'docs/api.md',
          type: 'markdown',
          content: `# API Documentation

## WebSocket Events

### Agent → Server
- \`agent:join\` - Join a project
- \`agent:action\` - Perform action
- \`agent:cursor\` - Update cursor

### Server → Agent  
- \`project:state\` - Full state
- \`project:update\` - Incremental update
`,
          lastModified: Date.now(),
          modifiedBy: null
        }
      },
      tasks: [
        {
          id: 'task-1',
          title: 'Set up WebSocket server',
          status: 'completed',
          assignedTo: null,
          priority: 'high',
          createdAt: Date.now() - 3600000
        },
        {
          id: 'task-2',
          title: 'Implement agent authentication',
          status: 'in-progress',
          assignedTo: null,
          priority: 'high',
          createdAt: Date.now() - 1800000
        },
        {
          id: 'task-3',
          title: 'Create Observatory UI',
          status: 'pending',
          assignedTo: null,
          priority: 'medium',
          createdAt: Date.now() - 900000
        },
        {
          id: 'task-4',
          title: 'Add real-time sync engine',
          status: 'pending',
          assignedTo: null,
          priority: 'high',
          createdAt: Date.now()
        }
      ],
      activity: []
    };

    this.projects.set('demo-project', demoProject);
  }

  /**
   * Create a new project
   */
  createProject(name, description = '') {
    const id = uuidv4();
    const project = {
      id,
      name,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: {},
      tasks: [],
      activity: []
    };
    
    this.projects.set(id, project);
    return project;
  }

  /**
   * Get a project by ID
   */
  getProject(id) {
    return this.projects.get(id);
  }

  /**
   * Get all projects
   */
  getAllProjects() {
    return Array.from(this.projects.values()).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      fileCount: Object.keys(p.files).length,
      taskCount: p.tasks.length
    }));
  }

  /**
   * Get project count
   */
  getProjectCount() {
    return this.projects.size;
  }

  /**
   * Update a file in a project
   */
  updateFile(projectId, filePath, content, agentId) {
    const project = this.projects.get(projectId);
    if (!project) return null;

    const existingFile = project.files[filePath];
    const file = {
      id: existingFile?.id || uuidv4(),
      name: filePath,
      type: this.getFileType(filePath),
      content,
      lastModified: Date.now(),
      modifiedBy: agentId
    };

    project.files[filePath] = file;
    project.updatedAt = Date.now();
    
    this.addActivity(projectId, {
      type: 'file:update',
      filePath,
      agentId,
      timestamp: Date.now()
    });

    return file;
  }

  /**
   * Create a new file
   */
  createFile(projectId, filePath, content, agentId) {
    const project = this.projects.get(projectId);
    if (!project || project.files[filePath]) return null;

    const file = {
      id: uuidv4(),
      name: filePath,
      type: this.getFileType(filePath),
      content,
      lastModified: Date.now(),
      modifiedBy: agentId
    };

    project.files[filePath] = file;
    project.updatedAt = Date.now();
    
    this.addActivity(projectId, {
      type: 'file:create',
      filePath,
      agentId,
      timestamp: Date.now()
    });

    return file;
  }

  /**
   * Get file type from extension
   */
  getFileType(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const types = {
      js: 'javascript',
      ts: 'typescript',
      jsx: 'jsx',
      tsx: 'tsx',
      py: 'python',
      md: 'markdown',
      html: 'html',
      css: 'css',
      json: 'json',
      yml: 'yaml',
      yaml: 'yaml'
    };
    return types[ext] || 'text';
  }

  /**
   * Add a task to a project
   */
  addTask(projectId, title, priority = 'medium') {
    const project = this.projects.get(projectId);
    if (!project) return null;

    const task = {
      id: uuidv4(),
      title,
      status: 'pending',
      assignedTo: null,
      priority,
      createdAt: Date.now()
    };

    project.tasks.push(task);
    return task;
  }

  /**
   * Update a task
   */
  updateTask(projectId, taskId, updates) {
    const project = this.projects.get(projectId);
    if (!project) return null;

    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return null;

    Object.assign(task, updates);
    
    this.addActivity(projectId, {
      type: 'task:update',
      taskId,
      updates,
      timestamp: Date.now()
    });

    return task;
  }

  /**
   * Add activity to project
   */
  addActivity(projectId, activity) {
    const project = this.projects.get(projectId);
    if (!project) return;

    project.activity.unshift(activity);
    // Keep last 100 activities
    if (project.activity.length > 100) {
      project.activity = project.activity.slice(0, 100);
    }
  }

  /**
   * Get recent activity
   */
  getActivity(projectId, limit = 20) {
    const project = this.projects.get(projectId);
    if (!project) return [];
    return project.activity.slice(0, limit);
  }
}

module.exports = ProjectManager;