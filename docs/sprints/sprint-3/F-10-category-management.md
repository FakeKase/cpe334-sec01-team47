# F-10 — Category management

| | |
|---|---|
| **Linked requirements** | FR-17, BR-13, NFR-02, NFR-12, NFR-13 |
| **Depends on** | F-09 (inventory management, the Custodian area), F-02 (`GET /api/categories`) |
| **Sprint** | 3 |
| **Contract version** | 0.1 (draft, 2026-11-28). See [version history](#version-history). |

## 1. Behavior and workflow

1. A Custodian opens **Categories** (`/manage/categories`) from the header. The page lists every category
   by name, ordered by name.
2. To add one, the Custodian types a name and presses **Add category**. The client calls
   `POST /api/categories`. On 201 the new category appears in the list and a toast says "Category added".
3. To rename one, the Custodian presses **Rename** on its row. The row turns into a field with **Save** and
   **Cancel**. **Save** calls `PATCH /api/categories/:id`. On 200 the row shows the new name and a toast says
   "Category renamed".
4. The server, for both calls:
   1. trims the name and checks its length (§2);
   2. checks that no **other** category already has this name, ignoring upper and lower case (BR-12 does the same
      for asset tags);
   3. writes the row. A unique index on `lower("name")` is the last line of defence: when two calls race, one wins
      and the other gets the same 409 as in step 2.

A category is linked to its items by id, not by name. A rename therefore changes how every item of that category
is shown (catalog filter, item pages, item list), and no item changes.

There is no delete. FR-17 asks for create and rename only, and a category with items cannot disappear without
moving the items first (no such feature exists).

## 2. Rules, validation and failure cases

| Case | Result |
|---|---|
| Valid new name | 201 `{ id, name }` with the trimmed name |
| Valid rename | 200 `{ id, name }`, same `id` |
| Rename to the category's own current name, or to the same name in other letter case | 200. A category never conflicts with itself. |
| Name already used by **another** category, in any letter case (`"audio-visual"`, `" AUDIO-VISUAL "`) | 409 `DUPLICATE_CATEGORY_NAME` "A category with this name already exists." with `details: [{ field: "name", … }]`. Nothing changes. |
| Name missing, empty, or only spaces | 400 `VALIDATION_ERROR`, field `name`, "Name is required." |
| Name longer than 60 characters after trimming | 400 `VALIDATION_ERROR`, field `name`, "Name can be at most 60 characters." |
| Name of exactly 60 characters | Accepted |
| Two creates (or renames) with the same name at the same moment | Exactly one succeeds. The other is 409 `DUPLICATE_CATEGORY_NAME`. There is one row. |
| `PATCH` with an unknown or malformed id | 404 `NOT_FOUND` |
| Borrower, on either endpoint | 403 `FORBIDDEN`. The role check runs before body validation, so an invalid body is still 403. Nothing changes (BR-13). |
| No or invalid token, on either endpoint | 401 `UNAUTHENTICATED` |

Unknown keys in the body are ignored. `GET /api/categories` stays public (DD-09) and unchanged.

## 3. Permissions

| Operation | Anonymous | Borrower | Custodian |
|---|---|---|---|
| `GET /api/categories` | ✅ | ✅ | ✅ |
| `POST /api/categories` | 401 | 403 | ✅ |
| `PATCH /api/categories/:id` | 401 | 403 | ✅ |

## 4. API

### `POST /api/categories` (Custodian)

Body: `{ "name": string }`. 201: `{ "id": "uuid", "name": "Test equipment" }`.
Errors: 400, 401, 403, 409 `DUPLICATE_CATEGORY_NAME`.

### `PATCH /api/categories/:id` (Custodian)

Body: `{ "name": string }` (required). 200: `{ "id": "uuid", "name": "Lab equipment" }`.
Errors: 400, 401, 403, 404, 409 `DUPLICATE_CATEGORY_NAME`.

`GET /api/categories` is unchanged ([F-02 §4](../sprint-1/F-02-catalog.md#4-api)): `[ { "id", "name" }, … ]`
ordered by name.

## 5. Data

No new table or column. An **additive** migration (`20261128000000_add_category_name_lower_unique`) creates the
unique index `Category_name_lower_key ON "Category" (lower("name"))`. It is hand-written SQL, as the `CHECK`
constraint in the init migration is, because Prisma cannot express it. The existing `UNIQUE ("name")` stays. The
seed has four names that differ even in lower case, so the migration succeeds on every existing database. Dropping
the index is the rollback.

## 6. UI

`/manage/categories` (Custodian only; a Borrower gets the "You are not allowed to do this" page). The header shows
a **Categories** link for a Custodian, next to **Inventory**, and for nobody else.

- Heading "Categories". Under it, a form with the labelled field **Name** (maximum 60 characters) and the primary
  button **Add category**. The button is disabled while the call runs.
- The list shows one row per category: the name and a secondary **Rename** button. Its accessible name includes
  the category ("Rename Audio-visual").
- **Rename** turns that row into a field labelled "Category name", filled with the current name and focused, with
  **Save** and **Cancel**. Only one row is edited at a time. **Cancel** and **Esc** restore the row with no call.
- A 400 or 409 shows the server's message under the field (it is mapped from `details`) and keeps what the user
  typed. A network or 5xx error shows an alert with the generic message.
- Loading "Loading categories…". Empty "No categories yet." Load error: the generic alert with **Retry**.
- It works at 360 px without horizontal scrolling (NFR-12). Every control has a label, a visible focus and a
  keyboard path (NFR-13).

## 7. Acceptance criteria

| AC | Given / When / Then |
|---|---|
| **AC-77** | **Given** a Custodian, **when** they `POST /api/categories` with `{ "name": "  Test equipment  " }`, **then** 201 with `name = "Test equipment"` (trimmed). The DB row matches, and `GET /api/categories` (without a token) lists it in name order. |
| **AC-78** | **Given** a category X with items, **when** a Custodian renames it, **then** 200 with the same `id` and the new name. `GET /api/items` and `GET /api/items/:id` show the new category name on the items of X, and no item row changes. Renaming X to its own name, or to its name in other letter case, gives 200. |
| **AC-79** | **When** a Custodian creates or renames a category to a name that another category already has, in any letter case, **then** 409 `DUPLICATE_CATEGORY_NAME` with the field `name`, and nothing changes. **When** two creates with the same new name are sent at the same moment, **then** one is 201, the other 409, and the table has one row with that name. |
| **AC-80** | **When** the name is missing, empty or only spaces, **then** 400 `VALIDATION_ERROR` naming `name` and no row is created. A name of 61 characters → 400. A name of 60 characters → accepted. |
| **AC-81** | **When** a Borrower calls `POST` or `PATCH`, **then** 403 and nothing changes (also with an invalid body). No token → 401. `PATCH` with an unknown or malformed id → 404. `GET /api/categories` without a token → 200. |
| **AC-82** | **UI:** the Custodian sees the categories, adds one (the row appears and the toast shows) and renames one inline. A server error appears under the field, with the typed text kept. **Cancel** sends nothing. A Borrower opening `/manage/categories` sees "You are not allowed to do this" and has no **Categories** link. |
| **AC-83** | **Journey (E2E):** a Custodian adds a category, renames it, and the catalog's category filter then lists the new name and no longer the old one. |

Tests: see [sts.md](sts.md) (TEST-94 to TEST-101).

## 8. Definition of Done

F-10 is done when all of these hold, with evidence:

1. Every AC above is implemented. A deviation is recorded as a new contract version.
2. Every STS test for F-10 exists, was run on the release commit and passes. None is skipped or weakened.
3. The API tests ran against the real database (including the unique index), and the UI tests cover the states in §6.
4. A Borrower cannot reach the operation, and the backend (not the UI) refuses it (BR-13, NFR-02).
5. The migration is additive and was applied from an empty database and to a seeded one.
6. The PR was reviewed by the other student, CI is green and it was integrated through `staging`.
7. The contract, the STS and the traceability matrix match the code. Anything not done is listed as a known limitation.

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-28 | Initial contract | Sprint 3 planning |
