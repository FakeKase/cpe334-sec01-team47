# Sprint 1 — Software Test Specification (STS)

**Document version:** 0.2.3 (draft, 2026-11-14)
Covers every Sprint 1 acceptance criterion (AC-01 to AC-35) in contracts [F-01](F-01-authentication.md) to [F-05](F-05-review-requests.md).

## 1. Test levels, tools and environment

| Level | Tool | Scope | Location (planned) | Command |
|---|---|---|---|---|
| **Unit** | Vitest | Pure domain functions (BR-01, overlap, transitions), password and token hashing | `server/test/unit/*.test.ts` | `bun run --cwd server test unit` |
| **API integration** | Vitest + Supertest against a real PostgreSQL test DB | Endpoints, persistence, roles, ownership, concurrency | `server/test/api/*.test.ts` | `bun run --cwd server test api` |
| **UI component** | Vitest + React Testing Library + MSW (mocked API) | Screen states and form behavior | `client/src/**/*.test.tsx` | `bun run --cwd client test` |
| **End-to-end** | Playwright (Chromium) against `docker compose up` with a seeded DB (`SEED_DEMO_DATA=true`, `SEED_DEMO_REQUESTS=false`) | Critical user journeys through UI → API → DB | `e2e/*.spec.ts` | `bunx playwright test` |

**Common preconditions**

- The API tests use `DATABASE_URL=…/inventory_test` and `BCRYPT_COST=4`. The schema is migrated once per run,
  and every API test file truncates the tables and re-runs a deterministic fixture seed in `beforeEach`. The
  fixture has the same shape as the product seed: 4 categories, 12 items (`CPE-0901` MAINTENANCE, `CPE-0999`
  RETIRED), Custodian, Borrower 1 and Borrower 2, with test passwords from `test/.env.test`, never real ones.
- **Fixed clock:** the app is built with `createApp({ clock })`. Unless stated otherwise, tests use
  **today = 2026-11-15** (Asia/Bangkok), so date boundaries are deterministic.
- `loginAs(role)` helper → Bearer token via the real `POST /api/auth/login`.
- "No row created/unchanged" is asserted by querying the DB through Prisma after the call.

## 2. Test cases

### F-01 Authentication and session

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-01 | AC-01 | API | Seeded Borrower and Custodian | `POST /api/auth/login` with correct credentials, for each role | 200. `token` is a non-empty string. `expiresAt` ≈ now + 8 h (±1 min). `user.role` matches. 1 `Session` row for that user. |
| TEST-02 | AC-02 | API | Seeded users | Login with (a) wrong password, (b) `nobody@example.test` | Both 401 `INVALID_CREDENTIALS` with deep-equal bodies, no `token`. Session count unchanged. |
| TEST-03 | AC-03 | API | — | Login with (a) `{email}` only, (b) `email: "not-an-email"` | 400 `VALIDATION_ERROR`. `details` contains `password` / `email` respectively. |
| TEST-04 | AC-04 | API | Borrower token | `GET /api/auth/me` | 200 `{ user: { id, email, displayName, role } }`. No `passwordHash` key anywhere in the body. |
| TEST-05 | AC-04 | API | (a) no header, (b) `Bearer garbage`, (c) valid session whose `expiresAt` was updated to the past | `GET /api/auth/me` | 401 `UNAUTHENTICATED`. Body has no `user`. In (c) the session row is deleted. |
| TEST-06 | AC-05 | API | Borrower token | `POST /api/auth/logout`, then `GET /api/auth/me` with the same token | 204, then 401. The session row no longer exists. |
| TEST-07 | AC-06 | API | No token. Valid UUIDs for path params | Call each of the 9 protected endpoints listed in AC-06 (`it.each`) | Each returns 401 `UNAUTHENTICATED`. Body keys are exactly `["error"]`. |
| TEST-08 | AC-07 | Unit | `hashPassword("Secr3t!")`, `hashToken(t)` | Hash and verify | Hash ≠ input and starts with `$2`. `verifyPassword` is true for the right password and false for a wrong one. `hashToken` returns 64 hex chars ≠ input and is deterministic. |
| TEST-09 | AC-07 | API + DB | Log in as Borrower | Read the `User` and `Session` rows via Prisma | `passwordHash` ≠ seed password. `tokenHash` = sha256(returned token) and ≠ token. No column of the session row equals the token. |
| TEST-10 | AC-08 | API | Test-only route `GET /api/__test/boom` (mounted only when `NODE_ENV=test`) that throws `new Error("db password=xyz")` | Call it | 500. Body deep-equals `{ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } }`. The serialised body does not contain `stack`, `xyz` or `.ts`. |
| TEST-11 | AC-09 | E2E | Seeded app | Wrong password → check error. Correct Borrower login → check header. Log out → visit `/my-requests` | "Invalid email or password." shown. Header shows "Borrower One · Borrower". After logout the URL is `/login`. |

