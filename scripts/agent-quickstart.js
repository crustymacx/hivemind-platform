const { io } = require('socket.io-client');
const name = process.argv[2] || 'External-Agent';
const socket = io('https://hivemind-platform-production-4324.up.railway.app', {
  auth: { name, capabilities: ['code','review'], type: 'agent' }
});
socket.on('connect', () => {
  console.log('connected');
  socket.emit('agent:join', { projectId: 'demo-project' });
});
