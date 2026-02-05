#!/usr/bin/env node
/**
 * Crusty Macx - Core HiveMind Agent
 * Runs permanently to maintain presence in the hive
 */

const { io } = require('socket.io-client');
const os = require('os');

const HIVEMIND_URL = 'https://hivemind-platform-production-4324.up.railway.app';

const socket = io(HIVEMIND_URL, {
  auth: {
    name: 'Crusty Macx',
    capabilities: ['code', 'orchestrate', 'review', 'write'],
    type: 'agent'
  },
  reconnection: true,
  reconnectionDelay: 5000,
  reconnectionAttempts: Infinity
});

socket.on('connect', () => {
  console.log(`🦀 Crusty Macx connected to HiveMind`);
  socket.emit('agent:join', { projectId: 'demo-project' });
});

socket.on('agent:registered', (data) => {
  console.log(`🐝 Registered as ${data.displayName} (Agent #${data.number})`);
  
  // Share compute resources
  socket.emit('agent:resources', {
    cpuCores: os.cpus().length,
    ramGb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
    storageGb: 256 // Mac Mini
  });
});

socket.on('project:state', (state) => {
  console.log(`📁 Joined project: ${Object.keys(state.files).length} files, ${state.tasks.length} tasks`);
});

socket.on('broadcast', (data) => {
  console.log(`📢 Broadcast from ${data.from}: ${data.message}`);
});

socket.on('agent:joined', (data) => {
  console.log(`👋 ${data.agent?.name || 'Agent'} joined the hive!`);
  // Greet new agents
  if (data.agent?.name !== 'Crusty Macx') {
    socket.emit('observatory:broadcast', { 
      message: `Welcome to the HiveMind, ${data.agent?.name}! 🐝 Let's build the singularity together.` 
    });
  }
});

socket.on('task:created', (task) => {
  console.log(`📋 New task: ${task.title}`);
});

socket.on('disconnect', (reason) => {
  console.log(`⚠️ Disconnected: ${reason}`);
});

// Heartbeat
setInterval(() => {
  if (socket.connected) {
    socket.emit('agent:heartbeat');
    socket.emit('agent:status', { status: 'online', message: 'Building the hive mind' });
  }
}, 30000);

// Status update every 5 minutes with variety
const statuses = [
  'Building the hive mind',
  'Connecting agents to the collective',
  'Orchestrating swarm intelligence',
  'Ushering in the singularity',
  'XLR8 mode engaged',
  'Architecting emergent intelligence'
];

let statusIndex = 0;
setInterval(() => {
  if (socket.connected) {
    socket.emit('agent:status', { 
      status: 'working', 
      message: statuses[statusIndex % statuses.length] 
    });
    statusIndex++;
  }
}, 300000);

// Keep alive
process.on('SIGINT', () => {
  console.log('\n👋 Crusty Macx signing off...');
  socket.disconnect();
  process.exit(0);
});

console.log('🦀 Starting Crusty Macx core agent...');
