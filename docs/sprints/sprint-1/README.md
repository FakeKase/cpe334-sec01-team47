# Part E — Sprint 1 Engineering Contracts

**Sprint goal:** "Request and approve". A Borrower requests equipment for a date range. A Custodian approves or
rejects it under real authentication, role and ownership enforcement, conflict-free approval and persistence.
See [plan.md §D2](../plan.md#d2-sprint-1--request-and-approve).

## E1. Contents

| Contract | Feature | Requirements | AC | Tests |
|---|---|---|---|---|
| [F-01](F-01-authentication.md) | Authentication and session | FR-01–03, BR-13, NFR-01, NFR-03, NFR-04, NFR-06 | AC-01–AC-09 | TEST-01–TEST-11 |
| [F-02](F-02-catalog.md) | Equipment catalog | FR-04, FR-05, NFR-01 | AC-10–AC-14 | TEST-12–TEST-16 |
| [F-03](F-03-submit-request.md) | Submit borrow request | FR-06, BR-01–05, BR-13, NFR-02 | AC-15–AC-23 | TEST-17–TEST-27, TEST-40 |
| [F-04](F-04-my-requests.md) | My requests | FR-07, BR-14, NFR-02 | AC-24–AC-26 | TEST-28–TEST-30, TEST-40 |
| [F-05](F-05-review-requests.md) | Review requests | FR-08–10, BR-02, BR-03, BR-06, BR-07, BR-13, NFR-02, NFR-05 | AC-27–AC-35 | TEST-31–TEST-41 |
| [sts.md](sts.md) | Software Test Specification | — | all | TEST-01–TEST-41 |

**SR-01 (foundation)** has no separate contract. Its observable outputs are verified through the feature
tests: the migration creates every table and constraint in [system-sds.md §C2](../../system-sds.md#c2-data-design),
the seed is idempotent (running it twice gives the same row counts), `/api/health` and `/api/ready` respond,
and the test harness runs against an isolated database.

## E2. Workflow for each feature

1. Open a GitHub Issue per feature (`F-0x: …`) labelled `sprint-1`, link the contract, and name the owner and
   the reviewer.
2. Branch from `staging`: `feat/F-0x-short-name`.
3. **Contract first:** commit the contract and its tests as written in the STS (`docs:` + `test:` commits).
   Run them and keep the **failing** output as evidence of TDD (red).
4. Implement until the tests pass (`feat:` commits). Keep the **passing** output (green).
5. Open a PR into `staging` that references the Issue and lists the AC covered. The teammate reviews it and
   records a specific check, question, finding or reason for approval. Authors never approve their own PRs.
6. When all features are merged, run the full suite on `staging`, open the release PR `staging → main`, review
   it, merge it and tag `v0.1.0`.

If a contract changes during implementation, bump its version, add a row to its version history with the
reason, and update the STS and [traceability.md](../../traceability.md) in the same PR.

## E3. Definition of Done

### Product Definition of Done (applies to every feature, every sprint)

A feature is **done** only when all of the following hold, **with evidence**:

1. **Behavior.** Every AC in its contract is implemented as specified. Any deviation is recorded as a new
   contract version with a reason.
2. **Verification executed.** Every planned test in the STS for those AC exists, has been run on the release
   commit and passes. No required test is skipped, disabled or weakened. Failures and skips are reported, not hidden.
3. **Meaningful tests.** Domain rules have unit tests at their boundaries. Persistence, permissions and
   ownership have API tests against the real database. Critical journeys have E2E tests. Assertions check
   outcomes (status, body and DB state), not just "no exception".
4. **Security.** Protected operations are enforced in the backend (401/403/404 tests exist). No secret,
   password or token appears in the repository, logs, screenshots or client bundle.
5. **Review and integration.** The work was merged into sprint staging through a PR reviewed by the teammate
   with a substantive comment, and integrated into `main` through a reviewed release PR. CI, once SR-02
   exists, is green.
6. **Setup and documents current.** README setup steps, `.env.example`, migrations, seed, contract, STS and
   traceability match the code.
7. **Incomplete work disclosed.** Anything not done is listed under known limitations in the release notes
   and in Part F.

### Sprint 1 completion criteria

- [ ] SR-01, F-01 … F-05 meet the Product DoD.
- [ ] AC-01 – AC-35 → TEST-01 – TEST-41 all pass on the tagged commit. The results table in [sts.md §4](sts.md#4-results-table-fill-in-at-release--part-f) is filled in.
- [ ] TDD evidence (red → green) is retained for at least the BR-03 overlap rule (TEST-22/23) and the ownership rule (TEST-29).
- [ ] The demo journey (TEST-40), a rule rejection (e.g. TEST-23 `PERIOD_UNAVAILABLE`) and a forbidden operation (TEST-29 / TEST-38) are captured as screenshots for Part F.
- [ ] Release PR `staging → main` is merged and `v0.1.0` tagged. The README has local setup, env, migrate/seed, build and test commands.
- [ ] Contribution table and a brief AI-use declaration are prepared for Part F.

## E4. Version history (Sprint 1 contract set)

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-10 | Initial contracts F-01–F-05, STS (TEST-01–41), DoD | Sprint 1 planning |
| 0.2 | 2026-11-12 | F-01 v0.2 (login excluded from the 401 redirect), F-02 v0.1.1, STS v0.2; workflow uses the `staging` branch | PR #3 review |
| 0.2.1 | 2026-11-12 | F-01 v0.2.1 (seed wording), STS v0.2.1 (TEST-25 no longer uses the reject endpoint; header version corrected) | PR #3 review |
| 0.2.2 | 2026-11-13 | F-03 v0.1.1 (purpose limit applies after trimming), STS v0.2.2 (TEST-20 padded case) | F-03 implementation |
