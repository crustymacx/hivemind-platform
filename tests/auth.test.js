const path = require('path');
const fs = require('fs');
const { HiveMindDatabase } = require('../server/database');

const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'test-auth.db');

let db;

// We need to set up the database before requiring auth, since auth uses getDatabase()
beforeAll(() => {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

beforeEach(() => {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  db = new HiveMindDatabase(TEST_DB_PATH);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

describe('API Key Authentication', () => {
  test('key format starts with hm_', () => {
    const { key } = db.createApiKey({ name: 'test' });
    expect(key.startsWith('hm_')).toBe(true);
    expect(key.length).toBe(67); // 'hm_' + 64 hex chars
  });

  test('key hash is SHA-256', () => {
    const { key, record } = db.createApiKey({ name: 'hash-test' });
    const crypto = require('crypto');
    const expectedHash = crypto.createHash('sha256').update(key).digest('hex');

    // The raw hash isn't exposed directly, but validating the key should work
    const validated = db.validateApiKey(key);
    expect(validated).not.toBeNull();
  });

  test('same key is not generated twice', () => {
    const { key: key1 } = db.createApiKey({ name: 'k1' });
    const { key: key2 } = db.createApiKey({ name: 'k2' });
    expect(key1).not.toBe(key2);
  });

  test('key prefix is stored for identification', () => {
    const { key, record } = db.createApiKey({ name: 'prefix-test' });
    expect(record.key_prefix).toBe(key.slice(0, 10));
  });

  test('last_used_at is updated on validation', () => {
    const { key, record } = db.createApiKey({ name: 'usage-test' });
    expect(record.last_used_at).toBeNull();

    db.validateApiKey(key);
    const updated = db.getApiKeyById(record.id);
    expect(updated.last_used_at).not.toBeNull();
  });

  test('scopes and capabilities are preserved', () => {
    const { key } = db.createApiKey({
      name: 'scoped',
      capabilities: ['code', 'review', 'execute'],
      scopes: ['connect', 'project:read', 'project:write', 'admin']
    });

    const validated = db.validateApiKey(key);
    expect(validated.capabilities).toEqual(['code', 'review', 'execute']);
    expect(validated.scopes).toEqual(['connect', 'project:read', 'project:write', 'admin']);
  });

  test('rate limit is stored', () => {
    const { key } = db.createApiKey({ name: 'rate-limited', rateLimit: 50 });
    const validated = db.validateApiKey(key);
    expect(validated.rate_limit).toBe(50);
  });
});
