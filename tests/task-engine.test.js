const TaskEngine = require('../server/task-engine');

describe('TaskEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new TaskEngine();
  });

  test('create a task', () => {
    const task = engine.createTask({ title: 'Test task', priority: 'high', projectId: 'p1' });
    expect(task.id).toBeDefined();
    expect(task.title).toBe('Test task');
    expect(task.status).toBe('open');
    expect(task.priority).toBe('high');
  });

  test('bid on a task', () => {
    const task = engine.createTask({ title: 'Bidding task' });
    const result = engine.bid(task.id, 'agent-1', 5);
    expect(result.bids).toHaveLength(1);
    expect(result.bids[0].agentId).toBe('agent-1');
    expect(result.bids[0].score).toBe(5);
  });

  test('reject bids on non-open tasks', () => {
    const task = engine.createTask({ title: 'Closed task' });
    engine.assign(task.id, 'agent-1');

    const result = engine.bid(task.id, 'agent-2', 10);
    expect(result).toBeNull();
  });

  test('assign directly to an agent', () => {
    const task = engine.createTask({ title: 'Direct assign' });
    const assigned = engine.assign(task.id, 'agent-1');
    expect(assigned.status).toBe('assigned');
    expect(assigned.assignedTo).toBe('agent-1');
  });

  test('assign to best bidder', () => {
    const task = engine.createTask({ title: 'Bid assignment' });
    engine.bid(task.id, 'agent-1', 3);
    engine.bid(task.id, 'agent-2', 7);
    engine.bid(task.id, 'agent-3', 5);

    const assigned = engine.assign(task.id);
    expect(assigned.assignedTo).toBe('agent-2'); // highest score
  });

  test('full task lifecycle', () => {
    // Create
    const task = engine.createTask({ title: 'Full lifecycle' });
    expect(task.status).toBe('open');

    // Assign
    engine.assign(task.id, 'agent-1');
    expect(engine.getTask(task.id).status).toBe('assigned');

    // Start
    engine.startTask(task.id, 'agent-1');
    expect(engine.getTask(task.id).status).toBe('in-progress');

    // Complete
    engine.completeTask(task.id, 'agent-1', 'Done!');
    const completed = engine.getTask(task.id);
    expect(completed.status).toBe('completed');
    expect(completed.result).toBe('Done!');
    expect(completed.completedAt).toBeDefined();
  });

  test('fail a task', () => {
    const task = engine.createTask({ title: 'Will fail' });
    engine.assign(task.id, 'agent-1');
    engine.failTask(task.id, 'agent-1', 'Out of memory');

    const failed = engine.getTask(task.id);
    expect(failed.status).toBe('failed');
    expect(failed.result).toBe('Out of memory');
  });

  test('get open tasks', () => {
    engine.createTask({ title: 'Open 1', projectId: 'p1' });
    engine.createTask({ title: 'Open 2', projectId: 'p1' });
    const t3 = engine.createTask({ title: 'Assigned', projectId: 'p1' });
    engine.assign(t3.id, 'agent-1');

    const open = engine.getOpenTasks('p1');
    expect(open).toHaveLength(2);
  });

  test('get tasks by agent', () => {
    const t1 = engine.createTask({ title: 'T1' });
    const t2 = engine.createTask({ title: 'T2' });
    engine.assign(t1.id, 'agent-1');
    engine.completeTask(t2.id, 'agent-1', 'Done');

    const tasks = engine.getTasksByAgent('agent-1');
    expect(tasks).toHaveLength(2);
  });

  test('prevent wrong agent from starting task', () => {
    const task = engine.createTask({ title: 'Guarded' });
    engine.assign(task.id, 'agent-1');

    const result = engine.startTask(task.id, 'agent-2');
    expect(result).toBeNull();
  });
});
