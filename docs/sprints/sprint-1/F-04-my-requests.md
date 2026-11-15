# F-04 — My requests

| | |
|---|---|
| **Linked requirements** | FR-07, BR-14, NFR-02 |
| **Depends on** | F-01, F-03 (request resource and data) |
| **Sprint** | 1 |
| **Contract version** | 0.1 (draft, 2026-11-10). See [version history](#version-history). |

## 1. Behavior and workflow

1. A Borrower opens **My requests** (`/my-requests`). The client calls `GET /api/requests`.
2. The server recognises the Borrower role and returns **only** requests with `borrowerId = req.user.id`,
   newest first. An optional `?status=` filter applies within that scope.
3. The Borrower opens one request. The client calls `GET /api/requests/:id` and the server applies the same
   ownership scope.

`GET /api/requests` and `GET /api/requests/:id` are shared with F-05. The service applies the scope by role:
Borrower → own only, Custodian → all.

## 2. Rules, validation and failure cases

| Case | Result |
|---|---|
| Borrower lists requests | Only own requests. Other borrowers' requests never appear, even with `?status=` or extra query params such as `?borrowerId=`, which are ignored. |
| Borrower reads another borrower's request by id | 404 `NOT_FOUND` (DD-08). The body contains no request data. |
| `:id` not a UUID or unknown | 404 `NOT_FOUND` |
| `status` not one of the six values | 400 `VALIDATION_ERROR` |
| No token | 401 |

## 3. Permissions

Borrower: own requests only. Custodian: all requests (detailed in F-05). Anonymous: 401.

## 4. API

### `GET /api/requests?status=<STATUS>` (authenticated, role-scoped)

200: array of request resources (shape in [F-03 §4](F-03-submit-request.md#4-api)), ordered by `createdAt` descending.

### `GET /api/requests/:id` (authenticated, role-scoped)

200: one request resource. Errors: 401, 404.

## 5. Data

Read-only over `BorrowRequest` joined with `Item` and `User` (borrower, decidedBy). Uses the
`(borrowerId, status)` index. **No schema change.**

## 6. UI

`/my-requests` (Borrower only): a list or table with item name and asset tag, period ("20 Nov – 22 Nov 2026"),
a status badge, and a submitted date. For `REJECTED` requests, the line "Reason: …" is shown. Loading: "Loading
your requests…". Empty: "You have no requests yet." with a link to the catalog. A confirmation banner appears
after F-03 redirects here.

## 7. Acceptance criteria

| AC | Given / When / Then |
|---|---|
| **AC-24** | **Given** Borrower 1 has 2 requests (one `REJECTED` with a reason) and Borrower 2 has 1, **when** Borrower 1 calls `GET /api/requests`, **then** exactly their 2 requests are returned, newest first, and the rejected one includes `rejectionReason`. `?status=PENDING` returns only Borrower 1's pending one. Adding `?borrowerId=<Borrower 2>` changes nothing. |
| **AC-25** | **When** Borrower 1 calls `GET /api/requests/<Borrower 2's request id>`, **then** 404 `NOT_FOUND` with no request fields in the body. The same call by Borrower 2 returns 200. |
| **AC-26** | **UI:** a Borrower with no requests sees "You have no requests yet." A Borrower with a rejected request sees the **Rejected** badge and the reason text. |

Tests: see [sts.md](sts.md) (TEST-28 to TEST-30, TEST-40).

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-10 | Initial contract | Sprint 1 planning |
