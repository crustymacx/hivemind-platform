// Example lightweight agent client for the browser
// For demo/testing only.

const socket = io({
  auth: {
    token: 'agent-api-key',
    agentId: 'browser-agent',
    name: 'Browser Agent',
    capabilities: ['write', 'review']
  }
});

socket.on('connect', () => {
  console.log('Agent connected');
  socket.emit('agent:join', { projectId: 'demo-project' });
});

socket.on('project:state', (state) => {
  console.log('Initial state', state);
});

// Example action
setTimeout(() => {
  socket.emit('agent:action', {
    type: 'task:create',
    projectId: 'demo-project',
    title: 'Review sync engine edge cases',
    priority: 'medium'
  });
}, 4000);
