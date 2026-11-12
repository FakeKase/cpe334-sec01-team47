# Part B (2/2) — Requirements Traceability

**Document version:** 0.2 (draft, 2026-11-12)

Each baseline requirement is mapped to the feature or system responsibility that delivers it, the sprint
that establishes it and how it is verified. Sprint 1 rows give the exact acceptance criteria (AC) and test
IDs from the [Sprint 1 contracts](sprints/sprint-1/README.md). Rows for later sprints give the planned
verification. Their AC and tests are written when those contracts are prepared.

## B1. Requirements → features → sprint → verification

### Functional requirements

| Req | Feature / responsibility | Sprint | Verification |
|---|---|---|---|
| FR-01 Log in | F-01 | 1 | AC-01, AC-02, AC-03, AC-09 / TEST-01, TEST-02, TEST-03, TEST-11 |
| FR-02 Log out | F-01 | 1 | AC-05, AC-09 / TEST-06, TEST-11 |
| FR-03 Current user | F-01 | 1 | AC-04 / TEST-04, TEST-05 |
| FR-04 Browse catalog | F-02 | 1 | AC-10, AC-11, AC-13, AC-14 / TEST-12, TEST-13, TEST-15, TEST-16 |
| FR-05 Item detail | F-02 | 1 | AC-12 / TEST-14 |
| FR-06 Submit request | F-03 | 1 | AC-15, AC-17, AC-23 / TEST-17, TEST-20, TEST-27, TEST-40 |
| FR-07 My requests | F-04 | 1 | AC-24, AC-26 / TEST-28, TEST-30, TEST-40 |
| FR-08 Custodian request list / queue | F-05 | 1 | AC-27, AC-35 / TEST-31, TEST-41 |
| FR-09 Approve | F-05 | 1 | AC-28 / TEST-32, TEST-40, TEST-41 |
| FR-10 Reject with reason | F-05 | 1 | AC-31 / TEST-35, TEST-41 |
| FR-11 Cancel | F-06 | 2 | Planned: API tests per allowed/forbidden state; E2E cancel |
| FR-12 Checkout | F-07 | 2 | Planned: API tests incl. BR-09 window boundaries |
| FR-13 Return | F-07 | 2 | Planned: API tests GOOD/DAMAGED; DB check item status |
| FR-14 Overdue | F-08 | 2 | Planned: unit tests on overdue derivation with fixed clock; API list test; F-02 regression test that an overdue `CHECKED_OUT` loan stays in `committedPeriods` and makes `availableToday` false |
| FR-15 Create/edit items | F-09 | 2 | Planned: API tests incl. BR-12; E2E create item |
| FR-16 Item status | F-09 | 2 | Planned: API tests incl. BR-11 |
| FR-17 Categories | F-10 | 3 | Planned: API tests (unique name, custodian-only) |
| FR-18 Search / availability | F-11 | 3 | Planned: API tests on overlap-based availability filter |
| FR-19 Item history | F-12 | 3 | Planned: API test ordering + custodian-only |
| FR-20 Dashboard | F-13 | 3 | Planned: API test of counts against seeded fixture |
| FR-21 CSV report | F-14 | 3 | Planned: API test of header, rows, date filter, CSV escaping |

### Business rules

| Req | Feature / responsibility | Sprint | Verification |
|---|---|---|---|
| BR-01 Valid loan period | F-03 | 1 | AC-16 / TEST-18 (unit), TEST-19 |
| BR-02 Only active items | F-03 (create), F-05 (approve) | 1 | AC-18, AC-30 / TEST-21, TEST-34 |
| BR-03 No double booking | F-03, F-05; overdue extension in F-08 (also changes F-02) | 1 (ext. 2) | AC-19, AC-29, AC-34 / TEST-22 (unit), TEST-23, TEST-33, TEST-39; extension planned in F-08 |
| BR-04 No duplicate request | F-03 | 1 | AC-20 / TEST-24 |
| BR-05 Active request limit | F-03 | 1 | AC-21 / TEST-25 |
| BR-06 Lifecycle transitions | F-05 (approve/reject); F-06, F-07 (rest) | 1, 2 | AC-32 / TEST-36 (unit, full table), TEST-37; remaining transitions planned in F-06/F-07 |
| BR-07 Rejection reason | F-05 | 1 | AC-31 / TEST-35 |
| BR-08 Overdue borrowers blocked | F-08 | 2 | Planned: API test with fixed clock |
| BR-09 Checkout window | F-07 | 2 | Planned: unit + API boundary tests |
| BR-10 Damage → maintenance | F-07 | 2 | Planned: API + DB test |
| BR-11 Safe retirement | F-09 | 2 | Planned: API tests (blocked; pending auto-rejected) |
| BR-12 Unique asset tag | F-09 | 2 | Planned: API tests (duplicate, case, format) |
| BR-13 Role separation | F-01 (role guard), F-03, F-05 | 1 | AC-22, AC-33 / TEST-26, TEST-38 |
| BR-14 Ownership | F-04 | 1 | AC-25 / TEST-29 |

