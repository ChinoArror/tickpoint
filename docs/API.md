# TickPoint API Reference (`/api/v1`)

Every response uses the same envelope: `{ "success": boolean, "data": T | null, "error": { "code", "message", "details"? } | null }`.

Authentication is a TickPoint session cookie (HttpOnly, SameSite=Lax) created from a verified AuthCenter JWT. Mutations must be same-origin (CSRF guard). The owner is always taken from the session and never from the request.

Error codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `SESSION_EXPIRED` (client renews silently), `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `CIRCULAR_DEPENDENCY`, `CIRCULAR_HIERARCHY`, `NESTING_TOO_DEEP`, `RATE_LIMITED`, `QUOTA_EXCEEDED`, `PAYLOAD_TOO_LARGE`, `CSRF_REJECTED`, `AI_DISABLED`, `AI_UNAVAILABLE`, `AI_INVALID_OUTPUT`, `AI_TIMEOUT`, `AUTH_UNAVAILABLE`, `AUTH_REJECTED`, `NOT_CONFIGURED`, `EDITED_CHECKPOINTS`, `INTERNAL_ERROR`.

## Auth

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/auth/config` | Public. `{ appId, authBaseUrl, devBypass, vapidPublicKey, emailConfigured, aiConfigured }` |
| GET | `/auth/login?return=/path` | 302 to AuthCenter `/login`. Has redirect-loop protection. |
| POST | `/auth/session` | `{ token, timeZone?, locale? }` → `{ redirect }`. Verifies the token with AuthCenter `/api/verify` and sets the cookie. |
| POST | `/auth/dev-login` | Development only (`DEV_AUTH_BYPASS=true`, localhost). `{ user: 'alice' or 'bob' }` |
| POST | `/auth/logout` | Signs out of TickPoint only. |
| GET | `/auth/me` | `{ user, settings, profileUrl, serverTime }` |

## Tasks and deadlines

A task with `kind: 'deadline'` is a strict deadline. The `due` field has this shape: `{ precision: exact or date or approximate or unknown, at, date, time, timeZone, sortAt }`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/tasks` | Query: `view` (all, inbox, today, upcoming, deadlines, overdue, completed, archived), `projectId`, `goalId`, `parentId` (an id or `root`), `status`, `priority`, `kind`, `q`, `from`, `to`, `limit`, `cursor`. Returns `{ items: Task[], nextCursor }`. Each Task includes `counts` and `risk`. |
| POST | `/tasks` | `taskCreateSchema` (`due` is a DueSpec `{precision,date,time,timeZone}`; `reminderOffsets`: minutes[]) → TaskDetail |
| GET | `/tasks/:id` | TaskDetail: task + `subtasks`, `checkpoints`, `dependencies`, `dependents`, `reminders` (with `jobs`), `attachments`, `history`, `source` |
| PATCH | `/tasks/:id` | `taskUpdateSchema` → `{ task: TaskDetail, previous: Task }` |
| POST | `/tasks/:id/complete`, `/reopen`, `/pause`, `/resume`, `/archive`, `/unarchive` | → Task |
| POST | `/tasks/:id/duplicate` | → `{ id }` |
| POST | `/tasks/:id/move` | `{ parentId?, projectId?, goalId?, orderedSiblingIds? }` |
| DELETE | `/tasks/:id` | Soft delete of the task and its subtree → `{ deletedIds }` |
| POST | `/tasks/:id/restore` | Undo a delete. |
| POST | `/tasks/:id/dependencies` | `{ dependsOnId, type: finish_to_start or blocked_by, note? }` |
| DELETE | `/tasks/:id/dependencies/:depId` | |
| POST | `/tasks/:id/attachments` | multipart `file` (max 10 MB) |
| GET / DELETE | `/attachments/:id` | Download or delete. |

## Checkpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/checkpoints?taskId=` or `?goalId=` or `?from=YYYY-MM-DD&to=` | Checkpoint[] (range results include `parentTitle`) |
| POST | `/checkpoints` | `{ taskId or goalId, title, description?, completionCriteria?, startDate?, targetDate?, estimatedMinutes?, weight?, priority?, status?, dependsOnIds? }` |
| PATCH | `/checkpoints/:id` | Partial update, including `status: 'done'`. Returns `{ affected: [{id,title,targetDate}] }`: downstream checkpoints that may need re-dating (never auto-changed). |
| DELETE | `/checkpoints/:id` | Soft delete. `POST /checkpoints/:id/restore` undoes it. |
| POST | `/checkpoints/reorder` | `{ orderedIds }` |
| GET | `/checkpoints/:id/impact?targetDate=` | Previews delay impact. |

