# F-03 — Submit borrow request

| | |
|---|---|
| **Linked requirements** | FR-06, BR-01, BR-02, BR-03, BR-04, BR-05, BR-13, NFR-02 |
| **Depends on** | F-01 (auth, `requireRole`), F-02 (item detail page) |
| **Sprint** | 1 |
| **Contract version** | 0.1.1 (draft, 2026-11-13). See [version history](#version-history). |

## 1. Behavior and workflow

1. A Borrower on `/items/:id` fills in **Start date**, **Due date** and **Purpose** and presses **Submit request**.
2. The client checks the required fields and BR-01 locally and shows field errors. If they pass, it calls
   `POST /api/requests`.
3. The server validates and then, **in one transaction**:
   1. locks the item row (`SELECT … FOR UPDATE`) and the borrower's user row (serialising BR-05 for the same borrower);
   2. checks BR-02 → BR-03 → BR-04 → BR-05 in this order, so the first failing rule determines the error;
   3. inserts the request with `status = PENDING` and `borrowerId = req.user.id`.
4. On 201 the client navigates to `/my-requests` and shows "Request submitted. Waiting for approval." On
   409 it shows the server message above the form and keeps the input.

### Rule definitions (pure functions in `server/src/domain/`)

```ts
// loanPeriod.ts – BR-01. today is a YYYY-MM-DD string in APP_TIMEZONE.
validateLoanPeriod(start, due, today): FieldError[]
//   start < today              -> { field: "startDate", message: "Start date cannot be in the past." }
//   due < start                -> { field: "dueDate",   message: "Due date must be on or after the start date." }
//   days(start..due) > 14      -> { field: "dueDate",   message: "A loan can be at most 14 days." }   // days = due - start + 1

// overlap.ts – BR-03 / BR-04. Inclusive ranges.
periodsOverlap(aStart, aDue, bStart, bDue): boolean   // aStart <= bDue && bStart <= aDue
```

## 2. Rules, validation and failure cases

| # | Case | Result |
|---|---|---|
| 1 | `itemId` missing / not UUID; `startDate`/`dueDate` missing or not a real `YYYY-MM-DD` date; `purpose` empty or > 300 chars **after trimming** | 400 `VALIDATION_ERROR` + `details` |
| 2 | BR-01: start before today; due before start; period > 14 days | 400 `VALIDATION_ERROR`, field-specific message above |
| 3 | Item does not exist or is `RETIRED` | 404 `NOT_FOUND` |
| 4 | BR-02: item is `MAINTENANCE` | 409 `ITEM_NOT_AVAILABLE` "This item is under maintenance and cannot be requested." |
| 5 | BR-03: period overlaps an `APPROVED`/`CHECKED_OUT` request on this item (any borrower) | 409 `PERIOD_UNAVAILABLE` "This item is already booked for part of that period." |
| 6 | BR-04: period overlaps the caller's own `PENDING`/`APPROVED`/`CHECKED_OUT` request on this item | 409 `DUPLICATE_REQUEST` "You already have a request for this item in that period." |
| 7 | BR-05: caller already has 3 active requests | 409 `ACTIVE_LIMIT_REACHED` "You can have at most 3 active requests." |
| 8 | Caller is a Custodian | 403 `FORBIDDEN`, nothing stored |
| 9 | Body contains `borrowerId`, `status`, etc. | Ignored. Owner is always the caller and status is always `PENDING`. |

**Boundaries:** start = today ✅; start = due (1-day loan) ✅; 14-day period ✅, 15-day ❌; a new period that starts
the day **after** an approved period's due date ✅; one that starts **on** its due date ❌ (inclusive). Overlap
with *another* borrower's `PENDING` request ✅ (allowed; resolved at approval). `REJECTED`/`CANCELLED`/`RETURNED`
requests never block and never count toward BR-05.

## 3. Permissions

Only `BORROWER` (`requireRole('BORROWER')`). Anonymous → 401. Custodian → 403.

## 4. API

### `POST /api/requests` (Borrower)

Request:
```json
{ "itemId": "uuid", "startDate": "2026-11-20", "dueDate": "2026-11-22", "purpose": "Signals lab experiment 4" }
```
201:
```json
{
  "id": "uuid", "status": "PENDING",
  "item": { "id": "uuid", "assetTag": "CPE-0201", "name": "Rigol DS1054Z oscilloscope" },
  "borrower": { "id": "uuid", "displayName": "Borrower One" },
  "startDate": "2026-11-20", "dueDate": "2026-11-22", "purpose": "Signals lab experiment 4",
  "rejectionReason": null, "decidedBy": null, "decidedAt": null,
  "createdAt": "2026-11-10T03:15:00.000Z"
}
```
This **request resource** shape is shared by F-04 and F-05. Errors: 400, 401, 403, 404, 409 (codes above).

## 5. Data

Inserts into `BorrowRequest` (SR-01 migration). Columns written: `itemId`, `borrowerId`, `startDate`, `dueDate`,
`purpose` (trimmed), `status = PENDING`, timestamps. The DB `CHECK (due_date >= start_date)` backs up BR-01.
**No schema change.**

## 6. UI

On `/items/:id`, Borrowers only: two `<input type="date">` with `min = today`, a `<textarea>` for Purpose
with a 300-character counter (it counts the trimmed text), and **Submit request** (disabled while submitting). Field errors appear under
each field. 409 errors appear in an alert. Success → `/my-requests` with a confirmation banner.

## 7. Acceptance criteria

| AC | Given / When / Then |
|---|---|
| **AC-15** | **Given** a Borrower and an `ACTIVE` item with no bookings, **when** they submit a valid request (even with `"borrowerId": <other user>` and `"status": "APPROVED"` in the body), **then** 201 with `status = PENDING` and `borrower.id` = the caller, and the row persists in the DB. |
| **AC-16** | BR-01 boundaries with today fixed: start = yesterday → 400 (`startDate`); start = today → accepted; due = start − 1 → 400 (`dueDate`); 14-day period → accepted; 15-day period → 400 (`dueDate`). |
| **AC-17** | Purpose empty, whitespace only, or 301 characters → 400 (`purpose`). 300 characters → accepted, also when surrounded by spaces (the limit applies to the trimmed text). |
| **AC-18** | Requesting the `MAINTENANCE` item → 409 `ITEM_NOT_AVAILABLE`. Requesting the `RETIRED` item or an unknown UUID → 404. Nothing is stored in either case. |
| **AC-19** | **Given** an `APPROVED` request on item X for 20–22 Nov, a new request for 22–24 Nov → 409 `PERIOD_UNAVAILABLE`. 23–25 Nov → 201. **Given** only another borrower's `PENDING` request for 20–22 Nov, a request for 21 Nov → 201. |
| **AC-20** | **Given** the caller's own `PENDING` request on X for 20–22 Nov, another one for 21–23 Nov → 409 `DUPLICATE_REQUEST`. For a different item and the same dates → 201. |
| **AC-21** | **Given** the caller has 3 active requests, a 4th → 409 `ACTIVE_LIMIT_REACHED` and the count stays 3. **After** one of them is rejected, a new request → 201. |
| **AC-22** | A Custodian calling `POST /api/requests` with a valid body → 403 `FORBIDDEN` and no row is created. |
| **AC-23** | **UI:** on an item page, a due date before the start date shows a field error without calling the API. A server 409 shows its message in an alert and keeps the input. A valid submission navigates to My Requests, where the new request shows **Pending**. |

Tests: see [sts.md](sts.md) (TEST-17 to TEST-27, TEST-40).

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-10 | Initial contract | Sprint 1 planning |
| 0.1.1 | 2026-11-13 | The 300-character purpose limit applies after trimming (§2, §6, AC-17). | F-03 implementation: the old wording did not say whether surrounding spaces count. The stored value is trimmed, so the limit applies to it. |
