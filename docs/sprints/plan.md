# Part D — Three-Sprint Plan

**Document version:** 0.1 (draft, 2026-11-10)
Feature IDs refer to [features.md](../features.md). Requirement IDs refer to [srs.md](../srs.md).

## D1. Overview

| Sprint | Goal | Features | Checkpoint |
|---|---|---|---|
| **1** | A borrower can request equipment and a custodian can approve or reject it, with real login, role and ownership enforcement, conflict-free approval and persistence. | SR-01, F-01, F-02, F-03, F-04, F-05 | Deliverable 1 (8 Nov 2026) |
| **2** | Complete the loan lifecycle (cancel, hand-over, return, overdue) and inventory management, and run the product on GCP through a gated CI/CD pipeline. | F-06, F-07, F-08, F-09, SR-02 | Lab 5 (15 Nov); Deliverable 2 (29 Nov) |
| **3** | Remaining features, integration and hardening: search, history, dashboard, report, categories, plus security, performance, responsive and accessibility work. | F-10, F-11, F-12, F-13, F-14, SR-03 | Progress at 29 Nov; complete by 13 Dec |

Together, the three sprints cover every FR, BR and NFR in the baseline (see [traceability.md](../traceability.md) §B2).

## D2. Sprint 1 — "Request and approve"

**Goal.** Deliver one complete vertical slice through UI → API → database. A Borrower logs in, browses the
catalog, requests an item for a date range and sees it pending. A Custodian logs in, sees the queue and
approves or rejects. The Borrower then sees the persisted decision.

| Feature | Delivers | Depends on |
|---|---|---|
| SR-01 | Express app, Prisma schema + migration, idempotent seed, test harness with a test DB, health/ready | — |
| F-01 | Login / logout / me, `requireAuth`, `requireRole`, error handler | SR-01 |
| F-02 | Catalog list + filter, item detail, public categories | F-01 |
| F-03 | Create request with BR-01–BR-05 | F-01, F-02 |
| F-04 | Borrower's own requests (ownership) | F-03 |
| F-05 | Custodian queue, approve (locked recheck), reject with reason | F-03 |

**Suggested order and pairing (two students).** SR-01 is done as a pair first. Then F-01 (Student A) runs in
parallel with F-02 (Student B). F-03 is paired, because it contains the core rules. Then F-04 (B) runs in
parallel with F-05 (A). Each student reviews the other's PRs into `sprint-1` staging.

**Why this scope.** Deliverable 1 requires real authentication with at least two meaningful roles, a
meaningful state transition with business-rule validation, persistence, and tests of rules and access. The
request → approve/reject transition is the smallest slice with all of these:

- it uses both roles, each doing something only it may do;
- it has real domain rules with boundaries (BR-01–BR-05) and a concurrency rule (NFR-05);
- it has an ownership restriction (BR-14).

Checkout, return and inventory editing are deliberately left to Sprint 2. Seeded items are enough to
exercise the slice, and including those features would double the number of contracts.

**Completion outcome.** The Sprint 1 Definition of Done is met
([sprint-1/README.md](sprint-1/README.md#definition-of-done)). AC-01–AC-35 pass their tests, and the release
is tagged `v0.1.0` on `main` after a reviewed `sprint-1 → main` PR.

## D3. Sprint 2 — "Full loan lifecycle on the cloud"

| Feature | Delivers | Depends on |
|---|---|---|
| SR-02 | Dockerfile/compose adapted, `.env.example`, `ci-docker.yml` required check, GCP deploy (Cloud Run, Cloud SQL, Secret Manager), `deploy.yml`, commit SHA in `/api/health` | SR-01 (Sprint 1 release) |
| F-06 | Borrower cancels `PENDING`/`APPROVED` | F-04 |
| F-07 | Checkout with BR-09 window; return with condition, BR-10 | F-05 |
| F-08 | Overdue derivation, overdue list, BR-08 block, BR-03 overdue extension | F-07 |
| F-09 | Item create/edit, maintenance/retire with BR-11, BR-12 | F-02 |

**Dependencies and risk.** SR-02 comes first because Lab 5 is due 15 Nov and every later merge goes through
its pipeline. F-08 needs F-07, because "overdue" only exists after checkout. Migrations for S2 columns
(checkout/return fields already in the model) must be additive.

**Completion outcome.** The live URL serves the full lifecycle. Lab 5 checks C-01–C-06 are evidenced.
Sprint 2 contracts and STS are complete and passing. Release `v0.2.0` is deployed from `main`.

## D4. Sprint 3 — "Insight and hardening"

| Feature | Delivers | Depends on |
|---|---|---|
| F-10 | Category create/rename | F-09 |
| F-11 | Keyword search + free-between-dates filter (reuses the overlap rule) | F-02, F-08 |
| F-12 | Item loan history | F-07 |
| F-13 | Custodian dashboard | F-07, F-08, F-09 |
| F-14 | CSV loan report | F-07 |
| SR-03 | NFR-11 performance check, NFR-12 responsive, NFR-13 accessibility, NFR-14 login throttling, optional DB exclusion constraint | all |

**Completion outcome.** All baseline requirements are implemented and verified. Defects from the Lab 6
partner UAT are fixed through the pipeline. The final release `v1.0.0` is deployed and the demo video
recorded by 13 Dec.

## D5. Feasibility notes

- Sprint 1 has 5 features plus the foundation, and its 35 acceptance criteria are mostly small API tests on
  one shared harness. That is feasible for two people when SR-01 is finished early.
- Sprint 2 is the heaviest, because Lab 5 overlaps it. If time runs short, **F-09** moves to Sprint 3 and
  the seed keeps providing items. This would be recorded in [traceability.md §B3](../traceability.md#b3-approved-changes).
- Sprint 3 features are mostly read-only queries over existing data. They are the lowest-risk items to trim.
  The candidates are F-14, then F-10.