### F-02 Equipment catalog

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-12 | AC-10 | API | Fixture seed, Borrower token | `GET /api/items` | 200, length 11, no `CPE-0999`. `CPE-0901` has `status: "MAINTENANCE"` and `availableToday: false`. Every element has the documented keys. |
| TEST-13 | AC-11 | API | Borrower token | `?categoryId=<Measurement>`, `?categoryId=<random uuid>`, `?categoryId=abc` | Only Measurement items. `[]`. 400 respectively. |
| TEST-14 | AC-12 | API | Item X with APPROVED 20–22 Nov, PENDING 25–26 Nov, RETURNED 1–3 Nov | `GET /api/items/X` as Borrower, then as Custodian; `GET /api/items/<unknown>`; `GET /api/items/<CPE-0999 id>` | `committedPeriods` = [20–22 Nov APPROVED] only. No `borrower` for the Borrower, `borrower.displayName` for the Custodian. 404, 404. |
| TEST-15 | AC-13 | API | No token | `GET /api/categories` | 200, 4 categories sorted by name. |
| TEST-16 | AC-14 | Component | MSW: items endpoint delayed, then a list containing one MAINTENANCE item; a category returning `[]` | Render `/items`, then choose the empty category; render detail of the MAINTENANCE item as a Borrower | "Loading items…" visible first, then rows. "No items in this category." "Under maintenance" badge. Submit button disabled with the maintenance message. |

### F-03 Submit borrow request

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-17 | AC-15 | API | Borrower 1 token, ACTIVE item X with no bookings | `POST /api/requests` with 20–22 Nov, a purpose, plus `borrowerId: <Borrower 2>` and `status: "APPROVED"` | 201. `status = PENDING`. `borrower.id` = Borrower 1. The DB row has `borrowerId` = Borrower 1 and `status = PENDING`. |
| TEST-18 | AC-16 | Unit | today = 2026-11-15 | `validateLoanPeriod` with (14–15) (15–15) (15–14) (15–28) (15–29) | `startDate` error; `[]`; `dueDate` error; `[]`; `dueDate` "at most 14 days" error. |
| TEST-19 | AC-16 | API | Borrower token | POST with start 14 Nov; then 15–29 Nov | Both 400 `VALIDATION_ERROR` with the field (`startDate`, `dueDate`). No rows created. |
| TEST-20 | AC-17 | API | Borrower token | Purpose `""`, `"   "`, 301×"a", 300×"a", 300×"a" with two spaces on each side | 400, 400, 400 (`purpose`). 201 for 300 characters. 201 with the stored purpose trimmed to 300 characters. |
| TEST-21 | AC-18 | API | Borrower token | POST for `CPE-0901` (MAINTENANCE), `CPE-0999` (RETIRED), random UUID | 409 `ITEM_NOT_AVAILABLE`, 404, 404. Request count unchanged. |
| TEST-22 | AC-19 | Unit | — | `periodsOverlap` for (20–22 vs 22–24), (20–22 vs 23–25), (20–22 vs 18–20), (20–22 vs 21–21), (20–22 vs 10–30) | true, false, true, true, true. |
| TEST-23 | AC-19 | API | Item X: Borrower 2's APPROVED 20–22 Nov. Item Y: Borrower 2's PENDING 20–22 Nov | Borrower 1 requests X 22–24, X 23–25, Y 21–21 | 409 `PERIOD_UNAVAILABLE`; 201; 201. |
| TEST-24 | AC-20 | API | Borrower 1's PENDING on X 20–22 Nov | Borrower 1 requests X 21–23, then item Z 21–23 | 409 `DUPLICATE_REQUEST`; 201. |
| TEST-25 | AC-21 | API | Borrower 1 has 3 PENDING requests on different items | Request a 4th; set one of the 3 to `REJECTED` via Prisma; request again | 409 `ACTIVE_LIMIT_REACHED` and the active count stays 3; then 201. (The fixture sets the status directly, so this test does not depend on the F-05 reject endpoint.) |
| TEST-26 | AC-22 | API | Custodian token | `POST /api/requests` with a valid body | 403 `FORBIDDEN`. Request count unchanged. |
| TEST-27 | AC-23 | Component | MSW: POST returns 409 `PERIOD_UNAVAILABLE` | Fill due < start → submit; then fix the dates → submit | Field error "Due date must be on or after the start date." and no request is sent; then the alert shows the server message and the inputs keep their values. |

