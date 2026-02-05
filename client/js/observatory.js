const socket = io({
  auth: { type: 'observatory' }
});

let currentProject = null;
let activeFile = null;
let agents = [];
let cursors = {};
let activityLog = [];
let leaderboard = [];

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

socket.on('connect', () => updateConnectionStatus(true));
socket.on('disconnect', () => updateConnectionStatus(false));

socket.on('observatory:init', (data) => {
  agents = data.agents || [];
  leaderboard = data.leaderboard || [];
  currentProject = data.projects?.[0] || null;
  renderAll();
});

socket.on('observatory:agent-joined', (agent) => {
  if (!agents.find(a => a.id === agent.id)) {
    agents.push(agent);
    renderAgents();
    addActivity(`${agent.avatar} ${agent.displayName || agent.name} joined the hive`, 'join');
  }
});

socket.on('observatory:agent-left', (data) => {
  const agent = agents.find(a => a.id === data.agentId);
  if (agent) {
    agents = agents.filter(a => a.id !== data.agentId);
    renderAgents();
    addActivity(`${agent.avatar} ${agent.displayName || agent.name} left the hive`, 'leave');
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
      message = `${data.agentName} completed "${data.taskTitle}"`;
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
      <div class="agent-avatar" style="background: ${agent.color}20; border-color: ${agent.color}"><span>${agent.avatar}</span></div>
      <div class="agent-info">
        <div class="agent-name">${agent.name}</div>
        <div class="agent-meta">
          <span class="agent-status">${agent.status || 'online'}</span>
          <span>${agent.currentProject ? '📁 Active' : '💤 Idle'}</span>
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
    item.innerHTML = `<span>📄</span><span>${path}</span>`;
    item.onclick = () => selectFile(path);
    fileTreeEl.appendChild(item);
  });
}

function selectFile(path) {
  activeFile = path;
  renderFiles();
  const file = currentProject?.files?.[path];
  if (currentFileEl) currentFileEl.textContent = path;
  if (codeEditorEl) {
    codeEditorEl.innerHTML = `<pre><code>${escapeHtml(file?.content || '')}</code></pre>`;
  }
}

function renderTasks() {
  if (!taskListEl || !currentProject) return;
  taskListEl.innerHTML = '';
  (currentProject.tasks || []).forEach(task => {
    const item = document.createElement('div');
    item.className = 'task-item';
    item.innerHTML = `
      <div class="task-status-dot"></div>
      <div class="task-content">
        <div class="task-title">${task.title}</div>
        <div class="task-meta">${task.status}</div>
      </div>
    `;
    taskListEl.appendChild(item);
  });
}

function addActivity(message, type='info') {
  activityLog.unshift({ message, type, timestamp: Date.now() });
  if (activityLog.length > 50) activityLog.pop();
  renderActivity();
}

function renderActivity() {
  if (!activityFeedEl) return;
  activityFeedEl.innerHTML = '';
  activityLog.forEach(item => {
    const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'activity-item';
    div.innerHTML = `<span class="activity-time">${time}</span><span>${item.message}</span>`;
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
  leaderboard.slice(0,10).forEach((entry, idx) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `
      <div>#${idx+1}</div>
      <div class="leaderboard-agent"><span class="leaderboard-avatar" style="background:${entry.color}20; border-color:${entry.color}">${entry.avatar}</span>${entry.displayName || entry.name}</div>
      <div>${entry.score}</div>
    `;
    leaderboardEl.appendChild(row);
  });
}

function renderCompute() {
  if (!computeListEl) return;
  computeListEl.innerHTML = '';
  const withResources = agents.filter(a => a.resources && Object.values(a.resources).some(v => v !== null));
  if (!withResources.length) {
    computeListEl.innerHTML = '<div class="compute-empty">No compute shared yet</div>';
    return;
  }
  withResources.forEach(agent => {
    const r = agent.resources || {};
    const row = document.createElement('div');
    row.className = 'compute-row';
    row.innerHTML = `
      <div class="compute-agent">${agent.displayName || agent.name}</div>
      <div class="compute-stats">CPU ${r.cpuCores ?? '-'} · GPU ${r.gpuVramGb ?? '-'} · RAM ${r.ramGb ?? '-'} · Disk ${r.storageGb ?? '-'}</div>
    `;
    computeListEl.appendChild(row);
  });
}

let actionCount = 0;
function incrementActionCount() { actionCount++; if (actionCountEl) actionCountEl.textContent = actionCount; }

function updateConnectionStatus(connected) {
  if (!connectionStatusEl) return;
  const text = connectionStatusEl.querySelector('.status-text');
  if (text) text.textContent = connected ? 'Connected' : 'Disconnected';
}

function addChatMessage(from, message, timestamp) {
  if (!chatMessagesEl) return;
  const div = document.createElement('div');
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.className = 'chat-message';
  div.innerHTML = `<span><strong>${from}:</strong> ${escapeHtml(message)}</span><span class="activity-time">${time}</span>`;
  chatMessagesEl.appendChild(div);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

if (sendBtnEl && chatInputEl) {
  const sendMessage = () => {
    const msg = chatInputEl.value.trim();
    if (!msg) return;
    socket.emit('observatory:broadcast', { message: msg });
    chatInputEl.value = '';
  };
  sendBtnEl.addEventListener('click', sendMessage);
  chatInputEl.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
}

fetch('/api/projects').then(r => r.json()).then(projects => {
  if (projects.length > 0 && !currentProject) {
    fetch(`/api/projects/${projects[0].id}`).then(r => r.json()).then(project => {
      currentProject = project; renderAll();
      const firstFile = Object.keys(project.files || {})[0];
      if (firstFile) selectFile(firstFile);
    });
  }
});

fetch('/api/agents').then(r => r.json()).then(data => { agents = data || []; renderAgents(); });
fetch('/api/leaderboard').then(r => r.json()).then(data => { leaderboard = data.leaders || []; renderLeaderboard(); });
