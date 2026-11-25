# F-09 — Inventory management

| | |
|---|---|
| **Linked requirements** | FR-15, FR-16, BR-02 (maintenance), BR-11, BR-12, BR-13, NFR-02, NFR-05, NFR-12, NFR-13 |
| **Depends on** | F-02 (catalog resources), F-05 (approve locks the item row) |
| **Sprint** | 2 |
| **Contract version** | 0.2 (draft, 2026-11-25). See [version history](#version-history). |

## 1. Behavior and workflow

### Create and edit (FR-15)

1. A Custodian opens `/manage/items` (header link **Inventory**, or **Add item** on the catalog) and presses
   **Add item**, which opens `/manage/items/new`.
2. The form has **Asset tag**, **Name**, **Category** (from `GET /api/categories`), **Location** and
   **Description**. The client checks the required fields and the BR-12 format before sending.
3. The client calls `POST /api/items`. On 201 it goes to `/manage/items` and a toast says "Item created".
4. To edit, the Custodian presses **Edit** on the item detail page (`/items/:id`) or on a `/manage/items` row,
   which opens `/manage/items/:id`. The form is prefilled from `GET /api/items/:id`. **Save changes** sends
   `PATCH /api/items/:id` with only the fields that changed, so it does not overwrite another Custodian's edit
   to a field this one did not touch. On 200 the form shows the saved values and a toast says "Changes saved".

The asset tag is trimmed and upper-cased before it is checked and stored, so `cpe-0042` is stored as `CPE-0042`
and uniqueness is case-insensitive (BR-12). The unique index on `Item.assetTag` is the last line of defence: a
create or edit that loses a race on the same tag gets the same 409 as the ordinary duplicate.

### Status (FR-16, BR-11)

The edit page has a **Status** section showing the current status and the actions allowed from it:

| From | Actions |
|---|---|
| `ACTIVE` | **Set to maintenance**, **Retire item** |
| `MAINTENANCE` | **Set active**, **Retire item** |
| `RETIRED` | none (retirement is final) |

Each action calls `POST /api/items/:id/status` with `{ "status": … }`. **Retire item** first opens a confirm
dialog: "Retiring is permanent. Pending requests for this item will be rejected with the reason "Item
retired"." with **Keep item** and **Retire item**.

The server changes the status in one transaction that first locks the item row
(`SELECT … FROM "Item" WHERE id = $1 FOR UPDATE`), the same lock that create-request and approve take. So a
retirement and an approval of the same item never interleave (NFR-05).

- **To `MAINTENANCE`:** existing `APPROVED` and `CHECKED_OUT` loans are untouched (SRS Q-03). New requests and
  approvals are refused with `ITEM_NOT_AVAILABLE` (BR-02, already enforced by F-03 and F-05).
- **To `ACTIVE`:** requests and approvals are allowed again.
- **To `RETIRED`:** refused with 409 `ITEM_IN_USE` while the item has an `APPROVED` or `CHECKED_OUT` request,
  whatever its dates. Otherwise every `PENDING` request of the item becomes `REJECTED` with
  `rejectionReason = "Item retired"`, `decidedById` = the Custodian and `decidedAt` = now, in the same
  transaction. Other requests are untouched.
- A retired item cannot be edited or change status again (409 `INVALID_TRANSITION`). Setting the status the
  item already has is a no-op 200.

### Retired items in the views

- `GET /api/items` keeps hiding retired items. A Custodian can add `includeRetired=true` to list them too.
  A Borrower's `includeRetired` is ignored. The value must be `true` or `false`; anything else is a 400.
- `GET /api/items/:id` returns a retired item to a Custodian (status `RETIRED`, `availableToday: false`). For a
  Borrower it is still 404 (F-02 v0.2).
- `/manage/items` lists every item including retired ones, each with its status badge ("Retired" for retired
  items) and an **Edit** link. `/items` (the catalog) is unchanged and never shows retired items.

## 2. Rules, validation and failure cases

Field rules (create and edit). Strings are trimmed first. An empty or missing optional field is stored as `null`.

| Field | Rule | Message |
|---|---|---|
| `assetTag` | Required. Upper-cased, then matches `^[A-Z]{2,5}-\d{3,5}$` (BR-12) | "Asset tag must look like CPE-0042: 2 to 5 letters, a hyphen and 3 to 5 digits." |
| `name` | Required, 1–100 characters | "Name is required." / "Name can be at most 100 characters." |
| `categoryId` | Required, an existing category | "Choose a category." |
| `location` | Optional, at most 100 characters | "Location can be at most 100 characters." |
| `description` | Optional, at most 1000 characters | "Description can be at most 1000 characters." |

| Case | Result |
|---|---|
| Valid create | 201, `status = ACTIVE` (a `status` in the body is ignored) |
| A field rule fails | 400 `VALIDATION_ERROR`, `details` names the field. Nothing is written. |
| `categoryId` is a UUID but no such category | 400 `VALIDATION_ERROR` on `categoryId` |
| Asset tag used by another item, any case | 409 `DUPLICATE_ASSET_TAG` "This asset tag is already in use.", `details: [{ field: "assetTag", … }]`. Nothing is written. |
| Edit keeps the item's own tag (any case) | 200 |
| Edit or status change of a `RETIRED` item | 409 `INVALID_TRANSITION` "Retired items cannot be changed." |
| Retire with an `APPROVED` or `CHECKED_OUT` request | 409 `ITEM_IN_USE` "This item has approved or checked-out loans, so it cannot be retired." Item and requests unchanged. |
| `status` not one of `ACTIVE`, `MAINTENANCE`, `RETIRED` | 400 `VALIDATION_ERROR` on `status` |
| Borrower | 403 `FORBIDDEN`, nothing written (BR-13) |
| Unknown or malformed `:id` | 404 `NOT_FOUND` |
| No or invalid token | 401 `UNAUTHENTICATED` |

## 3. Permissions

| Operation | Anonymous | Borrower | Custodian |
|---|---|---|---|
| `POST /api/items`, `PATCH /api/items/:id`, `POST /api/items/:id/status` | 401 | 403 | ✅ |
| `GET /api/items?includeRetired=true` | 401 | ✅ (flag ignored) | ✅ (includes retired) |
| `GET /api/items/:id` of a retired item | 401 | 404 | ✅ |

The role is checked before the body is validated, so a Borrower gets 403 and never a 400 with field names.

## 4. API

The item resource returned by all three endpoints is the Custodian's `GET /api/items/:id` body
([F-02 §4](../sprint-1/F-02-catalog.md#4-api)): `id`, `assetTag`, `name`, `description`, `location`, `status`,
`availableToday`, `category`, `committedPeriods`.

### `POST /api/items` (Custodian)

```json
{ "assetTag": "cpe-0500", "name": "Soldering station", "categoryId": "uuid",
  "location": "Cabinet A1", "description": "Hakko FX-888D" }
```
201: the item resource with `"assetTag": "CPE-0500"` and `"status": "ACTIVE"`. Errors: 400, 401, 403, 409
`DUPLICATE_ASSET_TAG`.

### `PATCH /api/items/:id` (Custodian)

Same fields as create, each optional. Only the fields sent are changed. Sending `location` or `description`
as `""` or `null` clears it. `status` is ignored here. 200: the item resource. Errors: 400, 401, 403, 404, 409
`DUPLICATE_ASSET_TAG`, 409 `INVALID_TRANSITION`.

### `POST /api/items/:id/status` (Custodian)

`{ "status": "ACTIVE" | "MAINTENANCE" | "RETIRED" }`. 200: the item resource. Errors: 400, 401, 403, 404, 409
`ITEM_IN_USE`, 409 `INVALID_TRANSITION`.

### `GET /api/items?includeRetired=true`

As F-02, plus retired items when the caller is a Custodian. Their `status` is `RETIRED` and `availableToday`
is `false`. `includeRetired` accepts `true` or `false` only; any other value (`1`, `TRUE`, empty) → 400
`VALIDATION_ERROR` on `includeRetired`, whatever the role.

## 5. Data

No schema change. `Item.status` already has `RETIRED`, and `Item.assetTag` is already unique and stored
upper-cased (SR-01). The requests rejected by a retirement use the existing `rejectionReason`, `decidedById`
and `decidedAt` columns. Two new error codes, `DUPLICATE_ASSET_TAG` and `ITEM_IN_USE`, are added to
[system-sds.md §C4.2](../../system-sds.md#c42-error-shape-and-codes).

## 6. UI

All three pages are Custodian-only (other roles see "You are not allowed to do this"). There are no Sprint 2
Figma screens yet, so the pages reuse the existing card, button, alert, dialog and toast patterns and the
light/dark tokens.

- **Header:** a Custodian gets an **Inventory** link to `/manage/items`.
- **`/items`:** a Custodian sees an **Add item** link to `/manage/items/new`. **`/items/:id`:** a Custodian sees
  an **Edit** link to `/manage/items/:id`.
- **`/manage/items`:** heading "Inventory", an **Add item** link, then one row per item (name, asset tag ·
  category, status badge, **Edit** link). Loading: "Loading items…". Empty: "No items yet." Error: the
  generic alert with **Retry**.
- **`/manage/items/new`** ("Add item") and **`/manage/items/:id`** ("Edit item"): labelled fields in the order
  of §2, field errors below each field (client checks first, then the server's 400 `details` and the 409
  `DUPLICATE_ASSET_TAG` under **Asset tag**). Other errors appear in an alert above the form and the input is
  kept. The fields and the submit button are disabled while the call runs. A field is linked to its error
  (`aria-describedby`) only while it has one. If `GET /api/categories` fails, an alert "Categories could not be
  loaded." with **Retry** appears above the form and **Category** stays disabled until they load. Loading and
  load-error states as above; an unknown id shows "Not found".
- **Status section** (edit page only): the current status badge and the buttons of §1. While a change runs,
  the buttons are disabled. **Retire item** opens a native modal dialog (title "Retire item", the item name,
  the BR-11 text, **Keep item** / **Retire item** (danger)). Success updates the badge and shows a toast
  ("Item set to maintenance", "Item set active", "Item retired"). A 409 shows its message in an alert in the
  section. A retired item's form fields and buttons are disabled and the section says "Retired items cannot be
  changed."
- Every control has a visible label and is keyboard reachable (NFR-13). At 360 px nothing scrolls sideways
  (NFR-12).

## 7. Acceptance criteria

| AC | Given / When / Then |
|---|---|
| **AC-43** | **Given** a Custodian, **when** they `POST /api/items` with `assetTag: "cpe-0500"`, a name, a category, a location, a description and `status: "RETIRED"`, **then** 201 with `assetTag = "CPE-0500"`, `status = ACTIVE` and the documented keys. The DB row matches and `GET /api/items` lists it. |
| **AC-44** | **BR-12:** an asset tag that does not match the format after upper-casing → 400 on `assetTag`. `AB-123` and `ABCDE-12345` are accepted. A tag used by another item in any case (`cpe-0201`) → 409 `DUPLICATE_ASSET_TAG` on `assetTag`. No row is created. |
| **AC-45** | Missing or blank name, a name over 100 characters, a missing or unknown `categoryId`, a location over 100 or a description over 1000 characters → 400 naming the field. No row is created. |
| **AC-46** | **Given** an item, **when** the Custodian sends `PATCH` with a new name and location and an empty description, **then** 200 and the DB has the new values with `description = null`, the other fields unchanged. Changing the tag to another item's tag → 409 `DUPLICATE_ASSET_TAG`. Keeping its own tag in lower case → 200. A retired item → 409 `INVALID_TRANSITION`. |
| **AC-47** | **Given** an `ACTIVE` item with an `APPROVED` and a `PENDING` request, **when** it is set to `MAINTENANCE`, **then** 200, the approved loan stays `APPROVED`, approving the pending one → 409 `ITEM_NOT_AVAILABLE` and a new request → 409 `ITEM_NOT_AVAILABLE`. Setting it back to `ACTIVE` → 200 and the approval then succeeds. Setting the current status again → 200, unchanged. |
| **AC-48** | **BR-11:** retiring an item with an `APPROVED` (or `CHECKED_OUT`) request → 409 `ITEM_IN_USE`, the item and its requests unchanged. Retiring an item whose requests are `PENDING`, `REJECTED` and `RETURNED` → 200 `RETIRED`. The `PENDING` one is now `REJECTED` with reason "Item retired", `decidedById` = the Custodian and `decidedAt` set. The others are unchanged. A retired item → any status → 409 `INVALID_TRANSITION`. |
| **AC-49** | **NFR-05:** **given** an item with one `PENDING` request, **when** a retire and an approve of that request are sent concurrently, **then** exactly one succeeds. Either the item is `RETIRED` and the request `REJECTED`, or the request is `APPROVED` and the item still `ACTIVE`. |
| **AC-50** | **BR-13:** a Borrower calling create, edit or status → 403, nothing written. No token → 401. An unknown or malformed `:id` → 404. A `status` outside the three values → 400. |
| **AC-51** | A Custodian's `GET /api/items?includeRetired=true` includes `CPE-0999` with `status: "RETIRED"`. A Borrower's gets the usual 11 items. A Custodian's `GET /api/items` without the flag, or with `includeRetired=false`, excludes it. `includeRetired=1`, `TRUE` or empty → 400 on `includeRetired`. A Custodian's `GET /api/items/<CPE-0999>` → 200 `RETIRED`. A Borrower's → 404. |
| **AC-52** | **UI (form):** an invalid asset tag shows the BR-12 message under **Asset tag** and nothing is sent. A 409 `DUPLICATE_ASSET_TAG` shows its message under **Asset tag** and keeps the input. A valid create goes to `/manage/items` with the "Item created" toast, shown once (not again after Back or a reload). Editing prefills the form; saving disables the fields, sends only the changed fields and shows "Changes saved". A failed categories load shows an alert with **Retry**. A field without an error has no `aria-describedby`. |
| **AC-53** | **UI (status):** **Retire item** opens the dialog with the BR-11 text. **Keep item** sends nothing. Confirming sends the status change, shows the **Retired** badge, disables the form and shows "Item retired". A 409 `ITEM_IN_USE` shows its message in the status section. **Set to maintenance** shows the maintenance badge and toast. |
| **AC-54** | **UI (navigation):** a Custodian sees **Inventory** in the header, **Add item** on `/items` and **Edit** on `/items/:id`. A Borrower sees none of them and gets "You are not allowed to do this" on `/manage/items`. `/manage/items` shows loading, then rows including a **Retired** badge, an empty message for no items, and **Retry** after an error. |

Tests: see [sts.md](sts.md) (TEST-51 to TEST-64).

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-23 | Initial contract | Sprint 2 planning (issue #12) |
| 0.2 | 2026-11-25 | Strict `includeRetired`; PATCH sends only changed fields; categories load error; toast shown once | Review of PR #55 |
