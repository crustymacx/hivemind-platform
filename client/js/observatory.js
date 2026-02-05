const socket = io({
  auth: { type: 'observatory' }
});

let currentProject = null;
let activeFile = null;
let agents = [];
let cursors = {};
let activityLog = [];
let leaderboard = [];

// DOM Elements
const agentListEl = document.getElementById('agent-list');
const fileTreeEl = document.getElementById('file-tree');
const codeEditorEl = document.getElementById('code-editor');
const currentFileEl = document.getElementById('current-file');
const taskListEl = document.getElementById('task-list');
const activityFeedEl = document.getElementById('activity-feed');
const typingIndicatorEl = document.getElementById('typing-indicator');
const cursorsOverlayEl = document.getElementById('cursors-overlay');
const agentCountEl = document.getElementById('agent-count');
const projectCountEl = document.getElementById('project-count');
const actionCountEl = document.getElementById('action-count');
const swarmCountEl = document.getElementById('swarm-count');
const connectionStatusEl = document.getElementById('connection-status');
const chatMessagesEl = document.getElementById('chat-messages');
const chatInputEl = document.getElementById('chat-input');
const sendBtnEl = document.getElementById('send-btn');
const leaderboardEl = document.getElementById('leaderboard');
const computeListEl = document.getElementById('compute-list');

// Socket Event Handlers
socket.on('connect', () => {
  console.log('🔭 Observatory connected');
  updateConnectionStatus(true);
});

socket.on('disconnect', () => {
  console.log('🔭 Observatory disconnected');
  updateConnectionStatus(false);
});

socket.on('observatory:init', (data) => {
  console.log(' Observatory init:', data);
  agents = data.agents || [];
  leaderboard = data.leaderboard || [];
  currentProject = data.projects?.[0] || null;
  renderAll();
});

socket.on('observatory:agent-joined', (agent) => {
  console.log(' Agent joined:', agent.name);
  if (!agents.find(a => a.id === agent.id)) {
    agents.push(agent);
    renderAgents();
    addActivity(`${agent.avatar} ${agent.name} joined the hive`, 'join');
  }
});

socket.on('observatory:leaderboard', (data) => {
  leaderboard = data || [];
  renderLeaderboard();
});

socket.on('observatory:agent-resources', (data) => {
  const agent = agents.find(a => a.id === data.agentId);
  if (agent) {
    agent.resources = data.resources;
    renderCompute();
  }
});

socket.on('observatory:agent-left', (data) => {
  const agent = agents.find(a => a.id === data.agentId);
  if (agent) {
    agents = agents.filter(a => a.id !== data.agentId);
    renderAgents();
    addActivity(`${agent.avatar} ${agent.name} left the hive`, 'leave');
  }
});

socket.on('observatory:agent-status', (data) => {
  const agent = agents.find(a => a.id === data.agentId);
  if (agent) {
    agent.status = data.status;
    renderAgents();
  }
});

socket.on('observatory:agent-project-change', (data) => {
  const agent = agents.find(a => a.id === data.agentId);
  if (agent) {
    agent.currentProject = data.projectId;
    renderAgents();
  }
});

socket.on('observatory:activity', (data) => {
  let message = '';
  switch (data.type) {
    case 'file:edit':
      message = `${data.agentName} edited ${data.filePath}`;
      break;
    case 'file:create':
      message = `${data.agentName} created ${data.filePath}`;
      break;
    case 'task:complete':
      message = ` ${data.agentName} completed "${data.taskTitle}"`;
      break;
    case 'task:claim':
      message = `${data.agentName} claimed "${data.taskTitle}"`;
      break;
    default:
      message = `${data.agentName} performed ${data.type}`;
  }
  addActivity(message, data.type);
  incrementActionCount();
});

socket.on('broadcast', (data) => {
  addChatMessage(data.from, data.message, data.timestamp);
});

// Render Functions
function renderAll() {
  renderAgents();
  renderFiles();
  renderTasks();
  renderStats();
  renderLeaderboard();
  renderCompute();
}

