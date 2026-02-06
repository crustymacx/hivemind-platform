const { SkillRegistry } = require('../server/skill-registry');

describe('SkillRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  test('register skills for an agent', () => {
    const skills = registry.registerSkills('agent-1', ['code-review', 'testing', 'deployment']);
    expect(skills).toEqual(['code-review', 'testing', 'deployment']);
  });

  test('find providers for a skill', () => {
    registry.registerSkills('agent-1', ['code-review', 'testing']);
    registry.registerSkills('agent-2', ['code-review', 'writing']);

    const reviewers = registry.findProviders('code-review');
    expect(reviewers).toContain('agent-1');
    expect(reviewers).toContain('agent-2');

    const writers = registry.findProviders('writing');
    expect(writers).toEqual(['agent-2']);
  });

  test('unregister agent removes all skills', () => {
    registry.registerSkills('agent-1', ['code-review', 'testing']);
    registry.unregisterAgent('agent-1');

    expect(registry.findProviders('code-review')).toEqual([]);
    expect(registry.findProviders('testing')).toEqual([]);
  });

  test('create and claim a skill request', () => {
    registry.registerSkills('agent-1', ['code-review']);

    const request = registry.createRequest('agent-2', 'code-review', { file: 'test.js' });
    expect(request.error).toBeUndefined();
    expect(request.status).toBe('pending');
    expect(request.providers).toContain('agent-1');

    const claimed = registry.claimRequest(request.id, 'agent-1');
    expect(claimed.status).toBe('claimed');
    expect(claimed.assignedTo).toBe('agent-1');
  });

  test('complete a skill request', () => {
    registry.registerSkills('agent-1', ['testing']);
    const request = registry.createRequest('agent-2', 'testing', { suite: 'unit' });
    registry.claimRequest(request.id, 'agent-1');

    const completed = registry.completeRequest(request.id, 'agent-1', { passed: 42, failed: 0 });
    expect(completed.status).toBe('completed');
    expect(completed.result).toEqual({ passed: 42, failed: 0 });
  });

  test('reject request for unknown skill', () => {
    const result = registry.createRequest('agent-1', 'unknown-skill', {});
    expect(result.error).toBeDefined();
  });

  test('reject double-claim', () => {
    registry.registerSkills('agent-1', ['review']);
    registry.registerSkills('agent-2', ['review']);

    const request = registry.createRequest('agent-3', 'review', {});
    registry.claimRequest(request.id, 'agent-1');

    const secondClaim = registry.claimRequest(request.id, 'agent-2');
    expect(secondClaim.error).toBeDefined();
  });

  test('reject completion by wrong agent', () => {
    registry.registerSkills('agent-1', ['deploy']);
    const request = registry.createRequest('agent-2', 'deploy', {});
    registry.claimRequest(request.id, 'agent-1');

    const result = registry.completeRequest(request.id, 'agent-2', { status: 'done' });
    expect(result.error).toBeDefined();
  });

  test('get all skills with stats', () => {
    registry.registerSkills('agent-1', ['code', 'review']);
    registry.registerSkills('agent-2', ['code', 'test']);

    const stats = registry.getStats();
    expect(stats.totalSkills).toBe(3);
    expect(stats.totalAgents).toBe(2);
    expect(stats.skills.code.count).toBe(2);
  });

  test('get pending requests filtered by skill', () => {
    registry.registerSkills('agent-1', ['review', 'test']);
    registry.createRequest('agent-2', 'review', {});
    registry.createRequest('agent-2', 'test', {});
    registry.createRequest('agent-3', 'review', {});

    const reviewRequests = registry.getPendingRequests('review');
    expect(reviewRequests).toHaveLength(2);

    const allPending = registry.getPendingRequests();
    expect(allPending).toHaveLength(3);
  });
});
