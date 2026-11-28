# Sprint 3 — Software Test Specification (STS)

**Document version:** 0.1 (draft, 2026-11-28)
Covers the Sprint 3 acceptance criteria written so far. It grows as the other Sprint 3 contracts are added.
Levels, tools and common preconditions (test database, fixed clock **today = 2026-11-15**, `loginAs`) are the
same as in the [Sprint 1 STS §1](../sprint-1/sts.md#1-test-levels-tools-and-environment).

## F-10 Category management

Contract: [F-10](F-10-category-management.md). Files: `server/test/api/categories.test.ts`,
`client/src/pages/ManageCategories.test.tsx`, `e2e/categories.spec.ts`.

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-94 | AC-77 | API | Seed (4 categories). Custodian token | `POST /api/categories` with `{ name: "  Test equipment  " }`, then `GET /api/categories` with no token | 201, `name = "Test equipment"`. DB: one new row with that name. The list has 5 categories in name order and includes the new one. |
| TEST-95 | AC-78 | API | Category "Measurement instruments" with items | Custodian `PATCH` it to "Lab instruments"; then `GET /api/items` and an item's `GET /api/items/:id`; then rename it to "LAB INSTRUMENTS" and to "LAB INSTRUMENTS" again | 200, same `id`, new name. The items show "Lab instruments", and each item row has the same `categoryId`. The two renames to its own name in other case or the same case → 200. |
| TEST-96 | AC-79 | API | Seed. Custodian token | Create `"audio-visual"`, `" AUDIO-VISUAL "`, `"Audio-visual"`. Rename "Microcontrollers" to `"AUDIO-visual"` (`it.each` for the variants) | 409 `DUPLICATE_CATEGORY_NAME` with a detail on `name` in each case. The table and the names are unchanged. |
| TEST-97 | AC-79 | API | Seed | `Promise.all` of two `POST` with `{ name: "Cables" }` | One 201 and one 409 `DUPLICATE_CATEGORY_NAME`. DB: one "Cables" row. |
| TEST-98 | AC-80 | API | Custodian token | `POST` with `{}`, `{ name: "" }`, `{ name: "   " }`, a 61-character name. Then a 60-character name. `PATCH` with `{ name: "" }` | 400 `VALIDATION_ERROR` naming `name` four times, with no row created. 201 for the 60 characters. `PATCH` 400, unchanged. |
| TEST-99 | AC-81 | API | A category C. Borrower token | Borrower `POST` and `PATCH` (valid body, and `{}`). No token on both. Custodian `PATCH` with an unknown uuid and with `abc`. `GET /api/categories` with no token | 403, 403, 403, 403. 401, 401. 404, 404. 200. The names are unchanged. |
| TEST-100 | AC-82 | Component | MSW: `/api/categories` list; `POST` and `PATCH` returning the resource, and a 409 case. A Custodian session; then a Borrower session | Render `/manage/categories`. Add a category. Rename one and press **Cancel**. Rename again with the 409 response. Open it as a Borrower | The list is shown. The added row appears and the toast "Category added" shows. **Cancel** sends nothing. The 409 message is under the field and the typed text is kept. The Borrower sees "You are not allowed to do this" and the header has no **Categories** link. |
| TEST-101 | AC-83 | E2E | Seeded app | Custodian: open Categories, add "E2E category", rename it to "E2E renamed", open the catalog | The toasts show. The catalog's category filter lists "E2E renamed" and not "E2E category". |

## F-11 Catalog search and date availability

Contract: [F-11](F-11-catalog-search.md). Files: `server/test/api/search.test.ts`, `client/src/pages/Catalog.test.tsx`,
`e2e/search.spec.ts`.

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-102 | AC-84 | API | Seed. Borrower token | `GET /api/items?q=` with `uno`, `CPE-02`, `"  ESP  "`, `zzz`, empty, `"   "`, `%` | Both Arduino Uno R3. CPE-0201 to CPE-0203. The ESP32 DevKit. `[]`. The full 11-item list (twice). `[]` (not everything). |
| TEST-103 | AC-85 | API | Seed | `?q=oscilloscope&categoryId=<Measurement>`, then the same with a free period that excludes one match | Only items matching all given filters, in name and tag order. |
| TEST-104 | AC-86 | API | Item X with `APPROVED` 20–22 Nov (today 15 Nov), plus `PENDING`, `REJECTED`, `CANCELLED`, `RETURNED` and a `CHECKED_OUT` request on other items for the same dates | `?freeFrom=2026-11-22&freeTo=2026-11-24`, then 23–25 Nov, then 20–21 Nov | X is absent for 22–24 and for 20–21, present for 23–25. Items with only a non-blocking request on those dates are present. The item with a `CHECKED_OUT` request is absent. |
| TEST-105 | AC-87 | API | `CHECKED_OUT` loan on X with due date 10 Nov (today 15 Nov) | `?freeFrom=2026-11-16&freeTo=2026-11-17`. Return it (F-07), repeat | X absent, then present. |
| TEST-106 | AC-88 | API | Seed (CPE-0901 `MAINTENANCE`, CPE-0999 `RETIRED`). Custodian token | Any free period, and the same with `includeRetired=true` | Neither item is returned in either case. |
| TEST-107 | AC-89 | API | Borrower token | `freeFrom` only, `freeTo` only, `freeFrom=abc&freeTo=abc`, `freeFrom=2026-11-14` (past), `freeTo` before `freeFrom`, a 15-day period, `q` of 101 characters. Then a 14-day period and `q` of 100 characters | 400 `VALIDATION_ERROR` naming `freeFrom`, `freeTo`, `freeFrom`, `freeFrom`, `freeTo`, `freeTo`, `q`. 200 for the two valid ones. |
| TEST-108 | AC-90 | API | Fixture with bookings | No token. Then the same filters as Borrower and as Custodian | 401. The two bodies are equal. |
| TEST-109 | AC-91 | Component | MSW: `/api/items` answers by query | Type in Search, choose both dates, choose a category, press **Clear filters**. Choose only one date. Reload at the URL | The list and the URL change each time. A reload shows the same list. One date shows "Choose both dates." and sends no request. Clear resets everything. No match shows "No items match your search." |
| TEST-110 | AC-91 | E2E | Seeded app | Borrower: search `uno`, then pick free dates | Only the two Arduino items. The URL has the filters. A reload keeps them. |

## F-12 Item loan history

Contract: [F-12](F-12-item-history.md). Files: `server/test/api/history.test.ts`, `client/src/pages/ItemDetail.test.tsx`,
`e2e/history.spec.ts`.

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-111 | AC-92 | API | Item X with `RETURNED` (checked out 1 Nov), `CHECKED_OUT` (9 Nov), `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, and a loan on item Y | Custodian: `GET /api/items/X/history` | Two entries, the 9 Nov one first. No entry for the other statuses or for Y. |
| TEST-112 | AC-93 | API | A `DAMAGED` return with a note, a `GOOD` return, a `CHECKED_OUT` loan due 10 Nov (today 15 Nov) | Read the history | Each entry has `borrower`, `checkedOutBy`, `checkedOutAt`, `returnedTo`, `returnedAt`, `returnCondition`, `returnNote` as stored. `overdue` is true only for the last. |
| TEST-113 | AC-94 | API | An item with no loan. A `RETIRED` item with one loan | Read both. Then an unknown uuid and `abc` | `[]` with 200. The loan with 200. 404 and 404. |
| TEST-114 | AC-95 | API | Item with a loan | Borrower reads it, and with a malformed id. No token | 403 with no loan data. 403. 401. |
| TEST-115 | AC-96 | Component | MSW: history with loans, an empty one, an error. A Custodian, then a Borrower | Open `/items/:id` | The section, rows and badges. "This item has never been lent." Retry on error with the item still shown. The Borrower sees no section and no history request is made. |
| TEST-116 | AC-97 | E2E | Seeded app. A request for CPE-0202 starting today, approved through the API | Custodian: check out, return as **Damaged** with a note, open the item | The loan is first in "Loan history" with **Damaged** and the note. |

## F-13 Custodian dashboard

Contract: [F-13](F-13-custodian-dashboard.md). Files: `server/test/api/dashboard.test.ts`,
`client/src/pages/Dashboard.test.tsx`, `client/src/pages/Requests.test.tsx`, `e2e/dashboard.spec.ts`.

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-117 | AC-98 | API | 3 `PENDING`, 1 `APPROVED` starting 15 Nov, 2 `CHECKED_OUT` due 15 Nov, 1 `CHECKED_OUT` due 14 Nov, seeded `MAINTENANCE` item (today 15 Nov) | Custodian: `GET /api/dashboard` | `pendingRequests 3`, `checkoutsDueToday 1`, `loansDueToday 2`, `overdueLoans 1`, `itemsInMaintenance 1`, `date "2026-11-15"`. |
| TEST-118 | AC-99 | API | `APPROVED` starting 16 Nov and 14 Nov. `CHECKED_OUT` due 15 Nov and 14 Nov. A `RETIRED` and an `ACTIVE` item | Read the dashboard | Checkouts due today 0 (neither starts today). Loans due today 1. Overdue 1. Maintenance 1 (only the seeded one). |
| TEST-119 | AC-100 | API | Fresh seed | Read the dashboard | All 0, except `itemsInMaintenance 1`. |
| TEST-120 | AC-101 | API | A mixed fixture | Read the dashboard and the lists | `pendingRequests` equals `GET /api/requests?status=PENDING`. `overdueLoans` equals `?overdue=true`. `loansDueToday` equals the `CHECKED_OUT` requests due today. `itemsInMaintenance` equals the `MAINTENANCE` items. |
| TEST-121 | AC-102 | API | Fixture | Borrower. No token | 403 and no count. 401. |
| TEST-122 | AC-103 | Component | MSW: `/api/dashboard` | Render `/dashboard` as a Custodian | Five cards with their numbers, each a link to its target in §1. Loading and error with Retry. |
| TEST-123 | AC-103 | Component | A Borrower session | Open `/dashboard` | "You are not allowed to do this", no **Dashboard** link, no request to the API. |
| TEST-124 | AC-104 | Component | MSW: requests by status | Render `/requests?tab=approved`, `?tab=checked-out`, `/requests`, `?tab=zzz` | The Approved tab, the Checked out tab, Pending, Pending. Choosing a tab by hand still works. |
| TEST-125 | AC-105 | E2E | Seeded app. A pending request starting today | Custodian: note the card, approve the request, open the dashboard, follow the card | "Checkouts due today" is one higher. The card opens the Approved tab, which shows that request. |

## F-14 Loan report export

Contract: [F-14](F-14-loan-report.md). Files: `server/test/unit/csv.test.ts`, `server/test/api/report.test.ts`,
`client/src/pages/Reports.test.tsx`, `e2e/report.spec.ts`.

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-126 | AC-108, AC-109 | Unit | Strings with a comma, a double quote, CR, LF, Thai text, empty, `null`, and `=1+1`, `+cmd`, `-2`, `@SUM(A1)`, `plain` | The CSV writer on a row | Quoted fields have their quotes doubled. Thai text is unchanged. `null` is empty. The four starters get a leading `'`. `plain` is unchanged. Rows end with CRLF. |
| TEST-127 | AC-106 | API | One request in each of the six statuses, with all fields set | Custodian: the report for a range that holds them all | 200, `text/csv`, the byte order mark, the 21 header names in order, six rows equal to the stored values, in `startDate`, `createdAt`, `requestId` order. A range with none returns the header only. |
| TEST-128 | AC-107 | API | Requests 18–20, 22–24, 21–21, 17–19, 23–25 and 10–30 Nov | The report for 20–22 Nov | Included: 18–20, 22–24, 21–21 and 10–30. Not included: 17–19 and 23–25. |
| TEST-129 | AC-108 | API | A purpose with a comma, a quote and a line break; a Thai purpose | Download, parse with a CSV reader | The reader returns the stored text. Every row has 21 columns. |
| TEST-130 | AC-109 | API | Purposes `=1+1`, `+cmd`, `-2`, `@SUM(A1)` and a normal one | Download and parse | The first four begin with `'`. The normal one is unchanged. |
| TEST-131 | AC-110 | API | Custodian token | `from` missing, `to` missing, `from=abc`, `to` before `from`, a 367-day range. Then exactly 366 days | 400 `VALIDATION_ERROR` naming `from`, `to`, `from`, `to`, `to` with JSON bodies. 200 for 366. |
| TEST-132 | AC-111 | API | Fixture | Borrower. No token | 403 with no row and a JSON body. 401. |
| TEST-133 | AC-112 | Component | MSW: the endpoint returns a CSV, then a 400 | Choose dates, press **Download CSV**, then the error case. A Borrower opens `/reports` | One request with `from` and `to`, the button disabled meanwhile, a file offered, "Report downloaded". The error shows its message and keeps the dates. The Borrower is not allowed and has no link. |
| TEST-134 | AC-113 | E2E | Seeded app. A request with a known purpose, made through the API | Custodian: open Reports, choose a range that holds it, download | The saved file contains the asset tag and the purpose. |

## SR-03 Product hardening

Contract: [SR-03](SR-03-product-hardening.md). Files: `server/scripts/perf-seed.ts`, `server/scripts/perf.ts`,
`e2e/hardening.spec.ts`, `server/test/api/doubleBooking.test.ts` (optional), `server/test/api/throttle.test.ts` and
`server/test/api/health.test.ts` (proposed).

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-135 | AC-114 | Script | Database `inventory_perf` with 500 items and 5,000 requests | `bun run perf` | A table of median, p95 and maximum per endpoint. `GET /api/items` and `GET /api/requests` have a p95 under 500 ms and the command exits with 0. |
| TEST-136 | AC-115 | E2E | Each screen of §2.2 with data, 360 × 640 | Open each, read `scrollWidth` and the size of every control | `scrollWidth` at most `innerWidth`. No control under 44 px high. |
| TEST-137 | AC-116 | E2E | The same screens, light then dark | Run axe-core (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) | No `serious` or `critical` violation. Lesser ones are listed. |
| TEST-138 | AC-117 | E2E | Seeded app | Three keyboard-only journeys (§2.2) | Each completes. Focus is visible. **Esc** closes the reject dialog and focus returns to **Reject**. |
| TEST-139 | AC-118 | API (optional) | The migration applied | Insert two overlapping `APPROVED` rows with SQL. Two concurrent approvals through the API. Touching, `PENDING` and other-item rows | The database refuses the second row (`23P01`). One 200 and one 409. The others are accepted. |
| TEST-140 | AC-119 | API (proposed) | Borrower 1 | 5 wrong passwords, then the right one. A different email. Advance the clock 15 minutes. 4 wrong then the right one | 429 `TOO_MANY_ATTEMPTS` with no session. The other email logs in. The right password works after the window. 4 wrong then right logs in. |
| TEST-141 | AC-120 | API (proposed) | App started with `GIT_COMMIT` set, then unset | `GET /api/health` | `commit` equals the value, then `"unknown"`. |
