import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeEach } from 'vitest'

const e = env as unknown as { DB: D1Database; TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] }
await applyD1Migrations(e.DB, e.TEST_MIGRATIONS)

// Storage is shared across tests in a file: start every test from empty tables.
beforeEach(async () => {
  const { results } = await e.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'",
  ).all<{ name: string }>()
  await e.DB.batch([e.DB.prepare('PRAGMA defer_foreign_keys = ON'), ...results.map((r) => e.DB.prepare(`DELETE FROM "${r.name}"`))])
})
