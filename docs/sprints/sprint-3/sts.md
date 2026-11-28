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
