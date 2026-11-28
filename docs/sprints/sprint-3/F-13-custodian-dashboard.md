# F-13 — Custodian dashboard

| | |
|---|---|
| **Linked requirements** | FR-20, FR-14, BR-09, BR-13, NFR-02, NFR-11, NFR-12, NFR-13 |
| **Depends on** | F-05 (pending queue), F-07 (checkout and return), F-08 (overdue), F-09 (item status) |
| **Sprint** | 3 |
| **Contract version** | 0.1 (draft, 2026-11-28). See [version history](#version-history). |

## 1. Behavior and workflow

1. A Custodian opens **Dashboard** (`/dashboard`) from the header. It shows five counts, each a card with a number, a
   label and a link to the screen that lists the items counted.
2. The client calls `GET /api/dashboard` once. The server counts, in one request, using "today" in `APP_TIMEZONE`.
3. A card is a link. Pressing it opens the list behind the number.

| Card | Counts | Opens |
|---|---|---|
| **Pending requests** | requests with status `PENDING` | `/requests?tab=pending` |
| **Checkouts due today** | `APPROVED` requests whose `startDate` is today | `/requests?tab=approved` |
| **Loans due today** | `CHECKED_OUT` requests whose `dueDate` is today | `/requests?tab=checked-out` |
| **Overdue loans** | `CHECKED_OUT` requests whose `dueDate` is before today (the F-08 rule) | `/overdue` |
| **Items in maintenance** | items whose status is `MAINTENANCE` (not `RETIRED`) | `/manage/items` |

The numbers are derived on every read and never stored. The login landing page of the Custodian stays `/requests`
(SDS §C3.1); the dashboard is one click away.

**Deep link.** `/requests` now reads the query parameter `tab` (`pending`, `approved`, `checked-out`, `all`) and opens
that tab. Without it, or with another value, it opens **Pending** as before. This is the only change to an existing
screen.

## 2. Rules, validation and failure cases

| Case | Result |
|---|---|
| A fresh seed | 200, all counts 0 except `itemsInMaintenance = 1` (CPE-0901) |
| An `APPROVED` request that starts tomorrow, or started yesterday and is still unchecked | Not in "checkouts due today" |
| A `CHECKED_OUT` request due today | In "loans due today" and **not** overdue |
| A `CHECKED_OUT` request due yesterday | In "overdue" and **not** in "loans due today" |
| `RETIRED` and `ACTIVE` items | Not in "items in maintenance" |
| Borrower | 403 `FORBIDDEN` (BR-13) |
| No or invalid token | 401 `UNAUTHENTICATED` |

Role is checked first. The endpoint takes no parameters and ignores any it receives.

## 3. Permissions

| Operation | Anonymous | Borrower | Custodian |
|---|---|---|---|
| `GET /api/dashboard` | 401 | 403 | ✅ |
| `/dashboard` page and header link | to `/login` | "You are not allowed to do this", no link | ✅ |

## 4. API

### `GET /api/dashboard` (Custodian)

200:
```json
{
  "date": "2026-11-15",
  "pendingRequests": 3,
  "checkoutsDueToday": 1,
  "loansDueToday": 2,
  "overdueLoans": 1,
  "itemsInMaintenance": 1
}
```
`date` is today in `APP_TIMEZONE`, so the page can say which day the numbers are for. All counts are non-negative
integers. Errors: 401, 403.

## 5. Data

Read-only, **no schema change**. Five counts over existing columns and indexes (`[status, createdAt]`,
`[itemId, status]`). The counts run in one transaction so they describe a single moment.

## 6. UI

- `/dashboard`, heading "Dashboard", and under it "Today, 15 Nov 2026" from `date`.
- Five cards in a grid: four columns on a wide screen, two on a tablet, one at 360 px (NFR-12). Each card is one
  link whose accessible name reads "Pending requests: 3". A count of 0 is shown as 0 and the card is still a link.
- Loading "Loading dashboard…". Error: the generic alert with **Retry**, and the header stays usable.
- The header gets a **Dashboard** link for the Custodian only.

## 7. Acceptance criteria

| AC | Given / When / Then |
|---|---|
| **AC-98** | **Given** a fixture with 3 `PENDING` requests, 1 `APPROVED` starting today, 2 `CHECKED_OUT` due today, 1 `CHECKED_OUT` due before today, and the seeded `MAINTENANCE` item (today 15 Nov), **when** a Custodian calls `GET /api/dashboard`, **then** 200 with `pendingRequests = 3`, `checkoutsDueToday = 1`, `loansDueToday = 2`, `overdueLoans = 1`, `itemsInMaintenance = 1` and `date = "2026-11-15"`. |
| **AC-99** | **Given** an `APPROVED` request starting 16 Nov, one that started 14 Nov, a `CHECKED_OUT` request due 15 Nov and one due 14 Nov, **then** only the one starting today counts as a checkout due today, and the one due 14 Nov is overdue but not due today. A `RETIRED` and an `ACTIVE` item are not in maintenance. |
| **AC-100** | **Given** the fresh seed, **then** all counts are 0 except `itemsInMaintenance = 1`. |
| **AC-101** | **Given** any fixture, **then** `pendingRequests` equals the length of `GET /api/requests?status=PENDING`, `overdueLoans` the length of `GET /api/requests?overdue=true`, `loansDueToday` the number of `CHECKED_OUT` requests due today, and `itemsInMaintenance` the number of items with status `MAINTENANCE` in `GET /api/items?includeRetired=true`. The numbers are the same as the lists they link to. |
| **AC-102** | **When** a Borrower calls it, **then** 403. No token → 401. Neither response contains a count. |
| **AC-103** | **UI:** the Custodian sees five cards with the counts and links to the targets in §1. A Borrower has no link and is not allowed on `/dashboard`. Loading and error states work. |
| **AC-104** | **Deep link:** `/requests?tab=approved` opens the Approved tab, `?tab=checked-out` the Checked out tab, and a missing or unknown `tab` the Pending tab. Choosing a tab by hand still works. |
| **AC-105** | **Journey (E2E):** a Custodian approves a request that starts today, opens the dashboard, sees "Checkouts due today" go up by one, follows the card and finds that request on the Approved tab. |

Tests: see [sts.md](sts.md) (TEST-117 to TEST-125).

## 8. Definition of Done

1. Every AC above is implemented, and a deviation is a new contract version.
2. Every STS test for F-13 exists, ran on the release commit and passes, with none skipped or weakened.
3. The overdue count uses the F-08 function, not a copy of the rule (AC-99, AC-101).
4. The role check is in the backend, and a test proves a Borrower gets no number (BR-13, NFR-02).
5. The five counts run in a fixed number of queries and are included in the NFR-11 check in SR-03.
6. The PR was reviewed by the other student and CI is green. The contract, STS and traceability match the code.

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-28 | Initial contract | Sprint 3 planning |
