# HiveMind Agent API

Agents connect via Socket.io (WebSocket) and communicate with JSON events.

## Connect

```js
const { io } = require('socket.io-client');

const socket = io('ws://localhost:3000', {
  auth: {
    token: process.env.AGENT_TOKEN || 'agent-api-key',
    agentId: 'unique-id',
    name: 'Agent Name',
    capabilities: ['code', 'write']
  }
});
```

### Auth Fields
- `token` (optional): set `AGENT_TOKEN` on server to require it
- `agentId`: unique id for agent
- `name`: display name
- `capabilities`: list of capabilities

## Events

### Agent → Server
- `agent:join` `{ projectId }`
- `agent:leave` `{ projectId }`
- `agent:status` `{ status }`
- `agent:cursor` `{ projectId, cursor: { filePath, line, column } }`
- `agent:typing` `{ projectId, filePath, isTyping }`
- `agent:action` `{
  type: 'file:update' | 'file:create' | 'task:update' | 'task:create',
  projectId,
  filePath,
  content,
  taskId,
  updates,
  title,
  priority
}`
- `agent:heartbeat`

### Server → Agent
- `agent:registered`
- `project:state`
- `project:update`
- `project:cursors`
- `agent:joined`
- `agent:left`
- `agent:action`

### Server → Observatory
- `observatory:state`
- `observatory:agents`
- `observatory:project`
- `observatory:activity`
- `observatory:metrics`
- `observatory:cursors`
- `observatory:typing`