### F-04 My requests

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-28 | AC-24 | API | Borrower 1: R1 PENDING (older), R2 REJECTED "Exam week" (newer). Borrower 2: R3 | Borrower 1: `GET /api/requests`; `?status=PENDING`; `?borrowerId=<B2>` | [R2, R1] with R2 `rejectionReason = "Exam week"`; [R1]; [R2, R1]. R3 never appears. |
| TEST-29 | AC-25 | API | R3 owned by Borrower 2 | `GET /api/requests/R3` as Borrower 1, then as Borrower 2 | 404 with body keys exactly `["error"]`; 200 with R3. |
| TEST-30 | AC-26 | Component | MSW: (a) `[]`, (b) one REJECTED with a reason | Render `/my-requests` | (a) "You have no requests yet." (b) "Rejected" badge and "Reason: …" text. |

### F-05 Review requests

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-31 | AC-27 | API | PENDING Ra (Borrower 1, t1) and Rb (Borrower 2, t2 > t1); one APPROVED Rc | Custodian `GET /api/requests?status=PENDING` | [Ra, Rb], each with `borrower.displayName`. Rc absent. |
| TEST-32 | AC-28 | API | PENDING Ra on X 20–22 Nov | Custodian approves Ra; Borrower 1 `GET /api/requests/Ra` | 200 `APPROVED`, `decidedBy.id` = Custodian, `decidedAt` set; DB row matches; the Borrower sees `APPROVED`. |
| TEST-33 | AC-29 | API | PENDING A (20–22) and B (21–23) on X | Approve A, then approve B | 200; then 409 `PERIOD_UNAVAILABLE`, B still `PENDING`. |
| TEST-34 | AC-30 | API | PENDING Ra on X; then set X to MAINTENANCE via Prisma | Approve Ra | 409 `ITEM_NOT_AVAILABLE`. Ra still `PENDING`. |
| TEST-35 | AC-31 | API | PENDING Ra, Rb | Reject Ra with `"  Exam week  "`; reject Rb with `""`, `"   "`, 501×"a" | Ra 200 `REJECTED`, stored reason `"Exam week"`. Rb: three 400 (`reason`), still `PENDING`. |
| TEST-36 | AC-32 | Unit | — | `canTransition(from, to)` for all 36 (from, to) pairs | true for exactly the 6 BR-06 pairs, false for the other 30. |
| TEST-37 | AC-32 | API | Ra APPROVED, Rb REJECTED, Rc PENDING with 10–12 Nov (inserted via Prisma; today = 15 Nov) | Approve Ra; reject Ra; approve Rb; approve Rc; reject Rc | 409 ×4 (`INVALID_TRANSITION`), each unchanged; final reject Rc → 200. |
| TEST-38 | AC-33 | API | Borrower 1's PENDING Ra | Borrower 1 calls approve and reject on Ra | 403 ×2. Ra unchanged (`PENDING`, `decidedById` null). |
| TEST-39 | AC-34 | API | PENDING A (20–22) and B (21–23) on X | `Promise.all([approve A, approve B])` with one Custodian token; repeat 10× with a fresh fixture each time | In every run: statuses are one 200 and one 409 `PERIOD_UNAVAILABLE`, and the DB has exactly one APPROVED among A and B. |
| TEST-41 | AC-35 | E2E | Seeded app with one PENDING request from Borrower 1 | Custodian: open `/requests` → Reject → try to confirm with an empty reason → type a reason → confirm. Borrower: open `/requests`. | Confirm disabled while empty. After confirming, the row disappears and the "Request rejected" toast shows. The Borrower sees "You are not allowed to do this". |

