# F-08 — Overdue tracking

| | |
|---|---|
| **Linked requirements** | FR-14, BR-03 (overdue extension), BR-08, NFR-02, NFR-12, NFR-13 |
| **Depends on** | F-07 (checkout creates `CHECKED_OUT` loans), F-02, F-03, F-05 (their overlap and availability rules change) |
| **Sprint** | 2 |
| **Contract version** | 0.1 (draft, 2026-11-25). See [version history](#version-history). |

## 1. Behavior and workflow

**Overdue is derived, never stored (DD-06).** A request is **overdue** when its `status` is `CHECKED_OUT` and
today (in `APP_TIMEZONE`) is after its `dueDate`. A loan due today is not overdue. No column or scheduled job
is added. The value is computed on every read, so it cannot go stale.

An overdue loan still has the item, so it keeps occupying it until it is returned. Its **effective end** is
`max(dueDate, today)` (BR-03). Every other request's effective end is its `dueDate`.

1. **Flag.** Every request resource gains `overdue: boolean`. Borrowers see it on their own requests in
   `/my-requests`. Custodians see it in `/requests`. An overdue row shows a red **Overdue** label next to its
   status badge.
2. **Overdue list.** A Custodian opens `/overdue` from the header. The client calls
   `GET /api/requests?overdue=true`, which returns every overdue loan with the oldest due date first. Each row
   shows the borrower, the item, the due date and how many days it is overdue. Returns still happen on the
   **Checked out** tab of `/requests` (F-07).
3. **Blocking (BR-08).** A Borrower who holds an overdue loan cannot create a request. `POST /api/requests`
   returns 409 `OVERDUE_BLOCK` until the loan is returned. The request form on `/items/:id` checks this in
   advance and shows why.
4. **Occupation (BR-03 extension).** When a request is created (F-03) or approved (F-05), an overdue loan on
   the same item counts as booked from its `startDate` to today. The catalog (F-02) shows the item as booked
   today and lists the loan among its committed periods.
5. **Checkout (F-07 v0.2).** A request cannot be checked out while another request on the same item is
   still `CHECKED_OUT`. This only happens when that loan is overdue, because BR-03 prevented overlapping
   approvals.

The check order for `POST /api/requests` becomes: body schema and BR-01 (400), **BR-08 (409
`OVERDUE_BLOCK`)**, item exists (404), BR-02, BR-03, BR-04, BR-05. BR-08 depends only on the Borrower, so it
comes before any item check.

## 2. Rules, validation and failure cases

Today is 15 Nov in every example.

### Derivation

| Request | `overdue` | Effective end |
|---|---|---|
| `CHECKED_OUT`, due 14 Nov | `true` | 15 Nov (today) |
| `CHECKED_OUT`, due 15 Nov | `false` | 15 Nov |
| `CHECKED_OUT`, due 20 Nov | `false` | 20 Nov |
| `APPROVED`, due 10 Nov (never checked out) | `false` | 10 Nov |
| `RETURNED`, `CANCELLED`, `REJECTED`, `PENDING`, any due date | `false` | its `dueDate` (only `APPROVED` and `CHECKED_OUT` occupy the item) |

### `GET /api/requests?overdue=true`

| Case | Result |
|---|---|
| Custodian | 200, every overdue request of every Borrower, ordered by `dueDate` ascending, then `createdAt` ascending, then `id` ascending |
| Borrower | 200, only their own overdue requests, in the same order (BR-14) |
| `overdue=false` or no `overdue` | No overdue filter (the existing F-04 / F-05 behavior and order) |
| `overdue` with any other value | 400 `VALIDATION_ERROR`, detail field `overdue` |
| Combined with `status` | Both filters apply. `status=CHECKED_OUT&overdue=true` equals `overdue=true`. Any other status gives `[]`. |
| No token | 401 `UNAUTHENTICATED` |

### `POST /api/requests` (BR-08, BR-03)

| Case | Result |
|---|---|
| The Borrower holds an overdue loan | 409 `OVERDUE_BLOCK` "You have an overdue loan. Return it before making a new request." No row is created. |
| The Borrower's loan is due today | Not overdue, so the request is accepted (other rules permitting) |
| The overdue loan was returned | No longer blocked |
| The body is invalid or breaks BR-01 | 400 as before. Validation comes first, even for a blocked Borrower. |
| Another Borrower's overdue loan on the item, due 14 Nov, and a new request for 15–16 Nov | 409 `PERIOD_UNAVAILABLE` (the loan occupies the item until today) |
| The same loan and a new request for 16–17 Nov | Accepted. The effective end is today, so tomorrow is not yet blocked. If the loan is still out tomorrow, the approval recheck refuses it. |

### `POST /api/requests/:id/approve` (BR-03)

| Case | Result |
|---|---|
| A `PENDING` request for 15–16 Nov on an item with an overdue loan due 14 Nov | 409 `PERIOD_UNAVAILABLE`, the request stays `PENDING` |
| A `PENDING` request for 16–17 Nov on the same item | 200, `APPROVED` |

### `POST /api/requests/:id/checkout` (F-07 v0.2)

| Case | Result |
|---|---|
| An `APPROVED` request in its window, on an `ACTIVE` item that another `CHECKED_OUT` request still holds | 409 `PERIOD_UNAVAILABLE` "This item is still checked out on another loan." Unchanged. |
| The same after the other loan is returned | 200, `CHECKED_OUT` |

The checkout check order becomes: role, request exists, status, BR-09 window, item status, **item still out**.

### Catalog (F-02 v0.3)

| Case | Result |
|---|---|
| An item with an overdue loan | `availableToday: false` in the list and the detail |
| `committedPeriods` | All `CHECKED_OUT` requests of the item (overdue or not) and the `APPROVED` ones with `dueDate ≥ today`, ordered by `startDate`. Each period gains `overdue: boolean`. `dueDate` stays the real due date. |
| After the overdue loan is returned | The period disappears and `availableToday` is `true` again (if nothing else is booked today) |

## 3. Permissions

| Operation | Anonymous | Borrower | Custodian |
|---|---|---|---|
| `overdue` flag on a request | 401 | own requests | all requests |
| `GET /api/requests?overdue=true` | 401 | own | all |
| `/overdue` page | redirected to `/login` | "You are not allowed to do this" page, no header link | ✅ |

## 4. API

### Request resource: new field

Every request resource (F-03 §4) gains `"overdue": boolean`. It is computed when the resource is read and is
`true` only for a `CHECKED_OUT` request whose `dueDate` is before today. A newly created request always has
`overdue: false`.

### `GET /api/requests?overdue=true`

Query: `overdue` = `"true"` | `"false"` (optional), alongside the existing `status`. 200: an array of request
resources, as in F-04. Errors: 400 `VALIDATION_ERROR`, 401.

### `POST /api/requests`

New error: 409 `OVERDUE_BLOCK` (BR-08, already reserved in [system-sds.md §C4.2](../../system-sds.md#c42-error-shape-and-codes)).

### `GET /api/items/:id`

Each element of `committedPeriods` gains `"overdue": boolean`:

```json
"committedPeriods": [
  { "startDate": "2026-11-10", "dueDate": "2026-11-14", "status": "CHECKED_OUT", "overdue": true },
  { "startDate": "2026-11-20", "dueDate": "2026-11-22", "status": "APPROVED", "overdue": false }
]
```

### `POST /api/requests/:id/checkout`

New error: 409 `PERIOD_UNAVAILABLE` when another request on the item is still `CHECKED_OUT`.

## 5. Data

No schema change and no migration. Overdue is derived from `status` and `dueDate` (DD-06). The existing
`[itemId, status]` and `[borrowerId, status]` indexes serve the new queries.

## 6. UI

- **Overdue label.** A red pill reading **Overdue** (`bg-badge-error-bg text-error-fg`) appears next to the
  status badge on every row whose `overdue` is `true`: `/my-requests` and the **All** and **Checked out** tabs
  of `/requests`. The text is always shown, so colour alone carries no meaning.
- **`/overdue` (Custodian).** The header gains an **Overdue** link after **Requests**. The page has the title
  "Overdue loans" and the line "Checked-out loans past their due date, oldest first." Each row shows the
  borrower's name, the item name and asset tag, "Due 14 Nov 2026" and "1 day overdue" (or "N days overdue").
  Days overdue = today − due date, with today in the application's time zone. The server's order applies.
  States: "Loading overdue loans…", empty "No overdue loans." and the error state with **Retry**. There are no
  action buttons.
- **Approved tab of `/requests`.** The tab also loads `GET /api/requests?overdue=true`. When an overdue loan
  holds the same item as an approved row, **Check out** is disabled with the reason "Item still out on an
  overdue loan". A BR-09 window reason ("Starts …", "Due date passed, …") takes precedence. A 409 from the server
  still shows on the row.
- **Request form on `/items/:id` (Borrower).** The form also loads `GET /api/requests?overdue=true`. When it
  returns any loan, an error alert above the form reads "You have an overdue loan: {item name}, due {date}.
  Return it before making a new request." with a **View my requests** link to `/my-requests`, and **Submit
  request** is disabled. If that call is still loading or fails, the form stays usable and the server decides.
  A 409 `OVERDUE_BLOCK` from the submit shows its message in the alert and disables **Submit request**.
- **Item detail.** An overdue committed period reads "2026-11-10 – 2026-11-14 · Overdue, not returned yet",
  with the extra text in the error colour. The catalog shows the item as **Booked today**.

All of it works at 360 px without horizontal scrolling (NFR-12). Every control and link has a label and a
keyboard path (NFR-13).

## 7. Acceptance criteria

| AC | Given / When / Then |
|---|---|
| **AC-66** | **Derivation** with today = 15 Nov: `CHECKED_OUT` due 14 Nov is overdue with effective end 15 Nov. `CHECKED_OUT` due 15 Nov and due 20 Nov are not overdue, with effective ends 15 and 20 Nov. `APPROVED` due 10 Nov is not overdue, effective end 10 Nov. |
| **AC-67** | **Given** a `CHECKED_OUT` request due 14 Nov and others that are not overdue (`CHECKED_OUT` due 15 Nov, `APPROVED` due 10 Nov, `RETURNED` due 10 Nov), **when** their owner calls `GET /api/requests` and `GET /api/requests/:id`, **then** only the first has `overdue: true`. A newly created request has `overdue: false`. |
| **AC-68** | **Given** overdue loans of Borrower 1 (due 12 and 14 Nov) and Borrower 2 (due 13 Nov) plus loans that are not overdue, **when** the Custodian calls `GET /api/requests?overdue=true`, **then** exactly the three, ordered 12, 13, 14 Nov. Borrower 1 gets only their two. `status=PENDING&overdue=true` → `[]`. `overdue=maybe` → 400 `VALIDATION_ERROR` (`overdue`). No token → 401. |
| **AC-69** | **BR-08.** **Given** Borrower 1 holds a loan due 14 Nov, **when** they create a valid request, **then** 409 `OVERDUE_BLOCK` and no row is created. An invalid body is still 400. Borrower 2 is not blocked. A loan due today does not block. After the Custodian returns the overdue loan, the same create is 201. |
| **AC-70** | **BR-03 on create.** **Given** Borrower 1's loan on CPE-0201 due 14 Nov, **when** Borrower 2 requests CPE-0201 for 15–16 Nov, **then** 409 `PERIOD_UNAVAILABLE`. A request for 16–17 Nov is 201. |
| **AC-71** | **BR-03 on approve.** **Given** the same overdue loan and Borrower 2's `PENDING` requests for 15–16 Nov and 16–17 Nov, **when** the Custodian approves each, **then** 409 `PERIOD_UNAVAILABLE` for the first (still `PENDING`) and 200 for the second. |
| **AC-72** | **Checkout.** **Given** the same overdue loan and Borrower 2's `APPROVED` request for 15–17 Nov on CPE-0201, **when** the Custodian checks it out, **then** 409 `PERIOD_UNAVAILABLE` and it stays `APPROVED`. After the overdue loan is returned, the checkout is 200. |
| **AC-73** | **Catalog.** **Given** the overdue loan on CPE-0201 and a future `APPROVED` request on it, **then** `GET /api/items` and `GET /api/items/:id` show `availableToday: false`, and `committedPeriods` lists the loan (real `dueDate`, `overdue: true`) and the future period (`overdue: false`). After the return, the loan is gone and `availableToday` is `true`. |
| **AC-74** | **UI (rows).** `/my-requests` and the **All** and **Checked out** tabs of `/requests` show **Overdue** exactly on the rows with `overdue: true`. On the **Approved** tab, **Check out** is disabled with "Item still out on an overdue loan" on a row whose item has an overdue loan. |
| **AC-75** | **UI (`/overdue`).** A Custodian sees the **Overdue** header link and the page lists the loans in the server's order with borrower, item, "Due …" and "N day(s) overdue". An empty list shows "No overdue loans.", a failure shows **Retry**. A Borrower has no link and gets the not-allowed page. |
| **AC-76** | **UI (request form).** **Given** the Borrower's overdue list returns a loan, the item page shows the alert naming it with a **View my requests** link, and **Submit request** is disabled. **Given** an empty list and a submit that returns 409 `OVERDUE_BLOCK`, the message is shown and **Submit request** becomes disabled. An overdue committed period on the item page reads "Overdue, not returned yet". |

There is no E2E journey: an overdue loan cannot be produced through the API on the day it is checked out
(BR-09 needs today ≤ due date). The API tests use a fixed clock and fixtures instead.

Tests: see [sts.md](sts.md) (TEST-80 to TEST-93).

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-25 | Initial contract | Sprint 2 planning (issue #11) |
