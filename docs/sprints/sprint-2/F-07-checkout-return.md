# F-07 — Checkout and return

| | |
|---|---|
| **Linked requirements** | FR-12, FR-13, BR-06 (checkout and return part), BR-09, BR-10, BR-13, NFR-02, NFR-12, NFR-13 |
| **Depends on** | F-05 (review queue, transition table), F-06 (cancel), F-09 (item status `MAINTENANCE`) |
| **Sprint** | 2 |
| **Contract version** | 0.1 (draft, 2026-11-25). See [version history](#version-history). |

## 1. Behavior and workflow

**Checkout (hand-over)**

1. A Custodian opens `/requests` and the **Approved** tab. Each `APPROVED` row shows a **Check out** button.
2. The Custodian hands the item over and presses **Check out**. The client calls
   `POST /api/requests/:id/checkout` (no body). The server, in one transaction:
   1. locks the request's item row (`SELECT … FOR UPDATE`), as approve does;
   2. re-reads the request. If it is not `APPROVED` → 409 `INVALID_TRANSITION`;
   3. checks the window (BR-09): today (in `APP_TIMEZONE`) must be between `startDate` and `dueDate`, both
      inclusive. Earlier → 409 `INVALID_TRANSITION`, later → 409 `INVALID_TRANSITION` (different messages, §2);
   4. checks that the item is `ACTIVE`. Otherwise → 409 `ITEM_NOT_AVAILABLE` (§2);
   5. updates with `WHERE id = :id AND status = 'APPROVED'`, setting `status = CHECKED_OUT`,
      `checkedOutById = req.user.id` and `checkedOutAt = now()`. If 0 rows are updated →
      409 `INVALID_TRANSITION`.
3. The row leaves the Approved tab and appears under **Checked out**.

**Return**

1. The Custodian opens the **Checked out** tab. Each `CHECKED_OUT` row shows a **Return** button.
2. **Return** opens a dialog: the condition (**Good** or **Damaged**, required), an optional note, and, when
   **Damaged** is chosen, a warning that the item will be set to maintenance (BR-10).
3. On confirm the client calls `POST /api/requests/:id/return` with `{ "condition": "GOOD" | "DAMAGED",
   "note"?: string }`. The server, in one transaction:
   1. locks the item row;
   2. updates with `WHERE id = :id AND status = 'CHECKED_OUT'`, setting `status = RETURNED`,
      `returnedToId = req.user.id`, `returnedAt = now()`, `returnCondition` and `returnNote`. If 0 rows are
      updated → 409 `INVALID_TRANSITION`;
   3. when `condition = DAMAGED`, sets the item's `status` to `MAINTENANCE` (BR-10) **in the same
      transaction**. If this fails, the return does not happen either.
4. The row leaves the Checked out tab. The Borrower sees **Returned** on `/my-requests`.

A return is allowed on any date. A loan whose due date has passed is still returned the same way (F-08 adds the
overdue display and does not change this endpoint).

**Effects on other rules (no extra code):** BR-03 counts only `APPROVED` and `CHECKED_OUT`, so `RETURNED`
frees the period. A `DAMAGED` return makes the item `MAINTENANCE`, so BR-02 refuses new requests and approvals
for it until a Custodian sets it back to `ACTIVE` (F-09). BR-05 counts only `PENDING`, `APPROVED` and
`CHECKED_OUT`, so a return frees one of the Borrower's three active slots.

## 2. Rules, validation and failure cases

### Checkout

| Case | Result |
|---|---|
| `APPROVED`, start ≤ today ≤ due, item `ACTIVE` | 200, `CHECKED_OUT` |
| `APPROVED`, today **before** `startDate` | 409 `INVALID_TRANSITION` "This request starts on 2026-11-23 and cannot be checked out before then." (the real start date). Unchanged. |
| `APPROVED`, today **after** `dueDate` (BR-09) | 409 `INVALID_TRANSITION` "The due date has passed, so this request can only be cancelled." Unchanged. |
| `APPROVED`, item `MAINTENANCE` | 409 `ITEM_NOT_AVAILABLE` "This item is under maintenance, so it cannot be handed over." Unchanged. |
| `PENDING`, `REJECTED`, `CANCELLED`, `CHECKED_OUT` or `RETURNED` | 409 `INVALID_TRANSITION` "Only approved requests can be checked out." Unchanged. |
| Two checkouts of the same request at the same moment | Exactly one 200, the other 409 `INVALID_TRANSITION`. `checkedOutAt` is set once. |
| A checkout and a Borrower's cancel of the same `APPROVED` request at the same moment | Exactly one wins. The request ends `CHECKED_OUT` or `CANCELLED`, never both, and the loser gets 409 `INVALID_TRANSITION`. |

The check order is: role, request exists, status, window, item status. A request outside its window is
reported as a window error even if the item is also under maintenance.

### Return

| Case | Result |
|---|---|
| `CHECKED_OUT`, condition `GOOD` | 200, `RETURNED`. Item status unchanged. |
| `CHECKED_OUT`, condition `DAMAGED` | 200, `RETURNED`, and the item becomes `MAINTENANCE` (BR-10). |
| `CHECKED_OUT` with a due date before today | 200, `RETURNED` (any date is allowed) |
| `condition` missing or not `GOOD` / `DAMAGED` | 400 `VALIDATION_ERROR`, detail field `condition`. Nothing changes. |
| `note` longer than 500 characters after trimming | 400 `VALIDATION_ERROR`, detail field `note`. Nothing changes. |
| `note` empty or whitespace only | Accepted. Stored as `null`. |
| `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` or `RETURNED` | 409 `INVALID_TRANSITION` "Only checked-out requests can be returned." The request and the item are unchanged, even when `condition` is `DAMAGED`. |
| Two returns of the same request at the same moment | Exactly one 200, the other 409 `INVALID_TRANSITION`. `returnedAt` is set once. |

### Both endpoints

| Case | Result |
|---|---|
| Borrower (any request) | 403 `FORBIDDEN`, unchanged (BR-13) |
| Unknown or malformed id | 404 `NOT_FOUND` |
| No or invalid token | 401 `UNAUTHENTICATED` |

Unknown keys in the return body (for example `status` or `returnedToId`) are ignored. The request body of a
checkout is ignored.

## 3. Permissions

`checkout` and `return` require `CUSTODIAN`. The role is checked first (Borrower → 403), then the request is
looked up (unknown → 404). Both run through `requireRole("CUSTODIAN")`, which runs before body validation, so
a Borrower with an invalid body still gets 403.

## 4. API

### `POST /api/requests/:id/checkout` (Custodian)

No body. 200: the updated request resource ([F-03 §4](../sprint-1/F-03-submit-request.md#4-api)) with
`status: "CHECKED_OUT"`, `checkedOutBy` and `checkedOutAt` set. Errors: 401, 403, 404, 409 `INVALID_TRANSITION`,
409 `ITEM_NOT_AVAILABLE`.

### `POST /api/requests/:id/return` (Custodian)

Body: `{ "condition": "GOOD" | "DAMAGED", "note"?: string }`. 200: the updated request resource with
`status: "RETURNED"`, `returnedTo`, `returnedAt`, `returnCondition` and `returnNote` set. Errors: 400
`VALIDATION_ERROR`, 401, 403, 404, 409 `INVALID_TRANSITION`.

### Request resource: new fields

Every request resource gains these fields after `cancelledAt`. All are `null` until the step has happened.
Existing fields are unchanged.

```json
"checkedOutBy": null | { "id": "uuid", "displayName": "Custodian" },
"checkedOutAt": null | "<ISO timestamp>",
"returnedTo":   null | { "id": "uuid", "displayName": "Custodian" },
"returnedAt":   null | "<ISO timestamp>",
"returnCondition": null | "GOOD" | "DAMAGED",
"returnNote":   null | "string"
```

A Borrower sees these fields on their own requests, in the same way as `decidedBy`.

## 5. Data

New enum `ReturnCondition (GOOD, DAMAGED)` and new nullable columns on `BorrowRequest`, added by an
**additive** migration (`20261125000000_add_checkout_return`): `checkedOutById` (FK to `User`),
`checkedOutAt TIMESTAMPTZ`, `returnedToId` (FK to `User`), `returnedAt TIMESTAMPTZ`, `returnCondition`,
`returnNote TEXT`. These are the columns marked `(S2)` in [system-sds.md §C2](../../system-sds.md#c2-data-design).
No existing row changes, so a rollback of the code is safe. Foreign keys use `ON DELETE RESTRICT`, like
`decidedById`. No new index.

The item status change in a `DAMAGED` return uses the existing `Item.status` column.

## 6. UI

**`/requests` (Custodian).** The tabs are **Pending** (default), **Approved**, **Checked out** and **All**.

- **Approved** lists `APPROVED` requests, with **Check out** on each row. The server order applies. Outside the
  BR-09 window the button is disabled and the reason is shown beside it: "Starts 23 Nov" when the start date is
  after today, or "Due date passed, can only be cancelled" when the due date is before today. The client works
  out "today" in the application's time zone, and the server decides in the end.
- **Checked out** lists `CHECKED_OUT` requests, with **Return** on each row.
- **Return** opens a native modal dialog titled "Return item", showing the item and borrower. It has a
  required choice **Good** / **Damaged** (nothing preselected), an optional **Note** textarea (counter /500),
  and the buttons **Cancel** and **Return item**. **Return item** is disabled until a condition is chosen. When
  **Damaged** is chosen, an info alert reads "The item will be set to maintenance and cannot be requested until a
  Custodian makes it available again."
- While a call runs, the row's buttons are disabled and read "Checking out…" or "Returning…".
- On success the row leaves the tab. A toast says "Item checked out", "Item returned" or, for `DAMAGED`,
  "Item returned and set to maintenance".
- A 409 shows the server message in an alert on the row, and the dialog (if open) closes. A network error keeps
  the dialog open with the error shown inside it.
- Empty states: "Nothing to hand over." (Approved) and "Nothing is checked out." (Checked out).
- **All** shows every request with its badge, and no action buttons.

**`/my-requests` (Borrower).** Rows show the **Checked out** and **Returned** badges. There are no new
controls. The Borrower has no checkout or return control, and a Custodian still has no cancel control (BR-13).

All of it works at 360 px without horizontal scrolling (NFR-12). Every control has a label, a visible focus and
a keyboard path, and **Esc** closes the dialog (NFR-13).

## 7. Acceptance criteria

| AC | Given / When / Then |
|---|---|
| **AC-55** | **Given** an `APPROVED` request whose period includes today (15 Nov) on an `ACTIVE` item, **when** a Custodian calls `POST /api/requests/:id/checkout`, **then** 200 with `status = CHECKED_OUT`, `checkedOutBy` the Custodian and `checkedOutAt` set. The DB row matches, the item stays `ACTIVE`, `GET /api/requests` shows `CHECKED_OUT`, and the new fields are `null` on an untouched request. |
| **AC-56** | **BR-09 boundaries** with today = 15 Nov: start 15, due 20 → 200. Start 10, due 15 → 200. Start 16, due 20 → 409 `INVALID_TRANSITION` naming the start date. Start 10, due 14 → 409 `INVALID_TRANSITION` "…can only be cancelled." The two refused rows are unchanged. |
| **AC-57** | **Given** `PENDING`, `REJECTED`, `CANCELLED`, `CHECKED_OUT` and `RETURNED` requests, **when** each is checked out, **then** 409 `INVALID_TRANSITION` and the row is unchanged. **Given** an `APPROVED` request in its window on a `MAINTENANCE` item, **then** 409 `ITEM_NOT_AVAILABLE` and the row is unchanged. |
| **AC-58** | **Given** any request, **when** a Borrower calls checkout or return, **then** 403 and nothing changes (also with an invalid return body). No token → 401. Unknown or malformed id → 404. |
| **AC-59** | **Concurrency.** Two checkouts of one `APPROVED` request: one 200 and one 409 `INVALID_TRANSITION`, `CHECKED_OUT`, one `checkedOutAt`. A checkout and a Borrower's cancel at the same moment: exactly one wins and the row is `CHECKED_OUT` or `CANCELLED`. Two returns of one `CHECKED_OUT` request: one 200 and one 409, one `returnedAt`. |
| **AC-60** | **Given** a `CHECKED_OUT` request, **when** a Custodian returns it with `GOOD` and a note `"  Cable included  "`, **then** 200 with `status = RETURNED`, `returnedTo` the Custodian, `returnedAt`, `returnCondition = GOOD` and `returnNote = "Cable included"`. The item stays `ACTIVE`. A whitespace-only note is stored as `null`. Borrower 2 can then request and be approved for an overlapping period (BR-03). |
| **AC-61** | **Given** a `CHECKED_OUT` request, **when** it is returned with `DAMAGED`, **then** 200 `RETURNED` and the item's status is `MAINTENANCE` in the DB. A new request for that item → 409 `ITEM_NOT_AVAILABLE`, and `GET /api/items` shows `availableToday: false` (BR-10). |
| **AC-62** | **Given** a `CHECKED_OUT` request, **when** return is called with a missing, empty or unknown `condition`, or a `note` of 501 characters, **then** 400 `VALIDATION_ERROR` naming `condition` or `note`, and the request and the item are unchanged. A note of 500 characters is accepted. |
| **AC-63** | **Given** `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` and `RETURNED` requests, **when** each is returned (with `DAMAGED`), **then** 409 `INVALID_TRANSITION` and neither the request nor the item changes. A `CHECKED_OUT` request with a due date before today is returned with 200. |
| **AC-64** | **UI (Custodian):** the Approved tab shows **Check out** on each row, disabled with "Starts …" or "Due date passed, can only be cancelled" outside the window. Checkout leaves the tab and shows "Item checked out". On the Checked out tab, **Return item** stays disabled until a condition is chosen. **Damaged** shows the maintenance warning. Returning shows the matching toast, and a 409 shows its message on the row. |
| **AC-65** | **UI (Borrower) and journey:** `/my-requests` shows **Checked out** and **Returned** badges and no checkout or return control. **E2E:** a Custodian approves, checks out and returns a request as `DAMAGED`, and the catalog then shows the item as under maintenance. |

Tests: see [sts.md](sts.md) (TEST-65 to TEST-79).

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-25 | Initial contract | Sprint 2 planning |
