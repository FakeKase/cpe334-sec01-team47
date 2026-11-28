# Sprint 3 — Contracts

**Sprint goal:** finish the remaining baseline features (search, history, dashboard, report, categories) and prove
the product is fast, usable on a phone and usable without a mouse. See [plan.md §D4](../plan.md).

## Contents

| Contract | Feature | Requirements | AC | Tests | Status |
|---|---|---|---|---|---|
| [F-10](F-10-category-management.md) | Category management | FR-17 | AC-77 to AC-83 | TEST-94 to TEST-101 | Implemented and tested, in review (#64) |
| [F-11](F-11-catalog-search.md) | Catalog search and date availability | FR-18, NFR-11 | AC-84 to AC-91 | TEST-102 to TEST-110 | Contract written. Not implemented. |
| [F-12](F-12-item-history.md) | Item loan history | FR-19 | AC-92 to AC-97 | TEST-111 to TEST-116 | Contract written. Not implemented. |
| [F-13](F-13-custodian-dashboard.md) | Custodian dashboard | FR-20 | AC-98 to AC-105 | TEST-117 to TEST-125 | Contract written. Not implemented. |
| [F-14](F-14-loan-report.md) | Loan report export | FR-21 | AC-106 to AC-113 | TEST-126 to TEST-134 | Contract written. Not implemented. |
| [SR-03](SR-03-product-hardening.md) | Product hardening | NFR-11, NFR-12, NFR-13 (NFR-05, NFR-14, NFR-10 optional or proposed) | AC-114 to AC-120 | TEST-135 to TEST-141 | Contract written. Not implemented. |
| [sts.md](sts.md) | Software Test Specification | | all | TEST-94 to TEST-141 | |

Status words mean: *contract written* is a reviewed document, *implemented* is code that runs, *tested* is tests that
ran and passed on a named commit. A feature is *accepted* only after its Definition of Done holds. Nothing in this
table is marked done without a test run.

## Order and dependencies

F-10 comes first (nothing depends on it). F-11 and F-12 need only finished features. F-13 and F-14 read the same data
and can be built in either order. SR-03 runs last, because it measures and scans the finished screens.

## Rules for every Sprint 3 contract

- The workflow is: contract and tests first (a `docs:` and a `test:` commit, with the failing output kept), then the
  code, then a PR into `staging` reviewed by the other student. See the
  [Sprint 1 workflow](../sprint-1/README.md#e2-workflow-for-each-feature).
- The Definition of Done is in each contract (§8) and adds to the
  [product Definition of Done](../sprint-1/README.md#e3-definition-of-done).
- A change to a contract after review is a new version with a row in its version history, and the STS and the
  traceability matrix change in the same PR.
- AC and TEST numbers continue from Sprint 2 (AC-76 and TEST-93 were the last). They are never reused.

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-28 | Contracts for F-11 to F-14 and SR-03 added next to F-10 | Deliverable 2 |
