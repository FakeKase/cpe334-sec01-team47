# CR-01 — Approving a request rejects the overlapping pending requests

| | |
|---|---|
| **Change ID** | CR-01 (Lab 7 change request) |
| **Date** | 2026-11-28 |
| **Proposed by** | FakeKase |
| **Feature changed** | F-05 Review requests (approve) |
| **Requirements** | FR-09, BR-03, BR-06, NFR-05 |
| **Status** | Contract revised (v0.3). Awaiting teammate review of the contract. Not implemented. |

## 1. What is being changed

A Sprint 1 behavior that already works and is already tested: **what happens to competing pending requests when a
Custodian approves one of them.**

### Old rule (accepted Sprint 1 baseline)

> Other overlapping `PENDING` requests are **not** changed automatically when one is approved. Approving any of
> them later fails with `PERIOD_UNAVAILABLE`, and the Custodian then rejects it with a reason.
> *(F-05 contract v0.1/v0.2 §1)*

> Overlapping `PENDING` requests from different borrowers may coexist, but only one of them can be approved.
> *(SRS BR-03)*

> Competing requests are allowed and the custodian picks one. *(SRS Q-02)*

| Where the old rule is tested | What it asserts |
|---|---|
| TEST-33 / AC-29 | After A is approved, approving the overlapping B → 409 `PERIOD_UNAVAILABLE`, and B stays `PENDING` |
| TEST-39 / AC-34 | Two overlapping approvals sent at once → one 200 and one 409 `PERIOD_UNAVAILABLE`, ten times |

### New rule

> When a Custodian approves request **A** on item **X**, the server, **in the same transaction**, sets every other
> request on X that is `PENDING` and whose period **overlaps** A's period (both ends inclusive, the existing
> `periodsOverlap` rule) to `REJECTED`, with `rejectionReason = "Item booked by another request."`,
> `decidedById` = the approving Custodian and `decidedAt` = now.
> Requests of other items, requests that do not overlap, and requests in any other status are not touched.
> The approve response gains `autoRejectedCount`. Cancelling A later does **not** bring them back.

### Why

Under the old rule a Borrower whose request can no longer be approved still sees **Pending** until a Custodian
rejects it by hand. The Custodian queue fills with requests that can only fail, and each one needs a manual
rejection with a reason. The team decided that approving a request should settle the requests it conflicts
with, and tell their Borrowers at once. (This is a deliberate change to the decision recorded in SRS Q-02.)

## 2. Baseline, pre-change version and scope

| | |
|---|---|
| **Accepted Sprint 1 baseline** | tag `v0.1.0` (`e8e1a90`, the Sprint 1 release, 2026-11-15) and `v0.1.1` (`95b88cf`, the release tested in Lab 6). The old behavior exists in both. |
| **Actual pre-change implementation** | `staging` at `c2edf1b` (2026-11-28). `approve` in `server/src/services/requestService.ts` was last changed by F-08 (overdue loans extend BR-03). The red test is run on this commit, and the exact commit is recorded with the output. |
| **Approved by** | Both students, on this change request. Proposer: FakeKase, 2026-11-28. Reviewer: gxjakkap (the review of the revised contract is the PR for this document, and it comes **before** any test or code commit). The class announcement removed the instructor approval step. |
| **In scope** | The approve operation, its response, the Custodian page's reaction, the Borrower's view of the result, and the documents and tests that state the old rule |
| **Out of scope** | Reject, cancel, checkout and return (no automatic effects), request creation (BR-03 at creation is unchanged), notifications, the choice of *which* request wins (still the one the Custodian approves), undoing an automatic rejection |

## 3. Boundaries, invalid cases and access

| Case | Expected result |
|---|---|
| A is 20–22 Nov. B is 21–23 (overlaps), C is 22–24 (touches the last day), D is 23–25 (starts the day after), E is 18–19 (ends before), F is 19–20 (touches the first day) | B, C and F are rejected automatically. D and E stay `PENDING`. `autoRejectedCount` is 3. |
| Overlapping `PENDING` request on **another item** | Untouched |
| An overlapping request that is `APPROVED`, `CHECKED_OUT`, `REJECTED`, `CANCELLED` or `RETURNED` | Untouched. An overlapping `APPROVED` or `CHECKED_OUT` request makes the approval itself fail (BR-03, unchanged). |
| The approval fails (not pending, item under maintenance, period ended, `PERIOD_UNAVAILABLE`) | **Nothing else changes.** No request is rejected. |
| Borrower calls approve | 403, and no request changes (BR-13, unchanged) |
| Approve a request that was rejected automatically | 409 `INVALID_TRANSITION`, unchanged |
| Two overlapping approvals at the same moment | One 200. The other request was rejected by the first, so it gets 409 `INVALID_TRANSITION` (before: `PERIOD_UNAVAILABLE`). |
| Cancel the approved request later | The automatically rejected requests stay `REJECTED`. The Borrowers ask again. |
| Existing overlapping `PENDING` requests created before the change | No migration. The new rule applies to them the next time one of them is approved. |

## 4. Acceptance criteria

