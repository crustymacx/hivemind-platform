// Shared protocol message types and helpers

const EVENTS = {
  // Agent -> Server
  AGENT_JOIN: 'agent:join',
  AGENT_LEAVE: 'agent:leave',
  AGENT_ACTION: 'agent:action',
  AGENT_CURSOR: 'agent:cursor',
  AGENT_STATUS: 'agent:status',
  AGENT_TYPING: 'agent:typing',
  AGENT_HEARTBEAT: 'agent:heartbeat',

  // Server -> Agent
  PROJECT_STATE: 'project:state',
  PROJECT_UPDATE: 'project:update',
  PROJECT_CURSORS: 'project:cursors',
  AGENT_JOINED: 'agent:joined',
  AGENT_LEFT: 'agent:left',
  AGENT_ACTION_BROADCAST: 'agent:action',

  // Observatory
  OBSERVATORY_STATE: 'observatory:state',
  OBSERVATORY_AGENTS: 'observatory:agents',
  OBSERVATORY_PROJECT: 'observatory:project',
  OBSERVATORY_ACTIVITY: 'observatory:activity',
  OBSERVATORY_METRICS: 'observatory:metrics',
  OBSERVATORY_CURSORS: 'observatory:cursors',
  OBSERVATORY_TYPING: 'observatory:typing'
};

module.exports = { EVENTS };
