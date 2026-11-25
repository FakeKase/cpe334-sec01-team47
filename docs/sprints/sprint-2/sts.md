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

## F-07 Checkout and return

Contract: [F-07](F-07-checkout-return.md). Files: `server/test/unit/checkoutWindow.test.ts`,
`server/test/api/checkout.test.ts`, `server/test/api/return.test.ts`, `client/src/pages/Requests.test.tsx`,
`client/src/pages/MyRequests.test.tsx`, `e2e/checkout-return.spec.ts`.

| Test | AC | Level | Precondition / input | Action | Expected result |
|---|---|---|---|---|---|
| TEST-65 | AC-55 | API | `APPROVED` request R on CPE-0201, 15–20 Nov (today 15 Nov). A second untouched `APPROVED` request | Custodian: `POST /api/requests/R/checkout`, then `GET /api/requests` | 200, `status = CHECKED_OUT`, `checkedOutBy` = the Custodian, `checkedOutAt` an ISO time, the return fields `null`. DB: `checkedOutById` and `checkedOutAt` set, item still `ACTIVE`. The list shows `CHECKED_OUT`. The untouched request has all the new fields `null`. |
| TEST-66 | AC-56 | Unit | today = 2026-11-15 | `checkoutWindow(start, due, today)` with (15–20), (10–15), (16–20), (10–14) | `null`, `null`, `"early"`, `"late"`. |
| TEST-67 | AC-56 | API | Four `APPROVED` requests: 15–20, 10–15, 16–20, 10–14 Nov | Custodian checks out each | 200, 200, 409 `INVALID_TRANSITION` with "2026-11-16" in the message, 409 `INVALID_TRANSITION` with "can only be cancelled". The two refused rows are unchanged. |
| TEST-68 | AC-57 | API | `PENDING`, `REJECTED`, `CANCELLED`, `CHECKED_OUT`, `RETURNED` requests (`it.each`). An `APPROVED` request in its window on a `MAINTENANCE` item (CPE-0901) | Custodian checks out each | 409 `INVALID_TRANSITION` for the five, 409 `ITEM_NOT_AVAILABLE` for the last. All rows unchanged. |
| TEST-69 | AC-58 | API | An `APPROVED` request A and a `CHECKED_OUT` request C | Borrower: checkout A, return C, return C with body `{}`. No token. Unknown uuid. `abc`. For both endpoints | 403, 403, 403. 401. 404. 404. A and C are unchanged. |
| TEST-70 | AC-59 | API | One `APPROVED` request; a second `APPROVED` request; one `CHECKED_OUT` request | `Promise.all` of two checkouts of the first. A checkout and the Borrower's cancel of the second. `Promise.all` of two `GOOD` returns of the third | One 200 and one 409 `INVALID_TRANSITION` in each pair. The first is `CHECKED_OUT` with one `checkedOutAt`. The second is `CHECKED_OUT` or `CANCELLED`. The third is `RETURNED` with one `returnedAt`. |
| TEST-71 | AC-60 | API | `CHECKED_OUT` request R on CPE-0201, 15–20 Nov. A second `CHECKED_OUT` request on CPE-0202 | Custodian returns R with `{ condition: "GOOD", note: "  Cable included  " }`, the second with `{ condition: "GOOD", note: "   " }`. Then Borrower 2 creates a request on CPE-0201 for 16–18 Nov and the Custodian approves it | 200 `RETURNED`, `returnedTo` the Custodian, `returnCondition = GOOD`, `returnNote = "Cable included"`. The second has `returnNote = null`. The items stay `ACTIVE`. Borrower 2's create is 201 and the approval 200. |
| TEST-72 | AC-61 | API | `CHECKED_OUT` request R on CPE-0201 (`ACTIVE`) | Custodian returns R with `DAMAGED`. Then `GET /api/items`. Borrower 2 creates a request on CPE-0201 | 200 `RETURNED`. DB: item `MAINTENANCE`. The list shows CPE-0201 with `availableToday: false`. The create is 409 `ITEM_NOT_AVAILABLE`. |
| TEST-73 | AC-62 | API | `CHECKED_OUT` request R | Return with `{}`, `{ condition: "" }`, `{ condition: "BROKEN" }`, a 501-character note, then a 500-character note | 400 `VALIDATION_ERROR` four times (fields `condition`, `condition`, `condition`, `note`) with R and the item unchanged. Then 200. |
| TEST-74 | AC-63 | API | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `RETURNED` requests (`it.each`). A `CHECKED_OUT` request with due date 10 Nov (today 15 Nov) | Custodian returns each with `DAMAGED` | 409 `INVALID_TRANSITION` for the five, with the request and its item unchanged (the item is not set to `MAINTENANCE`). 200 for the overdue one. |
| TEST-75 | AC-64 | Component | System time 15 Nov. MSW: `/api/requests?status=APPROVED` returns rows 15–20 Nov, 10–15 Nov, 23–25 Nov and 10–12 Nov. A Custodian session | Render `/requests`, open **Approved** | **Check out** enabled on the first two. Disabled with "Starts 23 Nov" on the third. Disabled with "Due date passed, can only be cancelled" on the fourth. Empty list: "Nothing to hand over." |
| TEST-76 | AC-64 | Component | MSW: checkout returns the resource; a second case returns 409 `INVALID_TRANSITION` | Press **Check out**. Then the 409 case | One POST. The row leaves the tab and the toast "Item checked out" shows. In the 409 case the message appears on the row and the row stays. |
| TEST-77 | AC-64 | Component | MSW: a `CHECKED_OUT` row. Return returns the resource; a second case returns 409 | Press **Return**. Check **Return item**. Choose **Damaged**, type a note, confirm. Then the 409 case, and Esc | **Return item** is disabled until a condition is chosen. **Damaged** shows the maintenance warning. The POST body is `{ condition: "DAMAGED", note }`. The row leaves and the toast is "Item returned and set to maintenance". For **Good** the toast is "Item returned". The 409 message appears on the row. Esc closes the dialog with no POST. |
| TEST-78 | AC-65 | Component | MSW: a Borrower's list with `CHECKED_OUT` and `RETURNED` rows | Render `/my-requests` | **Checked out** and **Returned** badges. No **Check out**, **Return** or **Cancel** button on those rows. |
| TEST-79 | AC-65 | E2E | Seeded app. A request for CPE-0203 starting today, created and approved through the API | Custodian: open Requests, Approved, **Check out**; Checked out, **Return**, choose **Damaged**, confirm. Open the catalog | The toasts show. The request ends **Returned**. The catalog shows CPE-0203 as under maintenance. |