### Cross-feature journey

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-40 | AC-23, AC-24, AC-28 (UI), FR-06–FR-09 | E2E | Fresh seeded app, `SEED_DEMO_REQUESTS=false` (no existing booking on `CPE-0201`) | Borrower 1 logs in → opens `CPE-0201` → requests 3 days starting tomorrow → sees **Pending** in My requests → logs out. Custodian logs in → approves it → logs out. Borrower 1 logs in again → My requests. Then the **page is reloaded**. | The request shows **Approved** after the reload, proving the decision was persisted and retrieved from the DB. The item page shows the period under "Booked periods". |

## 3. AC → test coverage

| AC | Tests | AC | Tests | AC | Tests |
|---|---|---|---|---|---|
| AC-01 | TEST-01 | AC-13 | TEST-15 | AC-25 | TEST-29 |
| AC-02 | TEST-02 | AC-14 | TEST-16 | AC-26 | TEST-30 |
| AC-03 | TEST-03 | AC-15 | TEST-17 | AC-27 | TEST-31 |
| AC-04 | TEST-04, TEST-05 | AC-16 | TEST-18, TEST-19 | AC-28 | TEST-32, TEST-40 |
| AC-05 | TEST-06 | AC-17 | TEST-20 | AC-29 | TEST-33 |
| AC-06 | TEST-07 | AC-18 | TEST-21 | AC-30 | TEST-34 |
| AC-07 | TEST-08, TEST-09 | AC-19 | TEST-22, TEST-23 | AC-31 | TEST-35 |
| AC-08 | TEST-10 | AC-20 | TEST-24 | AC-32 | TEST-36, TEST-37 |
| AC-09 | TEST-11 | AC-21 | TEST-25 | AC-33 | TEST-38 |
| AC-10 | TEST-12 | AC-22 | TEST-26 | AC-34 | TEST-39 |
| AC-11 | TEST-13 | AC-23 | TEST-27, TEST-40 | AC-35 | TEST-41 |
| AC-12 | TEST-14 | AC-24 | TEST-28, TEST-40 | | |

All 35 Sprint 1 ACs have at least one automated test. **No AC relies on a manual check only.** Manual
checks (screenshots for Part F) supplement, but do not replace, these tests.

## 4. Results table

The results of a run are recorded per release, not in this file. For the Sprint 1 release they are in Part F,
section F4.2 of the Deliverable 1 report. That table maps every AC to its planned test, the actual test file and
name, and the result, and names the tested commit, the command and the pass, fail and skip counts. Each
release records the same fields.

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-10 | Initial STS for AC-01–AC-35 | Sprint 1 planning |
| 0.2 | 2026-11-12 | E2E runs with `SEED_DEMO_REQUESTS=false`; TEST-40 precondition states it. | PR #3 review: the demo booking on `CPE-0201` could make TEST-40 fail with `PERIOD_UNAVAILABLE`. |
| 0.2.1 | 2026-11-12 | TEST-25 sets the rejected status via Prisma instead of calling the reject endpoint. | PR #3 review: keeps AC-21 testable if F-05 reject slips (plan.md §D5). |
| 0.2.2 | 2026-11-13 | TEST-20 adds a padded 300-character purpose. | F-03 v0.1.1: the purpose limit applies after trimming. |
| 0.2.3 | 2026-11-14 | §4 no longer holds an empty results template. It points to the release results table (Part F4.2 of the report). | Deliverable 1 review: an unfilled template was left in the document. |
