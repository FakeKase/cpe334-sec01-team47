# F-02 — Equipment catalog

| | |
|---|---|
| **Linked requirements** | FR-04, FR-05, NFR-01 |
| **Depends on** | F-01 (auth), SR-01 (`Category`, `Item`, `BorrowRequest` tables, seed) |
| **Sprint** | 1 |
| **Contract version** | 0.1.1 (draft, 2026-11-12). See [version history](#version-history). |

## 1. Behavior and workflow

1. A signed-in user opens `/items`. The client loads `GET /api/categories` and `GET /api/items` in parallel.
2. The user picks a category in the filter. The client reloads `GET /api/items?categoryId=…`. Choosing
   "All categories" clears the filter.
3. The user opens an item, and the client loads `GET /api/items/:id`. A Borrower sees the request form from
   F-03 below the details. The form is disabled with an explanation if the item is not `ACTIVE`.

**Derived values (computed on the server):**
- `availableToday` = item `status = ACTIVE` **and** no `APPROVED`/`CHECKED_OUT` request with
  `startDate ≤ today ≤ dueDate` for this item.
- `committedPeriods` = requests for this item with status `APPROVED` or `CHECKED_OUT` and `dueDate ≥ today`,
  ordered by `startDate`.

> **Sprint 2 note.** These rules assume no request is overdue, which holds in Sprint 1 because checkout does
> not exist yet. When F-08 adds overdue loans, a `CHECKED_OUT` request with `dueDate < today` still occupies
> the item. Both derived values must then also count open overdue checkouts, or the item would show as free.
> That change is a new version of this contract in Sprint 2 (see [traceability.md §B2](../../traceability.md#b2-coverage-check)).

## 2. Rules, validation and failure cases

| Case | Result |
|---|---|
| `RETIRED` items | Never returned by `GET /api/items`. `GET /api/items/:id` of a retired item returns 404 in Sprint 1. |
| `MAINTENANCE` items | Listed with `status: "MAINTENANCE"` and `availableToday: false` |
| `categoryId` not a UUID | 400 `VALIDATION_ERROR` |
| `categoryId` valid but unknown | 200 with `[]` |
| `:id` not a UUID or no such item | 404 `NOT_FOUND` |
| No token | 401 (NFR-01). `GET /api/categories` is public (DD-09). |

## 3. Permissions

| Operation | Anonymous | Borrower | Custodian |
|---|---|---|---|
| `GET /api/categories` | ✅ | ✅ | ✅ |
| `GET /api/items`, `GET /api/items/:id` | 401 | ✅ | ✅ |
| See `borrower` inside `committedPeriods` | — | ❌ (field omitted) | ✅ |

## 4. API

### `GET /api/categories` (public)

200: `[ { "id": "uuid", "name": "Measurement instruments" }, … ]`, ordered by name.

### `GET /api/items?categoryId=<uuid>` (authenticated)

200, ordered by `name` then `assetTag`:
```json
[
  {
    "id": "uuid", "assetTag": "CPE-0201", "name": "Rigol DS1054Z oscilloscope",
    "status": "ACTIVE", "availableToday": true,
    "category": { "id": "uuid", "name": "Measurement instruments" }
  }
]
```

### `GET /api/items/:id` (authenticated)

200:
```json
{
  "id": "uuid", "assetTag": "CPE-0201", "name": "Rigol DS1054Z oscilloscope",
  "description": "4-channel 50 MHz", "location": "Cabinet B2",
  "status": "ACTIVE", "availableToday": true,
  "category": { "id": "uuid", "name": "Measurement instruments" },
  "committedPeriods": [
    { "startDate": "2026-11-20", "dueDate": "2026-11-22", "status": "APPROVED",
      "borrower": { "displayName": "Borrower Two" } }
  ]
}
```
`borrower` is present only when the caller is a Custodian. Errors: 401, 404.

## 5. Data

Read-only. Uses `Category`, `Item` and `BorrowRequest` from the SR-01 migration. **No schema change.** The
seed supplies 4 categories and 12 items (one `MAINTENANCE`, one `RETIRED`). Categories are always seeded,
because the Lab 5 smoke test requires a non-empty `/api/categories`.

## 6. UI

- `/items`: category `<select>` (label "Category"), then a list showing name, asset tag, category, a status
  badge ("Available today" / "Booked today" / "Under maintenance"), and a link to the detail page.
- Loading: "Loading items…". Empty: "No items in this category." Error: generic retry alert.
- `/items/:id`: details and a "Booked periods" list (empty: "No upcoming bookings.") and, for Borrowers, the
  F-03 form. For `MAINTENANCE` items, the form is disabled with "This item is under maintenance and cannot
  be requested."

## 7. Acceptance criteria

| AC | Given / When / Then |
|---|---|
| **AC-10** | **Given** the seed, **when** a signed-in user calls `GET /api/items`, **then** it returns 11 items (all except the retired one). Each has `assetTag`, `name`, `status`, `availableToday` and `category`. The `MAINTENANCE` item has `availableToday: false`. |
| **AC-11** | **When** `categoryId` is a seeded category, **then** only that category's items are returned. **When** it is an unknown UUID, **then** 200 `[]`. **When** it is not a UUID, **then** 400. |
| **AC-12** | **Given** item X with one future `APPROVED` request, one `PENDING` request and one past `RETURNED` request, `GET /api/items/X` returns only the `APPROVED` period in `committedPeriods`. For a Borrower the period has no `borrower` field. For a Custodian it includes `borrower.displayName`. An unknown id or a retired item → 404. |
| **AC-13** | `GET /api/categories` **without** a token returns 200 with the 4 seeded categories ordered by name. |
| **AC-14** | **UI:** the catalog shows a loading state, then the items. Selecting a category with no items shows "No items in this category." A `MAINTENANCE` item shows "Under maintenance", and its detail page has the request form disabled. |

Tests: see [sts.md](sts.md) (TEST-12 to TEST-16).

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-10 | Initial contract | Sprint 1 planning |
| 0.1.1 | 2026-11-12 | Added the Sprint 2 note on overdue checkouts. No Sprint 1 behavior change. | PR #3 review. |
