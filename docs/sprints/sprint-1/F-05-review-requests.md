# F-05 — Review requests (approve / reject)

| | |
|---|---|
| **Linked requirements** | FR-08, FR-09, FR-10, BR-02, BR-03, BR-06 (approve/reject part), BR-07, BR-13, NFR-02, NFR-05 |
| **Depends on** | F-01, F-03, F-04 (shared list/detail endpoints) |
| **Sprint** | 1 |
| **Contract version** | 0.1 (draft, 2026-11-10). See [version history](#version-history). |

## 1. Behavior and workflow

1. A Custodian logs in and lands on `/requests`. The **Pending** tab calls `GET /api/requests?status=PENDING`,
   which returns all borrowers' pending requests, **oldest first**, so they are handled in order.
2. The Custodian presses **Approve** on a row. The client calls `POST /api/requests/:id/approve`.
   The server, in one transaction:
   1. locks the request's item row (`SELECT … FOR UPDATE`);
   2. re-reads the request. If it is not `PENDING` → 409 `INVALID_TRANSITION`;
   3. re-checks BR-02 (item `ACTIVE`) and BR-03 (no overlap with `APPROVED`/`CHECKED_OUT` on the item);
   4. updates with `WHERE id = :id AND status = 'PENDING'`, setting `status = APPROVED`,
      `decidedById = req.user.id` and `decidedAt = now()`. If 0 rows are updated → 409 `INVALID_TRANSITION`.
3. The Custodian presses **Reject**. A dialog requires a reason, and the client calls
   `POST /api/requests/:id/reject { reason }`. The server performs the same transition guard and sets
   `status = REJECTED`, `rejectionReason`, `decidedById` and `decidedAt`.
4. The row leaves the Pending list. The Borrower sees the new status in F-04.

Other overlapping `PENDING` requests are **not** changed automatically when one is approved. Approving any of
them later fails with `PERIOD_UNAVAILABLE`, and the Custodian then rejects it with a reason.

**Transition table (`server/src/domain/transitions.ts`)** — the full BR-06 table is defined now. Sprint 1 only
exposes approve/reject:

```ts
const ALLOWED = {
  PENDING:     ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED:    ["CHECKED_OUT", "CANCELLED"],
  CHECKED_OUT: ["RETURNED"],
  REJECTED: [], CANCELLED: [], RETURNED: [],
};
canTransition(from, to): boolean
```

## 2. Rules, validation and failure cases

| Case | Result |
|---|---|
| Approve/reject a request that is not `PENDING` (already approved, rejected, …) | 409 `INVALID_TRANSITION` "Only pending requests can be approved or rejected." Request unchanged. |
| Approve when the item is now `MAINTENANCE` or `RETIRED` | 409 `ITEM_NOT_AVAILABLE`, request stays `PENDING` |
| Approve when another overlapping request is already `APPROVED` (BR-03) | 409 `PERIOD_UNAVAILABLE`, request stays `PENDING` |
| Two overlapping pending requests approved at the same moment | Exactly one succeeds. The other gets 409 `PERIOD_UNAVAILABLE` (NFR-05). |
| Reject with missing, empty or whitespace-only reason, or reason > 500 chars | 400 `VALIDATION_ERROR` (`reason`) (BR-07) |
| Approve after the start date has passed (request never decided in time) | Allowed in Sprint 1 only if `dueDate ≥ today`. Otherwise 409 `INVALID_TRANSITION` "This request's period has already ended." Such requests should be rejected instead. |
| Borrower calls approve or reject (even on their own request) | 403 `FORBIDDEN`, unchanged |
| Unknown id | 404 `NOT_FOUND` |

## 3. Permissions

`approve` and `reject` require `CUSTODIAN`. The list and detail endpoints are role-scoped: a Custodian sees
all requests with `borrower` info. Anonymous → 401.

## 4. API

### `GET /api/requests?status=PENDING` (Custodian view)

200: array of request resources ([F-03 §4](F-03-submit-request.md#4-api)). When the caller is a Custodian and
`status=PENDING`, the list is ordered by `createdAt` **ascending**. All other lists are ordered newest first.

### `POST /api/requests/:id/approve` (Custodian)

No body. 200: the updated request resource with `status: "APPROVED"`, `decidedBy: { id, displayName }` and
`decidedAt`. Errors: 401, 403, 404, 409 `INVALID_TRANSITION` / `ITEM_NOT_AVAILABLE` / `PERIOD_UNAVAILABLE`.

### `POST /api/requests/:id/reject` (Custodian)

Request: `{ "reason": "Oscilloscope reserved for the Signals lab exam that week." }`
200: the updated request resource with `status: "REJECTED"` and `rejectionReason`. Errors: 400, 401, 403, 404,
409 `INVALID_TRANSITION`.

## 5. Data

Updates `BorrowRequest.status`, `rejectionReason`, `decidedById`, `decidedAt` and `updatedAt`. These columns
exist from the SR-01 migration. **No schema change.** The `(status, createdAt)` index supports the queue.

## 6. UI

`/requests` (Custodian only; Borrowers get the "not allowed" page and no nav link). It has tabs **Pending**
(default) and **All**. Each row shows the borrower name, item and asset tag, period, purpose and submission
time, with **Approve** and **Reject** buttons that are disabled while the action runs. **Reject** opens a dialog
with a labelled required "Reason" textarea (counter /500). **Confirm** is disabled until the reason is
non-blank. On success, the row disappears from Pending and a toast says "Request approved" or "Request
rejected". A 409 shows its message inline on the row. Empty Pending tab: "No pending requests."

## 7. Acceptance criteria

| AC | Given / When / Then |
|---|---|
| **AC-27** | **Given** pending requests from two borrowers created at t1 < t2, **when** the Custodian calls `GET /api/requests?status=PENDING`, **then** both are returned, ordered t1 then t2, each with `borrower.displayName`. |
| **AC-28** | **When** the Custodian approves a pending request with no conflicts, **then** 200 with `status = APPROVED`, `decidedBy.id` = the Custodian and `decidedAt` set. The DB row matches, and the Borrower's `GET /api/requests/:id` shows `APPROVED`. |
| **AC-29** | **Given** two overlapping pending requests A and B on the same item, after A is approved, approving B → 409 `PERIOD_UNAVAILABLE` and B stays `PENDING`. |
| **AC-30** | **Given** a pending request whose item was set to `MAINTENANCE` after submission, approving → 409 `ITEM_NOT_AVAILABLE` and the request stays `PENDING`. |
| **AC-31** | Rejecting with a 1–500 char reason → 200 `REJECTED` with the trimmed reason stored. An empty, blank or 501-character reason → 400 (`reason`) and the request stays `PENDING`. |
| **AC-32** | Approving or rejecting a request that is already `APPROVED` or `REJECTED` → 409 `INVALID_TRANSITION`, unchanged. Approving a `PENDING` request whose `dueDate` is before today → 409 `INVALID_TRANSITION`, while rejecting it → 200. `canTransition` returns true exactly for the six BR-06 pairs and false for all other 30 pairs. |
| **AC-33** | A Borrower calling approve or reject (including on their own request) → 403 and the request is unchanged. |
| **AC-34** | **Given** two overlapping pending requests on the same item, **when** both approvals are sent concurrently, **then** exactly one response is 200, the other is 409 `PERIOD_UNAVAILABLE`, and the DB has exactly one `APPROVED` request for that period. |
| **AC-35** | **UI:** the Custodian sees the pending queue. **Reject** cannot be confirmed with an empty reason. After confirming with a reason the row leaves the list. A Borrower opening `/requests` sees "You are not allowed to do this". |

Tests: see [sts.md](sts.md) (TEST-31 to TEST-41).

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-10 | Initial contract | Sprint 1 planning |
