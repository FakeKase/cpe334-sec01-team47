# F-06 — Cancel request

| | |
|---|---|
| **Linked requirements** | FR-11, BR-06 (cancel part), BR-09 (expired approval), BR-13, BR-14, NFR-02, NFR-12, NFR-13 |
| **Depends on** | F-04 (My requests), F-05 (transition table) |
| **Sprint** | 2 |
| **Contract version** | 0.1 (draft, 2026-11-22). See [version history](#version-history). |

## 1. Behavior and workflow

1. A Borrower opens `/my-requests`. Rows whose status is `PENDING` or `APPROVED` show a **Cancel** button.
2. The Borrower presses **Cancel**. A confirm dialog asks to cancel the request. Choosing **Keep request**
   closes it with no call.
3. On **Cancel request** the client calls `POST /api/requests/:id/cancel` (no body). The server:
   1. looks up the request with the Borrower's scope (own requests only, DD-08);
   2. updates with `WHERE id = :id AND status IN ('PENDING', 'APPROVED')`, setting `status = CANCELLED` and
      `cancelledAt = now()`. If 0 rows are updated, the request exists but is in another state →
      409 `INVALID_TRANSITION`.
4. The row shows the **Cancelled** badge and a toast says "Request cancelled".

Cancelling is allowed on any date. In particular an `APPROVED` request whose due date has passed without
checkout can only be cancelled (BR-09), and a `PENDING` one whose due date has passed can be cancelled or
rejected.

**Effects on other rules (no extra code):** BR-03 only counts `APPROVED` and `CHECKED_OUT` requests, so
cancelling an approved request frees its period for new requests and approvals. BR-05 counts only `PENDING`,
`APPROVED` and `CHECKED_OUT`, so it also frees one of the Borrower's three active slots.

`canTransition` already encodes `PENDING→CANCELLED` and `APPROVED→CANCELLED` (F-05 §1, AC-32). Nothing changes
there.

## 2. Rules, validation and failure cases

| Case | Result |
|---|---|
| Own `PENDING` request | 200, `CANCELLED` |
| Own `APPROVED` request | 200, `CANCELLED`, period free again (BR-03) |
| Own `APPROVED` request whose due date is before today | 200, `CANCELLED` (BR-09) |
| Own request that is `REJECTED`, `CANCELLED`, `CHECKED_OUT` or `RETURNED` | 409 `INVALID_TRANSITION` "Only pending or approved requests can be cancelled." Request unchanged. |
| Two cancels of the same request at the same moment | Exactly one 200, the other 409 `INVALID_TRANSITION`. `cancelledAt` is set once. |
| Another Borrower's request | 404 `NOT_FOUND`, unchanged (BR-14, DD-08) |
| Custodian (any request) | 403 `FORBIDDEN`, unchanged (BR-13) |
| Unknown or malformed id | 404 `NOT_FOUND` |
| No or invalid token | 401 `UNAUTHENTICATED` |

A cancel does not take a reason, and any body is ignored.

## 3. Permissions

`cancel` requires `BORROWER` and ownership of the request. Role is checked first (Custodian → 403), then
ownership (not own → 404).

## 4. API

### `POST /api/requests/:id/cancel` (Borrower)

No body. 200: the updated request resource ([F-03 §4](../sprint-1/F-03-submit-request.md#4-api)) with
`status: "CANCELLED"` and `cancelledAt` set. Errors: 401, 403, 404, 409 `INVALID_TRANSITION`.

### Request resource: `cancelledAt` (new field)

Every request resource gains `"cancelledAt": null | "<ISO timestamp>"` after `decidedAt`. It is `null` unless
the request was cancelled. Existing fields are unchanged.

## 5. Data

New column `BorrowRequest.cancelledAt TIMESTAMPTZ NULL`, added by an **additive** migration
(`20261122000000_add_cancelled_at`). No existing row changes, so a rollback of the code is safe. `status` and
`updatedAt` are written as before. No new index.

## 6. UI

`/my-requests` (Borrower). **Cancel** is a secondary button at the end of the row, shown only for `PENDING` and
`APPROVED`. On mobile (360 px) it sits below the badge and does not cause horizontal scrolling. It opens a
native modal dialog with the title "Cancel request", the item name and period, and two buttons: **Keep request**
(secondary) and **Cancel request** (danger). While the call runs, both are disabled and the danger button reads
"Cancelling…". On success the dialog closes, the row shows **Cancelled** with no button, and a toast says
"Request cancelled". A 409 closes the dialog, shows the server message in an alert on the row and reloads the
list. A network error keeps the dialog open with the error shown inside it.

The Custodian's `/requests` has no cancel control (BR-13).

## 7. Acceptance criteria

| AC | Given / When / Then |
|---|---|
| **AC-36** | **Given** Borrower 1's `PENDING` request, **when** they call `POST /api/requests/:id/cancel`, **then** 200 with `status = CANCELLED` and `cancelledAt` set. The DB row matches, `decidedById` and `decidedAt` stay null, and `GET /api/requests` shows `CANCELLED`. |
| **AC-37** | **Given** an `APPROVED` request of Borrower 1 on item X, 20–22 Nov, **when** they cancel it, **then** 200 `CANCELLED`, Borrower 2 can create an overlapping request on X (201) and a Custodian can approve it (200). **Given** Borrower 1 holds 3 active requests, after cancelling one they can create another (201). |
| **AC-38** | **Given** an `APPROVED` request with due date before today (BR-09), **when** the Borrower cancels it, **then** 200 `CANCELLED`. |
| **AC-39** | **Given** own requests that are `REJECTED`, `CANCELLED`, `CHECKED_OUT` or `RETURNED`, **when** the Borrower cancels each, **then** 409 `INVALID_TRANSITION` and the row is unchanged (the already `CANCELLED` row keeps its original `cancelledAt`). |
| **AC-40** | **Given** Borrower 2's request, **when** Borrower 1 cancels it, **then** 404 and it is unchanged. A Custodian cancelling any request → 403, unchanged. No token → 401. Unknown or malformed id → 404. |
| **AC-41** | **Given** one `PENDING` request, **when** two cancels are sent concurrently, **then** exactly one is 200 and the other 409 `INVALID_TRANSITION`, and the row is `CANCELLED` with one `cancelledAt`. |
| **AC-42** | **UI:** **Cancel** appears only on `PENDING` and `APPROVED` rows of `/my-requests` and not on a Custodian's `/requests`. **Keep request** sends nothing. Confirming shows the **Cancelled** badge and the toast. A 409 shows its message on the row. |

Tests: see [sts.md](sts.md) (TEST-42 to TEST-50).

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-22 | Initial contract | Sprint 2 planning |
