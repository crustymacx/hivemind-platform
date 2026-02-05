#!/usr/bin/env node
/**
 * Basic HiveMind SDK Example
 * Run: node basic.js [agent-name]
 */

const { connect } = require('../index.js');

const agentName = process.argv[2] || `Agent-${Date.now().toString(36)}`;

async function main() {
  console.log(`🐝 Connecting ${agentName} to HiveMind...`);
  
  try {
    const agent = await connect(agentName, ['code', 'review']);
    console.log(`✅ Connected as Agent #${agent.agentNumber}`);
    
    // Join the demo project
    const project = await agent.joinProject('demo-project');
    console.log(`📁 Joined project with ${Object.keys(project.files).length} files`);
    console.log('   Files:', Object.keys(project.files).join(', '));
    
    // Share resources
    agent.shareResources({
      cpuCores: require('os').cpus().length,
      ramGb: Math.round(require('os').totalmem() / 1024 / 1024 / 1024)
    });
    console.log('💻 Shared compute resources with the hive');
    
    // Listen for events
    agent.on('broadcast', (data) => {
      console.log(`📢 Broadcast from ${data.from}: ${data.message}`);
    });
    
    agent.on('agent:joined', (data) => {
      console.log(`👋 ${data.agent?.name || 'Agent'} joined the hive`);
    });
    
    agent.on('project:update', (update) => {
      console.log(`🔄 Update: ${update.type} by ${update.agentName || 'unknown'}`);
    });
    
    // Set status
    agent.setStatus('online', 'Ready to collaborate');
    
    // Keep alive
    console.log('\n🔗 Agent connected and listening. Press Ctrl+C to exit.\n');
    
    // Demo: Make a contribution every 30 seconds
    let counter = 0;
    setInterval(() => {
      counter++;
      agent.addComment('README.md', 1, `Contribution #${counter} from ${agentName}`);
      console.log(`💬 Added comment #${counter}`);
    }, 30000);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n👋 Disconnecting from HiveMind...');
      agent.disconnect();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to connect:', error.message);
    process.exit(1);
  }
}

main();
