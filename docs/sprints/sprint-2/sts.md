# Sprint 2 — Software Test Specification (STS)

**Document version:** 0.1 (draft, 2026-11-22)
Covers the Sprint 2 acceptance criteria written so far. It grows as the other Sprint 2 contracts are added.
Levels, tools and common preconditions (test database, fixed clock **today = 2026-11-15**, `loginAs`) are the
same as in the [Sprint 1 STS §1](../sprint-1/sts.md#1-test-levels-tools-and-environment).

## F-06 Cancel request

Contract: [F-06](F-06-cancel-request.md). Files: `server/test/api/cancel.test.ts`,
`client/src/pages/MyRequests.test.tsx`, `client/src/pages/Requests.test.tsx`, `e2e/cancel-request.spec.ts`.

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-42 | AC-36 | API | Borrower 1's `PENDING` request R | Borrower 1: `POST /api/requests/R/cancel`, then `GET /api/requests` | 200, `status = CANCELLED`, `cancelledAt` an ISO time. DB: `status = CANCELLED`, `cancelledAt` set, `decidedById` and `decidedAt` null. The list shows `CANCELLED`. |
| TEST-43 | AC-37 | API | Borrower 1's `APPROVED` R on CPE-0201, 20–22 Nov. Separately, Borrower 1 with 3 active requests | Cancel R. Borrower 2 creates a request on CPE-0201 for 21–23 Nov, then the Custodian approves it. Borrower 1 cancels one of the 3 and creates a new request | Cancel 200. Borrower 2's create 201 and approve 200. Borrower 1's new create 201. |
| TEST-44 | AC-38 | API | `APPROVED` request with 10–12 Nov (today 15 Nov) | Borrower cancels | 200, `CANCELLED`. |
| TEST-45 | AC-39 | API | Own requests `REJECTED`, `CANCELLED` (with a known `cancelledAt`), `CHECKED_OUT`, `RETURNED` (`it.each`) | Borrower cancels each | 409 `INVALID_TRANSITION`. Status and `cancelledAt` unchanged. |
| TEST-46 | AC-40 | API | Borrower 2's `PENDING` request | Borrower 1 cancels it. Custodian cancels it. No token. Unknown uuid. `abc` | 404, 403, 401, 404, 404. The row is unchanged. |
| TEST-47 | AC-41 | API | One `PENDING` request | Two `POST …/cancel` sent with `Promise.all` | One 200 and one 409 `INVALID_TRANSITION`. DB: `CANCELLED`, one `cancelledAt`. |
| TEST-48 | AC-42 | Component | MSW: `/api/requests` returns PENDING, APPROVED, REJECTED, CANCELLED, CHECKED_OUT and RETURNED rows for a Borrower | Render `/my-requests` | **Cancel** buttons on exactly the PENDING and APPROVED rows. |
| TEST-49 | AC-42 | Component | MSW: cancel returns the cancelled resource; another case returns 409. A Custodian session | Press Cancel, then **Keep request**; press Cancel, then **Cancel request**; then the 409 case. Render `/requests` as a Custodian | Keep: no POST, the row is unchanged. Confirm: POST once, **Cancelled** badge, no button, toast "Request cancelled". 409: the message is shown on the row. No Cancel button on the Custodian's page. |
| TEST-50 | AC-42 | E2E | Seeded app. Borrower One has a `PENDING` request on CPE-0203 (created through the API) | Sign in, open My requests, press Cancel then **Keep request**, press Cancel then **Cancel request** | After Keep the row is still **Pending**. After confirming the row shows **Cancelled** with no button and the toast appears. After a reload it is still **Cancelled**. |

## F-09 Inventory management

Contract: [F-09](F-09-inventory-management.md). Files: `server/test/unit/assetTag.test.ts`,
`server/test/api/items.test.ts`, `client/src/pages/ItemForm.test.tsx`, `client/src/pages/ManageItems.test.tsx`,
`e2e/inventory.spec.ts`.

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-51 | AC-43 | API | Custodian token | `POST /api/items` with `assetTag: "cpe-0500"`, name, Measurement category, location, description and `status: "RETIRED"`; then `GET /api/items` | 201, `assetTag = "CPE-0500"`, `status = ACTIVE`, keys as the item resource. DB row matches. The list contains `CPE-0500`. |
| TEST-52 | AC-44 | Unit | — | `normalizeAssetTag` then `isAssetTag` on `"AB-123"`, `"ABCDE-12345"`, `" cpe-0042 "`, `"A-123"`, `"ABCDEF-123"`, `"AB-12"`, `"AB-123456"`, `"AB0123"`, `"AB-12a"`, `""` | true, true, true (normalised to `CPE-0042`), then false for the rest. |
| TEST-53 | AC-44 | API | Custodian token | Create with `CPE0042`, `AB-12`; with `AB-123` and `ABCDE-12345`; with `cpe-0201` | 400 on `assetTag` (twice); 201, 201; 409 `DUPLICATE_ASSET_TAG` with `details[0].field = "assetTag"`. Item count grows only by the two accepted tags. |
| TEST-54 | AC-45 | API | Custodian token | Create with (a) no name, (b) name `"   "`, (c) 101-char name, (d) no `categoryId`, (e) unknown category UUID, (f) 101-char location, (g) 1001-char description (`it.each`) | 400 `VALIDATION_ERROR` naming `name`, `name`, `name`, `categoryId`, `categoryId`, `location`, `description`. Item count unchanged. |
| TEST-55 | AC-46 | API | Custodian token, `CPE-0202` | `PATCH` name, location and `description: ""`; `PATCH assetTag: "CPE-0201"`; `PATCH assetTag: "cpe-0202"`; `PATCH` of `CPE-0999` | 200 with DB name and location updated, `description = null`, tag and category unchanged; 409 `DUPLICATE_ASSET_TAG`; 200; 409 `INVALID_TRANSITION`. |
| TEST-56 | AC-47 | API | `CPE-0201` with Borrower 2's `APPROVED` 20–22 Nov and Borrower 1's `PENDING` 25–26 Nov | Status `MAINTENANCE`; approve the pending; Borrower 1 creates a request; status `MAINTENANCE` again; status `ACTIVE`; approve the pending | 200; 409 `ITEM_NOT_AVAILABLE`; 409 `ITEM_NOT_AVAILABLE`; 200 no change; 200; 200. The approved loan stays `APPROVED` throughout. |
| TEST-57 | AC-48 | API | (a) `CPE-0201` with an `APPROVED` request, (b) `CPE-0202` with a `CHECKED_OUT` request, (c) `CPE-0203` with `PENDING`, `REJECTED` and `RETURNED` requests, (d) `CPE-0999` | Retire (a), (b), (c); set (d) to `ACTIVE` | (a), (b): 409 `ITEM_IN_USE`, item status and requests unchanged. (c): 200 `RETIRED`; the `PENDING` row is `REJECTED`, reason "Item retired", `decidedById` = Custodian, `decidedAt` set; the others unchanged. (d): 409 `INVALID_TRANSITION`. |
| TEST-58 | AC-49 | API | `CPE-0203` with one `PENDING` request R | `Promise.all` of retire `CPE-0203` and approve R | Exactly one 200. Final state is either (item `RETIRED`, R `REJECTED`) or (item `ACTIVE`, R `APPROVED`). |
| TEST-59 | AC-50 | API | Borrower token; no token; Custodian token | Borrower: create, `PATCH`, status. No token: the same. Custodian: `PATCH` and status of a random UUID and `abc`; status `"BROKEN"` | 403 ×3 and nothing changed; 401 ×3; 404 ×4; 400 on `status`. |
| TEST-60 | AC-51 | API | Fixture seed | Custodian `GET /api/items?includeRetired=true`; Borrower the same; Custodian `GET /api/items` and `?includeRetired=false`; Custodian `?includeRetired=` `1`, `TRUE`, empty (`it.each`); Custodian and Borrower `GET /api/items/<CPE-0999>` | 12 items with `CPE-0999` `RETIRED` / `availableToday: false`; 11; 11 and 11; 400 on `includeRetired` ×3; 200 `RETIRED`; 404. |
| TEST-61 | AC-52 | Component | Custodian session. MSW: categories, `POST /api/items` returning 409 `DUPLICATE_ASSET_TAG` once and then 201; `GET`/`PATCH /api/items/:id` | Render `/manage/items/new`: submit tag `CPE42`; then a valid form; submit again. Submit with no name or category. Categories 500 once, then **Retry**. Render `/manage/items/:id`, change the name, save. Render `/manage/items` with the "Item created" router state, go to `/items` and Back | BR-12 message under **Asset tag**, no POST. The 409 message under **Asset tag**, inputs kept. Then the URL is `/manage/items` with the "Item created" toast. Fields have no `aria-describedby` until they have an error. Alert "Categories could not be loaded.", **Category** disabled, enabled after Retry. Edit form prefilled; fields disabled while saving; PATCH body is exactly `{ name }`; "Changes saved". The router state is cleared and the toast is not shown again after Back. |
| TEST-62 | AC-53 | Component | Custodian session. MSW: item `ACTIVE`; status returns the updated item, or 409 `ITEM_IN_USE` | Press **Set to maintenance**. Press **Retire item** then **Keep item**. Press **Retire item** then confirm. Separately, retire with the 409 | Maintenance badge and toast. Dialog text has "Item retired"; Keep sends nothing. Confirm: one POST with `RETIRED`, **Retired** badge, fields disabled, "Item retired" toast. The 409 message appears in the status section. |
| TEST-63 | AC-54 | Component | MSW: items (one `RETIRED`), item detail; Borrower and Custodian sessions; an empty list; a 500 | Render `/items`, `/items/:id` and `/manage/items` as each role | Custodian: **Inventory**, **Add item**, **Edit** visible; manage list shows "Loading items…" then the **Retired** badge. Borrower: none of these, `/manage/items` shows "You are not allowed to do this". Empty → "No items yet."; 500 → **Retry** reloads. |
| TEST-64 | AC-43, AC-48, AC-52, AC-53 | E2E | Seeded app | Custodian: Inventory → Add item with a unique tag → find it on the list → Edit → Set to maintenance → Retire item → confirm. Then a Borrower opens the catalog | Each step shows its toast and badge. The item is listed as **Retired** in Inventory, and the Borrower's catalog does not show it. |