## Goals and progress

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/goals?status=&projectId=` | Goal[] with `health` |
| POST | `/goals` | `goalCreateSchema` → GoalDetail |
| GET | `/goals/:id` | GoalDetail: `checkpoints`, `tasks`, `progress`, `history`, `reminders`, `health` |
| PATCH | `/goals/:id` | → GoalDetail |
| DELETE | `/goals/:id` | Soft delete. `POST /goals/:id/restore` undoes it. |
| GET | `/progress?taskId=or goalId=&limit=` | ProgressEntry[] |
| POST | `/progress` | Exactly one of `taskId`, `goalId`, `checkpointId`, plus `value` (absolute) or `delta`, and optional `minutes`, `note`. |
| DELETE | `/progress/:id` | |

## Projects, tags, sources, search

`GET/POST /projects`, `PATCH/DELETE /projects/:id` (`status: archived`). `GET/POST /tags`, `DELETE /tags/:id`.
`GET /sources`, `GET /sources/:id` (includes `content` and `linked` tasks), `DELETE /sources/:id/content` (removes only the stored text), `DELETE /sources/:id`.
`GET /search?q=` → `{ tasks, goals, projects }`.

## AI (all outputs are unconfirmed drafts)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/ai/extract` | `{ text, sourceTitle?, sourceUrl?, sourceDate?, context?, projectId?, timeZone? }` → `{ draftId, result, meta, model }`. `result` is ExtractionResult (see `lib/types.ts`); every item carries `id`, `evidence` and `evidenceVerified`. |
| GET | `/ai/extract/:id` | Draft, including `sourceText` while pending. |
| POST | `/ai/extract/:id/confirm` | `extractConfirmSchema`: the user-edited record → `{ primaryTaskId, primaryGoalId, sourceId, created }` |
| POST | `/ai/extract/:id/reject` | |
| POST | `/ai/checkpoints` | `{ taskId or goalId, objective?, hoursPerDay?, preferences?, maxCheckpoints? }` → PlanDraft `{ draftId, checkpoints: DraftCheckpoint[], feasibility }` |
| GET / PUT | `/ai/checkpoints/:id` | PUT `{ checkpoints }` saves user edits (mark edited items `edited: true`; manual additions use `origin: 'user'`). |
| POST | `/ai/checkpoints/:id/regenerate` | `{ checkpointIds: clientId[], instructions?, overwriteEdited }`. Returns 409 `EDITED_CHECKPOINTS` (details = ids) unless confirmed. |
| POST | `/ai/checkpoints/:id/confirm` | `{ checkpoints }` → `{ created }` |
| DELETE | `/ai/checkpoints/:id` | Discards the plan. |
| POST | `/ai/analyze` | `{ taskId or goalId }` → `{ kind, metrics, analysis: { headline, narrative, suggestions[], cautions[] }, aiGenerated: true }` |
| GET | `/ai/usage` | `{ totals[], recent[], model }` |

## Reminders and notifications

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/reminders` | `{ taskId or goalId or checkpointId, kind: offset or absolute, offsetMinutes?, absoluteAt?, channels: ['in_app','push','email'] }` → `{ id, nextFireAt }` |
| PATCH / DELETE | `/reminders/:id` | |
| GET | `/reminders/upcoming` | |
| POST | `/reminders/jobs/:id/snooze` | `{ minutes }` |
| GET | `/notifications?before=&unread=1&limit=` | `{ items, unread }` |
| POST | `/notifications/:id/read`, `/notifications/read-all` | |
| GET | `/notifications/deliveries` | Delivery log. |
| POST | `/notifications/test` | Per-channel results `{ in_app, push?, email? }` |
| GET / POST / DELETE | `/push/subscriptions` | POST takes `PushSubscription.toJSON()`; DELETE takes `{ endpoint }`. |

## Overview, analytics and data

`GET /dashboard`, `GET /calendar?from=&to=` → `{ tasks, checkpoints, goals }`, `GET /analytics?range=7|30|90|365`, `GET /activity?before=&limit=`, `GET /time`.
`GET/PATCH /settings`.
`GET /export/json?sources=0|1`, `GET /export/csv?type=tasks|progress`, `POST /import?mode=preview|commit&skipDuplicates=1|0` (body: the export JSON).
`GET/POST /backups`, `GET /backups/:id/download`, `POST /backups/:id/restore`, `DELETE /backups/:id`.
`DELETE /account/data` `{ confirm: 'DELETE' }` permanently deletes all TickPoint data (not the AuthCenter account).
