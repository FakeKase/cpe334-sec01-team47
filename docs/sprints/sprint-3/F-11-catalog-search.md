# F-11 — Catalog search and date availability

| | |
|---|---|
| **Linked requirements** | FR-18, BR-01, BR-02, BR-03, NFR-01, NFR-11, NFR-12, NFR-13 |
| **Depends on** | F-02 (catalog), F-08 (an overdue loan keeps its item booked) |
| **Sprint** | 3 |
| **Contract version** | 0.1 (draft, 2026-11-28). See [version history](#version-history). |

## 1. Behavior and workflow

1. A signed-in user opens **Catalog** (`/items`). Above the list there is a **Search** field, two date fields
   **Free from** and **Free to**, the existing **Category** filter, and a **Clear filters** button.
2. Typing in **Search** narrows the list to items whose **name or asset tag** contains the text, ignoring letter case
   (`"uno"` finds "Arduino Uno R3", `"cpe-02"` finds CPE-0201 to CPE-0203). The client waits 300 ms after the last
   key before it calls the API.
3. Choosing both dates narrows the list to items that are **free for that whole period**, so the user can see what
   they can actually request. Choosing only one date shows an error under the other field.
4. The three filters combine: an item must match all of them. The URL holds the filters
   (`/items?q=uno&from=2026-12-01&to=2026-12-03&category=<uuid>`), so Back, reload and a shared link show the same list.
5. The client calls `GET /api/items?q=&freeFrom=&freeTo=&categoryId=`. The server answers with the same item list as
   F-02, filtered. There is no new resource.

**What "free" means.** An item is free for the period `[freeFrom, freeTo]` when all of these hold:
- its status is `ACTIVE` (BR-02), so an item under maintenance is never free;
- no `APPROVED` or `CHECKED_OUT` request of that item overlaps the period (BR-03). Both ends are inclusive: a
  booking on 22–24 Nov overlaps a search for 20–22 Nov. `PENDING`, `REJECTED`, `CANCELLED` and `RETURNED`
  requests do not block;
- a `CHECKED_OUT` loan that is overdue holds the item until it is returned: its end counts as today, as in
  [F-08](../sprint-2/F-08-overdue-tracking.md) (`effectiveEnd`). The server must reuse the same functions as the
  request rules, so the filter and BR-03 can never disagree.

## 2. Rules, validation and failure cases

| Case | Result |
|---|---|
| `q` empty, missing or only spaces | No keyword filter |
| `q` after trimming | Matches `name` or `assetTag` as a case-insensitive substring. `%`, `_` and `\` are plain characters. |
| `q` longer than 100 characters | 400 `VALIDATION_ERROR`, field `q`, "Search can be at most 100 characters." |
| `freeFrom` without `freeTo`, or the reverse | 400 `VALIDATION_ERROR`, field `freeFrom` or `freeTo`, "Choose both dates." |
| A date that is not `YYYY-MM-DD` | 400 `VALIDATION_ERROR`, same field |
| `freeFrom` before today (BR-01) | 400, field `freeFrom`, "Start date cannot be in the past." |
| `freeTo` before `freeFrom` | 400, field `freeTo`, "Due date must be on or after the start date." |
| A period longer than 14 days (BR-01) | 400, field `freeTo`, "A loan can be at most 14 days." |
| `categoryId` not a UUID | 400 (unchanged from F-02) |
| No item matches | 200 `[]` |
| `RETIRED` items | Never in a free-period result. Without the date filter they behave as in F-09 (`includeRetired`, Custodian only). |
| No token | 401 `UNAUTHENTICATED` |

The date rules are exactly the loan-period rules of F-03 (`validateLoanPeriod`), so the filter only answers questions a
request could also ask. The order of the list is unchanged: name, then asset tag.

## 3. Permissions

Same for both roles: any signed-in user. A Borrower and a Custodian get the same list for the same filters. A
Custodian's `includeRetired=true` still works without the date filter and never adds retired items to a free result.

## 4. API

### `GET /api/items?q=<text>&freeFrom=<date>&freeTo=<date>&categoryId=<uuid>` (authenticated)

All four parameters are optional and combine with AND. 200: the item list of
[F-02 §4](../sprint-1/F-02-catalog.md#4-api), unchanged in shape (`id`, `assetTag`, `name`, `status`,
`availableToday`, `category`). Errors: 400 as in §2, 401.

The server answers with a **fixed number of queries**, not one per item: one for the items and one for the
`APPROVED` and `CHECKED_OUT` requests in the period (NFR-11, measured in [SR-03](SR-03-product-hardening.md)).

## 5. Data

Read-only, and **no schema change**. Existing indexes (`[itemId, status]` on `BorrowRequest`) serve the overlap
query. A trigram index for `q` is not added: the keyword search is a substring match over at most a few thousand
rows, and SR-03 measures it against NFR-11. If it fails that measurement, a `pg_trgm` index is the planned fix and
becomes a new contract version.

## 6. UI

- **Search** (label "Search", `type="search"`), **Free from** and **Free to** (`type="date"`, `min` = today), the
  **Category** select, and **Clear filters** (secondary, shown only while a filter is set).
- Under the filters a status line: "11 items" (singular "1 item"). With a period chosen: "6 items free from 1 Dec to 3
  Dec 2026".
- Field errors appear under the fields. A server 400 is mapped onto the same fields.
- Loading "Loading items…". Empty: "No items match your search." with **Clear filters**. Error: the generic alert with
  **Retry**.
- A free-period result does not show "Available today": that badge describes today, not the chosen period. Each row
  shows its status as before.
- At 360 px the filters stack in one column with no horizontal scrolling (NFR-12). Every field has a label and a
  keyboard path (NFR-13).

## 7. Acceptance criteria

| AC | Given / When / Then |
|---|---|
| **AC-84** | **Given** the seed, **when** `q = "uno"`, **then** both Arduino Uno R3 items are returned. `q = "CPE-02"` returns CPE-0201, CPE-0202 and CPE-0203. `q = "  ESP  "` returns the ESP32 DevKit. `q = "zzz"` returns `[]`. `q = ""` and `q = "   "` return the full list. `q = "%"` returns `[]`, not everything. |
| **AC-85** | **When** `q`, `categoryId` and a free period are all given, **then** only items that match all three are returned, in the usual name and tag order. |
| **AC-86** | **Given** item X with an `APPROVED` booking on 20–22 Nov (today 15 Nov), **when** the free period is 22–24 Nov, **then** X is not returned (inclusive end). For 23–25 Nov, X is returned. A `PENDING`, `REJECTED`, `CANCELLED` or `RETURNED` request on the same dates does not remove X. A `CHECKED_OUT` request does. |
| **AC-87** | **Given** a `CHECKED_OUT` loan on X with due date 10 Nov (overdue, today 15 Nov), **when** the free period is 16–17 Nov, **then** X is not returned, because it is held until returned. After the loan is returned, X is returned. |
| **AC-88** | **Given** the `MAINTENANCE` item CPE-0901 and the `RETIRED` item CPE-0999, **when** any free period is chosen, **then** neither is returned. A Custodian's `includeRetired=true` together with a free period does not add CPE-0999. |
| **AC-89** | **When** only one date is given, a date is malformed, `freeFrom` is before today, `freeTo` is before `freeFrom`, the period is 15 days, or `q` has 101 characters, **then** 400 `VALIDATION_ERROR` naming the field from §2. A 14-day period and a 100-character `q` are accepted. |
| **AC-90** | **When** a request carries no token, **then** 401. **When** a Borrower and a Custodian send the same filters, **then** the two responses are equal. |
| **AC-91** | **UI:** typing in Search, choosing both dates, or choosing a category changes the list and the URL. A reload or Back shows the same list. A single date shows "Choose both dates." under the other field and sends no request. **Clear filters** resets all of them. A result with no item shows "No items match your search." |

Tests: see [sts.md](sts.md) (TEST-102 to TEST-110).

## 8. Definition of Done

1. Every AC above is implemented, and a deviation is a new contract version.
2. Every STS test for F-11 exists, ran on the release commit and passes, with none skipped or weakened.
3. The overlap and overdue rules come from the same functions that BR-03 and F-08 use. A test proves the free filter
   and the request rules give the same answer for the same data (AC-86, AC-87).
4. The API tests ran against the real database, and the UI tests cover the states in §6.
5. The NFR-11 check in SR-03 includes this endpoint with the filters on.
6. The PR was reviewed by the other student and CI is green. The contract, STS and traceability match the code.

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-28 | Initial contract | Sprint 3 planning |