### Non-functional requirements

| Req | Feature / responsibility | Sprint | Verification |
|---|---|---|---|
| NFR-01 Authentication required | F-01, F-02 | 1 | AC-04, AC-06 / TEST-05, TEST-07 |
| NFR-02 Backend authorization | F-01 (guard), F-03, F-04, F-05 | 1 | AC-22, AC-25, AC-33 / TEST-26, TEST-29, TEST-38 |
| NFR-03 Password storage | F-01, SR-01 (seed) | 1 | AC-07 / TEST-08, TEST-09; secret scan in SR-02 |
| NFR-04 Session lifetime | F-01 | 1 | AC-04, AC-05, AC-07 / TEST-05, TEST-06, TEST-09 |
| NFR-05 Concurrency-safe approval | F-05 | 1 | AC-34 / TEST-39 |
| NFR-06 Safe errors | F-01 (error handler), SR-01 | 1 | AC-08 / TEST-10 |
| NFR-07 Persistence | SR-02 | 2 | Lab 5 C-05: record before/after restart and redeploy |
| NFR-08 Config and secrets | SR-02 | 2 | Lab 5 C-03 fresh clone; secret scanning enabled |
| NFR-09 Quality gate | SR-02 | 2 | Lab 5 C-01, C-02 |
| NFR-10 Traceable releases | SR-02 | 2 | Lab 5 C-06; smoke test reads `/api/health` commit |
| NFR-11 Performance | SR-03 (with F-11) | 3 | Scripted p95 timing with large seed |
| NFR-12 Responsive UI | SR-03 | 3 | Playwright 360 px viewport run + manual check |
| NFR-13 Accessibility basics | SR-03 | 3 | Playwright + axe-core scan |
| NFR-14 Login throttling | SR-02 | 2 | API test of 6th attempt → 429 |

## B2. Coverage check

- **Uncovered requirements:** none. Every FR, BR and NFR in [srs.md](srs.md) v0.1 maps to a feature or
  system responsibility and a sprint.
- **Features with no requirement:** none.
- **Split requirements:** BR-03 and BR-06 are established in Sprint 1 and extended in Sprint 2. Each
  extension must add tests to that sprint's STS.
- **Sprint 2 impact on Sprint 1 contracts:** when F-08 adds overdue loans, an overdue `CHECKED_OUT` request
  has `dueDate < today` but still occupies the item. F-02 must then change too: `committedPeriods` must
  include overdue `CHECKED_OUT` requests (not only `dueDate ≥ today`), and `availableToday` must be false
  while such a loan is open. F-02, F-03 and F-05 get a new contract version in Sprint 2.
- **Known verification gap:** NFR-07 to NFR-10 rely on Lab 5 evidence (CI runs, screenshots), not only on
  unit or API tests.

## B3. Approved changes

Record any change to requirements, feature allocation or sprint after the baseline here, including the
date and reason. The original text stays in version history.

| Change ID | Date | Change | Reason | Approved by |
|---|---|---|---|---|
| CH-01 | 2026-11-12 | NFR-14 login throttling moved from SR-03 (Sprint 3) to SR-02 (Sprint 2). | The service is public from Sprint 2 with seeded accounts (PR #3 review). | Team (PR #3) |
| CH-02 | 2026-11-12 | Sprint 1 target moved from 8 Nov to 15 Nov, overlapping Lab 5. | Deliverable 1 date had passed before the specification was written (PR #3 review). | Team (PR #3) |
