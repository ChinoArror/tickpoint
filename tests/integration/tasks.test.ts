import { beforeEach, describe, expect, it } from 'vitest'
import { installFetchStub, signedIn, stubAuthCenter, testEnv } from './helpers'

describe('deadlines, hierarchy and dependencies', () => {
  beforeEach(() => {
    installFetchStub()
    stubAuthCenter()
  })

  it('creates an exact deadline with the canonical UTC instant', async () => {
    const c = await signedIn('user-alice')
    const r = await c.post('/tasks', { kind: 'deadline', title: 'Report', due: { precision: 'exact', date: '2030-10-20', time: '23:59', timeZone: 'Asia/Tokyo' } })
    expect(r.status).toBe(201)
    expect(r.body.data.due.at).toBe(Date.UTC(2030, 9, 20, 14, 59))
    expect(r.body.data.due).toMatchObject({ precision: 'exact', date: '2030-10-20', time: '23:59', timeZone: 'Asia/Tokyo' })
  })

  it('stores date-only deadlines without inventing a time', async () => {
    const c = await signedIn('user-alice')
    const r = await c.post('/tasks', { kind: 'deadline', title: 'Date only', due: { precision: 'date', date: '2030-10-20' } })
    expect(r.body.data.due.time).toBeNull()
    expect(r.body.data.due.at).toBeNull()
    // Overdue only after the whole day has passed in the user's zone (Asia/Tokyo).
    expect(r.body.data.due.sortAt).toBe(Date.UTC(2030, 9, 20, 15, 0))
  })

  it('rejects an exact deadline without a time and a date-only deadline with a time', async () => {
    const c = await signedIn('user-alice')
    expect((await c.post('/tasks', { title: 'x', due: { precision: 'exact', date: '2030-10-20', timeZone: 'UTC' } })).status).toBe(400)
    expect((await c.post('/tasks', { title: 'x', due: { precision: 'date', date: '2030-10-20', time: '10:00' } })).status).toBe(400)
    expect((await c.post('/tasks', { title: 'x', due: { precision: 'exact', date: '2030-10-20', time: '10:00', timeZone: 'Mars/Base' } })).status).toBe(400)
  })

  it('supports unknown deadlines and keeps them out of overdue', async () => {
    const c = await signedIn('user-alice')
    const r = await c.post('/tasks', { kind: 'deadline', title: 'TBD', due: { precision: 'unknown' } })
    expect(r.body.data.due.sortAt).toBeNull()
    expect(r.body.data.risk.level).toBe('none')
    expect((await c.get('/tasks?view=overdue')).body.data.items).toHaveLength(0)
  })

  it('detects overdue deadlines', async () => {
    const c = await signedIn('user-alice')
    await c.post('/tasks', { kind: 'deadline', title: 'Late', due: { precision: 'exact', date: '2020-01-01', time: '09:00', timeZone: 'UTC' } })
    const r = await c.get('/tasks?view=overdue')
    expect(r.body.data.items).toHaveLength(1)
    expect(r.body.data.items[0].risk.level).toBe('overdue')
  })

  it('prevents circular parent-child relationships and over-deep nesting', async () => {
    const c = await signedIn('user-alice')
    const a = (await c.post('/tasks', { title: 'A' })).body.data.id
    const b = (await c.post('/tasks', { title: 'B', parentId: a })).body.data.id
    const r = await c.patch(`/tasks/${a}`, { parentId: b })
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('CIRCULAR_HIERARCHY')
    expect((await c.patch(`/tasks/${a}`, { parentId: a })).body.error.code).toBe('CIRCULAR_HIERARCHY')

    let parent = b
    for (let i = 0; i < 4; i++) parent = (await c.post('/tasks', { title: `L${i}`, parentId: parent })).body.data.id
    const deep = await c.post('/tasks', { title: 'too deep', parentId: parent })
    expect(deep.body.error.code).toBe('NESTING_TOO_DEEP')
  })

  it('prevents circular task dependencies', async () => {
    const c = await signedIn('user-alice')
    const a = (await c.post('/tasks', { title: 'A' })).body.data.id
    const b = (await c.post('/tasks', { title: 'B' })).body.data.id
    const d = (await c.post('/tasks', { title: 'C' })).body.data.id
    expect((await c.post(`/tasks/${b}/dependencies`, { dependsOnId: a })).status).toBe(201)
    expect((await c.post(`/tasks/${d}/dependencies`, { dependsOnId: b })).status).toBe(201)
    const cyc = await c.post(`/tasks/${a}/dependencies`, { dependsOnId: d })
    expect(cyc.body.error.code).toBe('CIRCULAR_DEPENDENCY')
    const detail = await c.get(`/tasks/${b}`)
    expect(detail.body.data.counts.openDependencies).toBe(1)
  })

  it('derives progress from checkpoints without double counting and keeps completion consistent', async () => {
    const c = await signedIn('user-alice')
    const t = (await c.post('/tasks', { title: 'P', progressMode: 'checkpoints' })).body.data.id
    const c1 = (await c.post('/checkpoints', { taskId: t, title: 'one' })).body.data.id
    await c.post('/checkpoints', { taskId: t, title: 'two', weight: 3 })
    await c.patch(`/checkpoints/${c1}`, { status: 'done' })
    let d = (await c.get(`/tasks/${t}`)).body.data
    expect(d.progressPercent).toBe(25)
    expect(d.status).toBe('in_progress')
    await c.post(`/tasks/${t}/complete`)
    d = (await c.get(`/tasks/${t}`)).body.data
    expect(d.status).toBe('completed')
    expect(d.progressPercent).toBe(100)
    expect(d.completedAt).toBeTypeOf('number')
    await c.post(`/tasks/${t}/reopen`)
    d = (await c.get(`/tasks/${t}`)).body.data
    expect(d.completedAt).toBeNull()
  })

  it('reports downstream checkpoints affected by a delay without rescheduling them', async () => {
    const c = await signedIn('user-alice')
    const t = (await c.post('/tasks', { title: 'P' })).body.data.id
    const a = (await c.post('/checkpoints', { taskId: t, title: 'a', targetDate: '2030-01-10' })).body.data.id
    const b = (await c.post('/checkpoints', { taskId: t, title: 'b', targetDate: '2030-01-12', dependsOnIds: [a] })).body.data.id
    const r = await c.patch(`/checkpoints/${a}`, { targetDate: '2030-01-15' })
    expect(r.body.data.affected.map((x: any) => x.id)).toEqual([b])
    const detail = (await c.get(`/tasks/${t}`)).body.data
    expect(detail.checkpoints.find((x: any) => x.id === b).targetDate).toBe('2030-01-12')
  })

  it('soft-deletes with undo and records history', async () => {
    const c = await signedIn('user-alice')
    const t = (await c.post('/tasks', { title: 'Keep me' })).body.data.id
    await c.post('/tasks', { title: 'child', parentId: t })
    const del = await c.del(`/tasks/${t}`)
    expect(del.body.data.deletedIds).toHaveLength(2)
    expect((await c.get(`/tasks/${t}`)).status).toBe(404)
    await c.post(`/tasks/${t}/restore`)
    const d = (await c.get(`/tasks/${t}`)).body.data
    expect(d.subtasks).toHaveLength(1)
    expect(d.history.map((h: any) => h.action)).toEqual(expect.arrayContaining(['created', 'deleted', 'restored']))
  })

  it('reschedules reminders when the deadline changes and cancels them on completion', async () => {
    const c = await signedIn('user-alice')
    const t = (
      await c.post('/tasks', { kind: 'deadline', title: 'R', due: { precision: 'exact', date: '2030-05-01', time: '12:00', timeZone: 'UTC' }, reminderOffsets: [60] })
    ).body.data
    const jobs = async () => (await testEnv.DB.prepare("SELECT fire_at, status FROM reminder_jobs ORDER BY created_at").all<{ fire_at: number; status: string }>()).results
    expect((await jobs()).filter((j) => j.status === 'pending').map((j) => j.fire_at)).toEqual([Date.UTC(2030, 4, 1, 11, 0)])

    await c.patch(`/tasks/${t.id}`, { due: { precision: 'exact', date: '2030-05-02', time: '12:00', timeZone: 'UTC' } })
    const after = await jobs()
    expect(after.filter((j) => j.status === 'pending').map((j) => j.fire_at)).toEqual([Date.UTC(2030, 4, 2, 11, 0)])
    expect(after.filter((j) => j.status === 'cancelled')).toHaveLength(1)

    await c.post(`/tasks/${t.id}/complete`)
    expect((await jobs()).filter((j) => j.status === 'pending')).toHaveLength(0)
  })

  it('validates request bodies with field-level errors', async () => {
    const c = await signedIn('user-alice')
    const r = await c.post('/tasks', { title: '', priority: 'whenever' })
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
    expect(r.body.error.details.map((d: any) => d.path)).toEqual(expect.arrayContaining(['title', 'priority']))
  })
})