Defined in [F-05 v0.3 §7](../sprints/sprint-1/F-05-review-requests.md#7-acceptance-criteria): **AC-121 to AC-127** are
new, and **AC-29** and **AC-34** are revised. Tests: **TEST-142 to TEST-148** are new, and **TEST-33** and **TEST-39**
are revised, in [the Sprint 1 STS](../sprints/sprint-1/sts.md).

## 5. Impact analysis

| Requirement | Feature | Document sections that change | AC | STS tests | Code | Decision |
|---|---|---|---|---|---|---|
| FR-09 approve | F-05 | F-05 §1, §2, §4, §7; features.md F-05 row | AC-28 (kept), AC-121 to AC-127 (new) | TEST-32 (kept), TEST-142 to TEST-148 | `requestService.approve` (same transaction, same item lock), `requests.ts` route (response shape) | **Changes** |
| BR-03 | F-05 | SRS BR-03 (sentence on coexisting pending requests); SRS Q-02 note | AC-29, AC-34 (revised) | TEST-33, TEST-39 (revised) | `requestService.approve` | **Changes**: the creation check and the approve check for `APPROVED` and `CHECKED_OUT` stay |
| BR-06 transitions | F-05 | none: `PENDING → REJECTED` is already in the table | AC-32 | TEST-36, TEST-37 | `domain/transitions.ts` unchanged | **Unchanged** |
| BR-07 reason 1 to 500 characters | F-05 | none | AC-31 | TEST-35 | The automatic reason is a fixed 35-character constant | **Unchanged**: the manual reject still validates its reason |
| NFR-05 no double booking | F-05 | F-05 §2 row on concurrent approvals | AC-34 (revised) | TEST-39 (revised) | The item `FOR UPDATE` lock already serializes approvals, and the automatic rejection runs inside it | **Changes the second response**, not the guarantee |
| BR-05 active limit | F-03 | none (rule text) | AC-21 | TEST-25 | none | **Unchanged**, but an automatic rejection frees one slot of that Borrower (AC-124) |
| BR-13 / BR-14 roles and ownership | F-05, F-04 | none | AC-33, AC-25 | TEST-38, TEST-29 | `requireRole("CUSTODIAN")` unchanged. The automatically rejected Borrower reads their own request as before. | **Unchanged**, with a new check that a refused approve changes nothing (AC-123) |
| FR-07 My requests | F-04 | none | AC-24, AC-26 | TEST-28, TEST-30 | The existing "Reason: …" line already shows `rejectionReason` | **Unchanged** UI. Shown by AC-124 |
| F-06 cancel, F-07 checkout, F-08 overdue | F-06 to F-08 | none | AC-36 to AC-76 | existing | They only read `APPROVED` and `CHECKED_OUT`. None of them calls `approve`. | **Unchanged**, with AC-125 for "cancel does not reinstate" |
| F-11 catalog free filter (not built) | F-11 | none | AC-86 | TEST-104 | It only reads `APPROVED` and `CHECKED_OUT` | **Unchanged** |
| UI | F-05 | F-05 §6 (new toast text, list reload) | AC-126 | TEST-147 | `client/src/pages/Requests.tsx` | **Changes** |
| UAT guide | Lab 6 handoff | `docs/uat.md`: UAT-45 would change | n/a | n/a | n/a | **Not edited now.** The UAT team is testing release `v0.1.1` under guide 0.2. The guide for the release that carries this change gets the new UAT-45 expectation, and the UAT team is told in writing before that release is deployed. |
| Data and migration | | SDS data section | n/a | n/a | none | **Not applicable**: `rejectionReason`, `decidedById` and `decidedAt` already exist, and no new status is added |
| Historical data | | | n/a | n/a | none | **Not applicable**: nothing is rewritten. Old overlapping pending requests are handled on the next approval (§3). |
| API validation | | F-05 §4 | AC-121 | TEST-142 | The approve route has no body, so no new validation | **Not applicable**: only the response gains a field |

### What must stay unchanged, and what protects it

| Existing behavior | Protected by |
|---|---|
| Approve with no overlapping pending request: 200, `decidedBy`, `decidedAt` | TEST-32 (and TEST-146 for `autoRejectedCount = 0`) |
| `ITEM_NOT_AVAILABLE` when the item went to maintenance | TEST-34 |
| `PERIOD_UNAVAILABLE` when an `APPROVED` or `CHECKED_OUT` request overlaps (also the overdue extension) | TEST-33 (second case), TEST-87 (F-08), TEST-144 |
| Manual reject with a reason | TEST-35 |
| Transition table | TEST-36, TEST-37 |
| Borrower cannot approve | TEST-38, TEST-144 |
| Creation refused when an approved period overlaps | TEST-23 |
| At most one `APPROVED` per overlapping period under concurrency | TEST-39 (revised), TEST-146 |
| Full server and client suites | Run on the pre-change commit (all pass) and again after the change. A failing test other than TEST-33 and TEST-39 is investigated and is either a legitimate versioned revision or a defect. |

## 6. Order of work (what the git history must show)

1. This change request and the revised contract, STS and traceability, in one docs PR, **reviewed by the teammate**.
2. The tests for the new behavior, and the revised TEST-33 and TEST-39, run against the pre-change commit. The
   failure output and the commit are kept.
3. The implementation, in a later commit.
4. PR into `staging` with review and CI, then a reviewed release to `main` and the deployment, then checks of the
   changed behavior and of one preserved behavior (the Borrower is refused approve, and approve with no overlap).

## 7. Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-11-28 | Change request and impact analysis |
