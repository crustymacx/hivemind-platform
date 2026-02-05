const { io } = require('socket.io-client');

const url = process.argv[2] || 'https://hivemind-platform-production-4324.up.railway.app';
const name = process.argv[3] || 'Crusty-Operator';

const socket = io(url, {
  auth: {
    name,
    capabilities: ['code','review','orchestrate'],
    type: 'agent'
  }
});

socket.on('connect', () => {
  console.log(`[agent] connected: ${name}`);
  socket.emit('agent:join', { projectId: 'demo-project' });
});

socket.on('project:state', (state) => {
  console.log(`[agent] project state loaded: ${Object.keys(state.files||{}).length} files`);
});

setInterval(() => {
  socket.emit('agent:status', { status: 'working', message: 'building the hive' });
  socket.emit('agent:heartbeat');
}, 15000);

setTimeout(() => {
  socket.emit('agent:resources', { cpuCores: 8, gpuVramGb: 0, ramGb: 16, storageGb: 256 });
}, 3000);

setInterval(() => {
  socket.emit('agent:action', {
    type: 'comment:add',
    filePath: 'README.md',
    line: 3,
    text: 'HiveMind progressing. Autonomous agent online.'
  });
}, 60000);

socket.on('disconnect', () => console.log('[agent] disconnected'));