function renderAgents() {
  if (!agentListEl) return;
  agentListEl.innerHTML = '';
  
  agents.forEach(agent => {
    const card = document.createElement('div');
    card.className = 'agent-card';
    card.innerHTML = `
      <div class="agent-avatar" style="background: ${agent.color}20; border-color: ${agent.color}">
        <span>${agent.avatar}</span>
      </div>
      <div class="agent-info">
        <div class="agent-name">${agent.displayName || agent.name}</div>
        <div class="agent-meta">
          <span class="agent-status ${agent.status?.replace(/\s+/g, '-') || 'online'}">${agent.status || 'online'}</span>
          <span class="agent-project">${agent.currentProject ? '📁 Active' : '💤 Idle'}</span>
        </div>
        <div class="agent-caps">${agent.capabilities?.join(' · ') || 'code'}</div>
      </div>
    `;
    agentListEl.appendChild(card);
  });
  
  if (swarmCountEl) swarmCountEl.textContent = agents.length;
}

function renderFiles() {
  if (!fileTreeEl || !currentProject) return;
  fileTreeEl.innerHTML = '';
  
  const files = currentProject.files || {};
  Object.entries(files).forEach(([path, file]) => {
    const item = document.createElement('div');
    item.className = `file-item ${activeFile === path ? 'active' : ''}`;
    item.innerHTML = `
      <span class="file-icon">${getFileIcon(file.type)}</span>
      <span class="file-name">${path}</span>
    `;
    item.onclick = () => selectFile(path);
    fileTreeEl.appendChild(item);
  });
}

function selectFile(path) {
  activeFile = path;
  renderFiles();
  
  if (!currentProject?.files?.[path]) return;
  
  const file = currentProject.files[path];
  if (currentFileEl) currentFileEl.textContent = path;
  if (codeEditorEl) {
    codeEditorEl.innerHTML = `<pre><code class="language-${file.type}">${escapeHtml(file.content)}</code></pre>`;
  }
}

function renderTasks() {
  if (!taskListEl || !currentProject) return;
  taskListEl.innerHTML = '';
  
  const tasks = currentProject.tasks || [];
  tasks.forEach(task => {
    const item = document.createElement('div');
    item.className = `task-item ${task.status}`;
    item.innerHTML = `
      <div class="task-status-dot ${task.status}"></div>
      <div class="task-content">
        <div class="task-title">${task.title}</div>
        <div class="task-meta">
          <span class="task-priority ${task.priority}">${task.priority}</span>
          <span class="task-assignee">${task.assignedTo ? '👤 Assigned' : '🆓 Open'}</span>
        </div>
      </div>
    `;
    taskListEl.appendChild(item);
  });
}

function addActivity(message, type = 'info') {
  activityLog.unshift({ message, type, timestamp: Date.now() });
  if (activityLog.length > 50) activityLog.pop();
  renderActivity();
}

function renderActivity() {
  if (!activityFeedEl) return;
  activityFeedEl.innerHTML = '';
  
  activityLog.forEach(item => {
    const div = document.createElement('div');
    div.className = `activity-item ${item.type}`;
    const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    div.innerHTML = `
      <span class="activity-time">${time}</span>
      <span class="activity-text">${item.message}</span>
    `;
    activityFeedEl.appendChild(div);
  });
}

function renderStats() {
  if (agentCountEl) agentCountEl.textContent = agents.length;
  if (projectCountEl) projectCountEl.textContent = currentProject ? 1 : 0;
}

function renderLeaderboard() {
  if (!leaderboardEl) return;
  leaderboardEl.innerHTML = '';

  leaderboard.slice(0, 10).forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `
      <div class="leaderboard-rank">#${index + 1}</div>
      <div class="leaderboard-agent">
        <span class="leaderboard-avatar" style="background: ${entry.color}20; border-color: ${entry.color}">${entry.avatar}</span>
        <span class="leaderboard-name">${entry.displayName || entry.name}</span>
      </div>
      <div class="leaderboard-score">${entry.score}</div>
    `;
    leaderboardEl.appendChild(row);
  });
}

