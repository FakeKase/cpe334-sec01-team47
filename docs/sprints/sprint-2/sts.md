# Sprint 2 — Software Test Specification (STS)

**Document version:** 0.1 (draft, 2026-11-22)
Covers the Sprint 2 acceptance criteria written so far. It grows as the other Sprint 2 contracts are added.
Levels, tools and common preconditions (test database, fixed clock **today = 2026-11-15**, `loginAs`) are the
same as in the [Sprint 1 STS §1](../sprint-1/sts.md#1-test-levels-tools-and-environment).

## F-06 Cancel request

Contract: [F-06](F-06-cancel-request.md). Files: `server/test/api/cancel.test.ts`,
`client/src/pages/MyRequests.test.tsx`, `client/src/pages/Requests.test.tsx`, `e2e/cancel-request.spec.ts`.

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-42 | AC-36 | API | Borrower 1's `PENDING` request R | Borrower 1: `POST /api/requests/R/cancel`, then `GET /api/requests` | 200, `status = CANCELLED`, `cancelledAt` an ISO time. DB: `status = CANCELLED`, `cancelledAt` set, `decidedById` and `decidedAt` null. The list shows `CANCELLED`. |
| TEST-43 | AC-37 | API | Borrower 1's `APPROVED` R on CPE-0201, 20–22 Nov. Separately, Borrower 1 with 3 active requests | Cancel R. Borrower 2 creates a request on CPE-0201 for 21–23 Nov, then the Custodian approves it. Borrower 1 cancels one of the 3 and creates a new request | Cancel 200. Borrower 2's create 201 and approve 200. Borrower 1's new create 201. |
| TEST-44 | AC-38 | API | `APPROVED` request with 10–12 Nov (today 15 Nov) | Borrower cancels | 200, `CANCELLED`. |
| TEST-45 | AC-39 | API | Own requests `REJECTED`, `CANCELLED` (with a known `cancelledAt`), `CHECKED_OUT`, `RETURNED` (`it.each`) | Borrower cancels each | 409 `INVALID_TRANSITION`. Status and `cancelledAt` unchanged. |
| TEST-46 | AC-40 | API | Borrower 2's `PENDING` request | Borrower 1 cancels it. Custodian cancels it. No token. Unknown uuid. `abc` | 404, 403, 401, 404, 404. The row is unchanged. |
| TEST-47 | AC-41 | API | One `PENDING` request | Two `POST …/cancel` sent with `Promise.all` | One 200 and one 409 `INVALID_TRANSITION`. DB: `CANCELLED`, one `cancelledAt`. |
| TEST-48 | AC-42 | Component | MSW: `/api/requests` returns PENDING, APPROVED, REJECTED, CANCELLED, CHECKED_OUT and RETURNED rows for a Borrower | Render `/my-requests` | **Cancel** buttons on exactly the PENDING and APPROVED rows. |
| TEST-49 | AC-42 | Component | MSW: cancel returns the cancelled resource; another case returns 409. A Custodian session | Press Cancel, then **Keep request**; press Cancel, then **Cancel request**; then the 409 case. Render `/requests` as a Custodian | Keep: no POST, the row is unchanged. Confirm: POST once, **Cancelled** badge, no button, toast "Request cancelled". 409: the message is shown on the row. No Cancel button on the Custodian's page. |
| TEST-50 | AC-42 | E2E | Seeded app. Borrower One has a `PENDING` request on CPE-0203 (created through the API) | Sign in, open My requests, press Cancel then **Keep request**, press Cancel then **Cancel request** | After Keep the row is still **Pending**. After confirming the row shows **Cancelled** with no button and the toast appears. After a reload it is still **Cancelled**. |
