const { getDatabase } = require('./database');

/**
 * Auth - API key authentication middleware and socket auth
 *
 * Agents authenticate with API keys of the form: hm_<64-hex-chars>
 * Keys are stored as SHA-256 hashes; the raw key is shown once at creation.
 *
 * When AUTH_REQUIRED=false (default), connections without keys are still allowed
 * but receive limited capabilities.
 */

const AUTH_REQUIRED = process.env.AUTH_REQUIRED === 'true';

/**
 * Express middleware for API key auth on REST endpoints
 */
function apiKeyMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const queryKey = req.query.api_key;
  const rawKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryKey;

  if (!rawKey) {
    if (AUTH_REQUIRED) {
      return res.status(401).json({ error: 'API key required. Set Authorization: Bearer hm_...' });
    }
    req.auth = { authenticated: false, scopes: ['connect', 'project:read'] };
    return next();
  }

  const db = getDatabase();
  const keyRecord = db.validateApiKey(rawKey);

  if (!keyRecord) {
    return res.status(401).json({ error: 'Invalid or expired API key' });
  }

  req.auth = {
    authenticated: true,
    keyId: keyRecord.id,
    name: keyRecord.name,
    agentName: keyRecord.agent_name,
    capabilities: keyRecord.capabilities,
    scopes: keyRecord.scopes,
    rateLimit: keyRecord.rate_limit
  };

  next();
}

/**
 * Socket.io middleware for authenticating agent connections
 */
function socketAuthMiddleware(socket, next) {
  const auth = socket.handshake.auth || {};

  // Observatory connections don't need auth
  if (auth.type === 'observatory') {
    socket.authData = { authenticated: false, type: 'observatory' };
    return next();
  }

  const rawKey = auth.apiKey || auth.api_key;

  if (!rawKey) {
    if (AUTH_REQUIRED) {
      return next(new Error('API key required. Pass apiKey in auth handshake.'));
    }
    socket.authData = {
      authenticated: false,
      type: 'agent',
      scopes: ['connect', 'project:read', 'project:write']
    };
    return next();
  }

  const db = getDatabase();
  const keyRecord = db.validateApiKey(rawKey);

  if (!keyRecord) {
    return next(new Error('Invalid or expired API key'));
  }

  socket.authData = {
    authenticated: true,
    type: 'agent',
    keyId: keyRecord.id,
    name: keyRecord.name,
    agentName: keyRecord.agent_name,
    capabilities: keyRecord.capabilities,
    scopes: keyRecord.scopes,
    rateLimit: keyRecord.rate_limit
  };

  // Override agent name from API key if set
  if (keyRecord.agent_name) {
    auth.name = keyRecord.agent_name;
  }

  next();
}

/**
 * Check if a scope is allowed
 */
function hasScope(authData, scope) {
  if (!authData) return false;
  if (!authData.scopes) return false;
  return authData.scopes.includes(scope) || authData.scopes.includes('*');
}

module.exports = { apiKeyMiddleware, socketAuthMiddleware, hasScope, AUTH_REQUIRED };