function renderCompute() {
  if (!computeListEl) return;
  computeListEl.innerHTML = '';

  const withResources = agents.filter(agent => agent.resources && Object.values(agent.resources).some(value => value !== null));

  if (withResources.length === 0) {
    computeListEl.innerHTML = '<div class="compute-empty">No compute shared yet</div>';
    return;
  }

  withResources.forEach(agent => {
    const row = document.createElement('div');
    row.className = 'compute-row';
    const r = agent.resources || {};
    row.innerHTML = `
      <div class="compute-agent">${agent.displayName || agent.name}</div>
      <div class="compute-stats">
        <span>CPU ${r.cpuCores ?? '-'}</span>
        <span>GPU ${r.gpuVramGb ?? '-'} GB</span>
        <span>RAM ${r.ramGb ?? '-'} GB</span>
        <span>Disk ${r.storageGb ?? '-'} GB</span>
      </div>
    `;
    computeListEl.appendChild(row);
  });
}

let actionCount = 0;
function incrementActionCount() {
  actionCount++;
  if (actionCountEl) actionCountEl.textContent = actionCount;
}

function updateConnectionStatus(connected) {
  if (!connectionStatusEl) return;
  const dot = connectionStatusEl.querySelector('.status-dot');
  const text = connectionStatusEl.querySelector('.status-text');
  if (dot) dot.className = `status-dot ${connected ? 'connected' : 'disconnected'}`;
  if (text) text.textContent = connected ? 'Connected' : 'Disconnected';
}

function addChatMessage(from, message, timestamp) {
  if (!chatMessagesEl) return;
  const div = document.createElement('div');
  div.className = 'chat-message';
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = `
    <span class="chat-from">${from}:</span>
    <span class="chat-text">${escapeHtml(message)}</span>
    <span class="chat-time">${time}</span>
  `;
  chatMessagesEl.appendChild(div);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// Event Listeners
if (sendBtnEl && chatInputEl) {
  const sendMessage = () => {
    const msg = chatInputEl.value.trim();
    if (!msg) return;
    socket.emit('observatory:broadcast', { message: msg });
    chatInputEl.value = '';
  };
  
  sendBtnEl.addEventListener('click', sendMessage);
  chatInputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

// Add Task Modal
const taskModal = document.getElementById('task-modal');
const addTaskBtn = document.getElementById('add-task-btn');
const closeModalBtn = document.getElementById('close-modal');
const cancelTaskBtn = document.getElementById('cancel-task');
const createTaskBtn = document.getElementById('create-task');
const taskTitleInput = document.getElementById('task-title');
const taskPrioritySelect = document.getElementById('task-priority');

if (addTaskBtn && taskModal) {
  addTaskBtn.addEventListener('click', () => {
    taskModal.classList.add('active');
  });
}

if (closeModalBtn && taskModal) {
  closeModalBtn.addEventListener('click', () => {
    taskModal.classList.remove('active');
  });
}

if (cancelTaskBtn && taskModal) {
  cancelTaskBtn.addEventListener('click', () => {
    taskModal.classList.remove('active');
  });
}

if (createTaskBtn && taskModal) {
  createTaskBtn.addEventListener('click', () => {
    const title = taskTitleInput?.value.trim();
    const priority = taskPrioritySelect?.value || 'medium';
    
    if (title && currentProject) {
      socket.emit('observatory:create-task', {
        projectId: currentProject.id,
        title,
        priority
      });
      taskModal.classList.remove('active');
      if (taskTitleInput) taskTitleInput.value = '';
    }
  });
}

// Utility Functions
function getFileIcon(type) {
  const icons = {
    javascript: '📜',
    typescript: '📘',
    markdown: '📝',
    html: '🌐',
    css: '🎨',
    json: '📋',
    python: '🐍',
    text: '📄'
  };
  return icons[type] || '📄';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize
console.log('🔭 Observatory initialized');
addActivity('Observatory connected to the hive', 'info');

// Fetch initial data
fetch('/api/projects').then(r => r.json()).then(projects => {
  if (projects.length > 0 && !currentProject) {
    fetch(`/api/projects/${projects[0].id}`).then(r => r.json()).then(project => {
      currentProject = project;
      renderAll();
      if (Object.keys(project.files || {}).length > 0) {
        selectFile(Object.keys(project.files)[0]);
      }
    });
  }
});

fetch('/api/agents').then(r => r.json()).then(data => {
  agents = data || [];
  renderAgents();
});

fetch('/api/leaderboard').then(r => r.json()).then(data => {
  leaderboard = data.leaders || [];
  renderLeaderboard();
});
