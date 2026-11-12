# Part B (1/2) — Feature Inventory

**Document version:** 0.2 (draft, 2026-11-12)

Features (`F-xx`) are user-visible capabilities. System responsibilities (`SR-xx`) are cross-cutting
engineering work that requirements depend on but that no single screen owns. Requirement IDs refer to
[srs.md](srs.md). The requirement-by-requirement mapping is in [traceability.md](traceability.md).

## Feature list

| ID | Feature | Short description | Requirements | Depends on | Sprint |
|---|---|---|---|---|---|
| **F-01** | Authentication and session | Log in with email/password, retrieve the current user, log out. Auth middleware, role guard and safe error handler shared by all endpoints. | FR-01, FR-02, FR-03, BR-13, NFR-01, NFR-03, NFR-04, NFR-06 | SR-01 | 1 |
| **F-02** | Equipment catalog | List non-retired items with category, status and "available today". Filter by category. Item detail with committed periods. Public category list. | FR-04, FR-05, NFR-01 | F-01, SR-01 | 1 |
| **F-03** | Submit borrow request | Borrower requests one item for a date range with a purpose. Validates the period, item status, overlap, duplicates and the active limit. | FR-06, BR-01, BR-02, BR-03, BR-04, BR-05, BR-13, NFR-02 | F-01, F-02 | 1 |
| **F-04** | My requests | Borrower lists and opens their own requests and sees status and rejection reasons. Ownership enforced. | FR-07, BR-14, NFR-02 | F-01, F-03 | 1 |
| **F-05** | Review requests | Custodian request list and pending queue, approve (rechecks BR-02/BR-03 under a lock), reject with a reason. | FR-08, FR-09, FR-10, BR-02, BR-03, BR-06, BR-07, BR-13, NFR-02, NFR-05 | F-01, F-03 | 1 |
| **F-06** | Cancel request | Borrower cancels their own `PENDING` or `APPROVED` request. | FR-11, BR-06, BR-14 | F-04 | 2 |
| **F-07** | Checkout and return | Custodian records the hand-over of an approved request and the return of a checked-out one, with condition. A damaged return sends the item to maintenance. | FR-12, FR-13, BR-06, BR-09, BR-10 | F-05 | 2 |
| **F-08** | Overdue tracking | Derived overdue flag, custodian overdue list, blocking of new requests from overdue borrowers, overdue loans keep occupying the item (also changes the F-03/F-05 overlap checks and F-02 `availableToday` / `committedPeriods`). | FR-14, BR-03 (overdue extension), BR-08 | F-07 | 2 |
| **F-09** | Inventory management | Custodian creates/edits items, sets maintenance, retires items safely. | FR-15, FR-16, BR-11, BR-12 | F-02 | 2 |
| **F-10** | Category management | Custodian creates and renames categories. | FR-17 | F-09 | 3 |
| **F-11** | Catalog search and date availability | Keyword search and "free between dates" filter. | FR-18, NFR-11 | F-02, F-08 | 3 |
| **F-12** | Item loan history | Full chronological loan history per item for custodians. | FR-19 | F-07 | 3 |
| **F-13** | Custodian dashboard | Counts of pending, starting today, due today, overdue, in maintenance, each linking to its list. | FR-20 | F-07, F-08, F-09 | 3 |
| **F-14** | Loan report export | CSV of requests in a date range. | FR-21 | F-07 | 3 |
| **SR-01** | Data and application foundation | Express app skeleton, Prisma schema and migrations, reproducible idempotent seed, test harness (Vitest, Supertest, Playwright) with an isolated test database, `/api/health` and `/api/ready`. | NFR-06 (handler), supports all FRs | — | 1 |
| **SR-02** | Containerised deployment and CI/CD (Lab 5) | Docker image, `.env.example`, CI on every PR as a required check, GCP Cloud Run + Cloud SQL + Secret Manager, deploy pipeline from `main`, commit SHA reported at runtime, login throttling before going public. | NFR-07, NFR-08, NFR-09, NFR-10, NFR-14 | SR-01 | 2 |
| **SR-03** | Product hardening | Responsive layout pass, accessibility pass, performance check, optional DB exclusion constraint for overlaps. | NFR-11, NFR-12, NFR-13 | All features | 3 |

## Sprint summary

| Sprint | Features / responsibilities |
|---|---|
| 1 | SR-01, F-01, F-02, F-03, F-04, F-05 |
| 2 | F-06, F-07, F-08, F-09, SR-02 |
| 3 | F-10, F-11, F-12, F-13, F-14, SR-03 |
