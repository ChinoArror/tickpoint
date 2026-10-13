import { beforeEach, describe, expect, it } from 'vitest'
import { installFetchStub, signedIn, stubAuthCenter } from './helpers'

describe('cross-user data isolation', () => {
  beforeEach(() => {
    installFetchStub()
    stubAuthCenter()
  })

  it('users cannot read, modify, delete or reference another user\'s records by id', async () => {
    const alice = await signedIn('user-alice')
    const bob = await signedIn('user-bob')

    const project = (await alice.post('/projects', { name: 'Alice project' })).body.data.id
    const task = (await alice.post('/tasks', { title: 'Alice secret', projectId: project })).body.data.id
    const goal = (await alice.post('/goals', { title: 'Alice goal' })).body.data.id
    const cp = (await alice.post('/checkpoints', { taskId: task, title: 'cp' })).body.data.id

    // Direct access by id behaves exactly like a missing record.
    expect((await bob.get(`/tasks/${task}`)).status).toBe(404)
    expect((await bob.patch(`/tasks/${task}`, { title: 'pwned' })).status).toBe(404)
    expect((await bob.del(`/tasks/${task}`)).status).toBe(404)
    expect((await bob.post(`/tasks/${task}/complete`)).status).toBe(404)
    expect((await bob.get(`/goals/${goal}`)).status).toBe(404)
    expect((await bob.patch(`/checkpoints/${cp}`, { status: 'done' })).status).toBe(404)
    expect((await bob.patch(`/projects/${project}`, { name: 'x' })).status).toBe(404)
    expect((await bob.post('/progress', { taskId: task, value: 50 })).status).toBe(404)
    expect((await bob.post('/reminders', { taskId: task, kind: 'offset', offsetMinutes: 60 })).status).toBe(404)

    // References to foreign ids in Bob's own records are rejected.
    expect((await bob.post('/tasks', { title: 'child', parentId: task })).status).toBe(404)
    expect((await bob.post('/tasks', { title: 'in project', projectId: project })).status).toBe(404)
    const own = (await bob.post('/tasks', { title: 'Bob task' })).body.data.id
    expect((await bob.post(`/tasks/${own}/dependencies`, { dependsOnId: task })).status).toBe(404)
    expect((await bob.post('/checkpoints', { taskId: task, title: 'x' })).status).toBe(404)

    // Lists, search, analytics and exports only contain the caller's data.
    const list = await bob.get('/tasks?view=all')
    expect(list.body.data.items.map((t: any) => t.title)).toEqual(['Bob task'])
    expect((await bob.get('/search?q=secret')).body.data.tasks).toHaveLength(0)
    const exp = await bob.get('/export/json')
    expect(JSON.stringify(exp.body)).not.toContain('Alice secret')
    expect(JSON.stringify(exp.body)).not.toContain('user-alice')
    expect((await bob.get('/analytics?range=30')).body.data.metrics.activeTasks).toBe(1)

    // Alice's data is untouched.
    const a = await alice.get(`/tasks/${task}`)
    expect(a.body.data.title).toBe('Alice secret')
    expect(a.body.data.checkpoints[0].status).toBe('pending')
  })

  it('imports never claim another user\'s ownership', async () => {
    const alice = await signedIn('user-alice')
    const bob = await signedIn('user-bob')
    await alice.post('/tasks', { title: 'Exported task', kind: 'deadline', due: { precision: 'date', date: '2030-01-10' } })
    const file = (await alice.get('/export/json')).body
    const preview = await bob.post('/import?mode=preview', file)
    expect(preview.body.data.counts.tasks).toBe(1)
    const commit = await bob.post('/import?mode=commit', file)
    expect(commit.status).toBe(201)
    const bobTasks = (await bob.get('/tasks?view=all')).body.data.items
    expect(bobTasks.map((t: any) => t.title)).toEqual(['Exported task'])
    // Alice still has exactly her one task; Bob's import created a new record.
    const aliceTasks = (await alice.get('/tasks?view=all')).body.data.items
    expect(aliceTasks).toHaveLength(1)
    expect(aliceTasks[0].id).not.toBe(bobTasks[0].id)
  })
})
