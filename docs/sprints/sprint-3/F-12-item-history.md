# F-12 — Item loan history

| | |
|---|---|
| **Linked requirements** | FR-19, BR-06, BR-10, BR-13, NFR-02, NFR-11, NFR-12, NFR-13 |
| **Depends on** | F-07 (checkout and return), F-08 (overdue), F-09 (item pages) |
| **Sprint** | 3 |
| **Contract version** | 0.1 (draft, 2026-11-28). See [version history](#version-history). |

## 1. Behavior and workflow

1. A Custodian opens an item (`/items/:id`). Under the item details a **Loan history** section lists every time the
   item was handed over, newest first. A Borrower does not see this section.
2. The client calls `GET /api/items/:id/history` once the item has loaded. The server returns the item's **loans**.

**A loan** is a request whose item was handed over: its status is `CHECKED_OUT` or `RETURNED`. Requests that never
left the equipment room (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`) are not loans and do not appear. They are
visible on the Custodian's Requests page.

Each loan shows who borrowed it, the agreed period, when it was handed over and by whom, and, if it came back, when,
who received it, in what condition and the note. A loan that is still out shows **Checked out**, or **Overdue** when
its due date has passed (the same derived rule as F-08, never stored).

## 2. Rules, validation and failure cases

| Case | Result |
|---|---|
| Item with loans | 200, the loans ordered by `checkedOutAt` newest first, then `id` for a stable order |
| Item with no loan, including a new one | 200 `[]` |
| `RETIRED` item | 200, with its history (a Custodian can still read what happened) |
| Unknown or malformed `:id` | 404 `NOT_FOUND` |
| Borrower | 403 `FORBIDDEN` (BR-13). Not 404: the item exists for them, the history does not. |
| No or invalid token | 401 `UNAUTHENTICATED` |

Role is checked first (Borrower → 403), then the item is looked up (unknown → 404). Unknown query parameters are ignored.
There is no pagination in this version: a single item has a handful of loans a year. If the response grows past
200 loans for one item, that is a new contract version (see known limitations).

## 3. Permissions

| Operation | Anonymous | Borrower | Custodian |
|---|---|---|---|
| `GET /api/items/:id/history` | 401 | 403 | ✅ |

## 4. API

### `GET /api/items/:id/history` (Custodian)

200: an array of loans, newest first.

```json
[
  {
    "requestId": "uuid",
    "status": "RETURNED",
    "overdue": false,
    "borrower": { "id": "uuid", "displayName": "Borrower One" },
    "startDate": "2026-11-10", "dueDate": "2026-11-12", "purpose": "Signals lab",
    "checkedOutBy": { "id": "uuid", "displayName": "Custodian" }, "checkedOutAt": "2026-11-10T03:30:00.000Z",
    "returnedTo": { "id": "uuid", "displayName": "Custodian" }, "returnedAt": "2026-11-12T08:00:00.000Z",
    "returnCondition": "GOOD", "returnNote": null
  }
]
```

`overdue` is true only for a `CHECKED_OUT` loan whose due date is before today. For a loan still out, `returnedTo`,
`returnedAt`, `returnCondition` and `returnNote` are `null`. Errors: 401, 403, 404.

## 5. Data

Read-only, **no schema change**. The existing index `[itemId, status]` on `BorrowRequest` serves the query, and the
`checkedOut*` and `returned*` columns come from the F-07 migration.

## 6. UI

- On `/items/:id`, for a Custodian only, a section titled "Loan history" below "Booked periods".
- One row per loan: borrower, period ("10 Nov – 12 Nov 2026"), "Handed over 10 Nov 2026, 10:30 by Custodian", and
  either "Returned 12 Nov 2026, 15:00" with a **Good** or **Damaged** badge and the note, or the badge **Checked out**
  / **Overdue**.
- Loading "Loading history…". Empty: "This item has never been lent." Error: the generic alert with **Retry**, and the
  rest of the item page keeps working.
- At 360 px each loan stacks in one column (NFR-12). The section has a heading and the badges carry text (NFR-13).

## 7. Acceptance criteria

| AC | Given / When / Then |
|---|---|
| **AC-92** | **Given** item X with these requests: `RETURNED` (checked out 1 Nov), `CHECKED_OUT` (checked out 9 Nov), `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, **when** a Custodian calls `GET /api/items/X/history`, **then** only the `CHECKED_OUT` and `RETURNED` requests are returned, the 9 Nov one first. A loan of another item is not included. |
| **AC-93** | **Given** a returned loan with `DAMAGED` and a note, a returned loan with `GOOD`, and a `CHECKED_OUT` loan with due date 10 Nov (today 15 Nov), **then** each entry carries its borrower, `checkedOutBy`, `checkedOutAt`, `returnedTo`, `returnedAt`, `returnCondition` and `returnNote` as stored, and `overdue` is true only for the last one. |
| **AC-94** | **Given** an item with no loans, a `RETIRED` item with one, **when** the history is read, **then** `[]` and 200 with its loan. An unknown uuid and `abc` → 404. |
| **AC-95** | **When** a Borrower calls it, **then** 403 and no data. No token → 401. For a malformed id the Borrower still gets 403. |
| **AC-96** | **UI:** a Custodian sees "Loan history" with the loans and their badges, the empty text for an item without loans, and a Retry on error. A Borrower opening the same item sees no such section and no request is made. |
| **AC-97** | **Journey (E2E):** a Custodian checks out and returns a request as `DAMAGED` (F-07), opens that item, and the loan appears first with the **Damaged** badge and the note. |

Tests: see [sts.md](sts.md) (TEST-111 to TEST-116).

## 8. Definition of Done

1. Every AC above is implemented, and a deviation is a new contract version.
2. Every STS test for F-12 exists, ran on the release commit and passes, with none skipped or weakened.
3. The role check is in the backend, and a test proves a Borrower gets nothing (BR-13, NFR-02).
4. The API tests ran against the real database. The UI tests cover empty, loading and error.
5. The NFR-11 check in SR-03 includes this endpoint for the item with the most loans.
6. The PR was reviewed by the other student and CI is green. The contract, STS and traceability match the code.

**Known limitation:** no pagination (§2).

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-28 | Initial contract | Sprint 3 planning |
