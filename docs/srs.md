# Part A — Software Requirements Specification (SRS)

**Product:** Inventory and Borrowing System (ระบบคลังอุปกรณ์และยืม-คืน)
**Team:** CPE 334 Section 01, Team 47
**Document version:** 0.1 (draft, 2026-11-10). See [Version history](#a8-version-history).

---

## A1. Stakeholder problem and context

### Chosen context

The system serves the **Computer Engineering equipment room** of a university department. The room lends
individually asset-tagged equipment to students and staff. Typical items are microcontroller boards,
Raspberry Pi kits, oscilloscopes, multimeters, logic analysers, cameras and portable projectors.

### Current situation (problem)

Loans are currently tracked in a paper logbook and a group chat. This causes four recurring failures:

1. **Double lending.** Two students are promised the same oscilloscope for the same lab day because nobody
   can see existing commitments.
2. **No single record of who holds what.** When an item is missing, the custodian must search chat history.
3. **Overdue items are not chased.** Nothing flags a loan that passed its due date.
4. **Broken items go back on the shelf.** Damage reported verbally at return time is forgotten, and the
   next borrower receives a faulty item.

### Goal

Replace the logbook with a web application that lets borrowers request equipment for a date range. It lets
the custodian approve requests without double-booking any unit. It records hand-over and return of each item
and makes overdue and damaged items visible.

---

## A2. Actors and responsibilities

| Actor | Description | Responsibilities in the system | Introduced |
|---|---|---|---|
| **Borrower** | A student or staff member who borrows equipment. | Browse the catalog, submit borrow requests, track and cancel their own requests, return items on time. | Sprint 1 |
| **Custodian** | Equipment-room staff who own the inventory. | Review (approve/reject) requests, hand items over (checkout), receive returns and record condition, manage items and categories, follow up overdue loans. | Sprint 1 |
| **System** | The application itself. | Enforce business rules, compute availability and overdue status, keep an auditable record of every decision. | Sprint 1 |

Accounts are **seeded** (see [system-sds.md §C2.4](system-sds.md#c24-seed-data)). A person has exactly one
role. A Custodian account cannot submit borrow requests, and a Borrower account cannot perform custodian
operations.

---

## A3. Product scope

### In scope

- Login, logout and current-user identity for the two roles.
- A catalog of individually tracked equipment **items**. Each item has a unique asset tag and belongs to one **category**.
- Borrow **requests** for one item over an inclusive date range. Each request passes through a lifecycle:
  `PENDING → APPROVED → CHECKED_OUT → RETURNED`, with `REJECTED` and `CANCELLED` as terminal exits.
- Conflict-free approval: an item never has two approved or checked-out loans with overlapping periods.
- Checkout (hand-over) and return, with the return condition recorded. A damaged item goes to maintenance automatically.
- Overdue detection and blocking of new requests from borrowers who have overdue items.
- Custodian inventory management (items, item status, categories).
- Item loan history, a custodian dashboard and a CSV loan report.

### Explicit exclusions (out of scope)

| Excluded | Reason |
|---|---|
| Self-registration, password recovery, account administration UI | Not required by the course; accounts are seeded. |
| Email / LINE / push notifications | External messaging services are out of scope (Lab 5 §4.2). Status is visible in the app. |
| Fines, deposits or any payment | No payment services. |
| Consumables tracked by quantity (resistors, wires) | Only individually asset-tagged units are tracked. |
| Barcode / QR scanning hardware | The asset tag is typed or selected. |
| Waitlists and automatic re-allocation | A rejected or conflicting request is simply rejected. The borrower may choose other dates. |
| Multiple equipment rooms / departments | A single location is assumed. |
| Photo or file uploads | Avoids file storage. A text description and a condition note are enough. |
| Native mobile app | The responsive web UI covers mobile use. |

---

## A4. Functional Requirements (FR)

Each FR states observable behavior. "Active request" means status `PENDING`, `APPROVED` or `CHECKED_OUT`.

| ID | Requirement | Actor | Sprint |
|---|---|---|---|
| **FR-01** | A user can log in with email and password. On success, the system creates a session and returns a session token together with the user's id, display name and role. | Borrower, Custodian | 1 |
| **FR-02** | A logged-in user can log out. The session is invalidated on the server, so the same token is rejected afterwards. | Borrower, Custodian | 1 |
| **FR-03** | A logged-in user can retrieve their current identity (id, email, display name, role). | Borrower, Custodian | 1 |
| **FR-04** | A logged-in user can browse the catalog of non-retired items. Each item shows name, asset tag, category, item status and whether it is available today. The list can be filtered by category. | Borrower, Custodian | 1 |
| **FR-05** | A logged-in user can open an item's detail page. It shows the description, location and the periods already committed (approved or checked-out) from today onward. Borrower identities are not shown to Borrowers. | Borrower, Custodian | 1 |
| **FR-06** | A Borrower can submit a borrow request for one item with a start date, a due date and a purpose. The request is stored with status `PENDING` and is owned by the logged-in Borrower. | Borrower | 1 |
| **FR-07** | A Borrower can list and open their own requests, with item, dates, status and (if rejected) the rejection reason. | Borrower | 1 |
| **FR-08** | A Custodian can list all requests, filter them by status, and view a pending-request queue ordered oldest first with the borrower's name. | Custodian | 1 |
| **FR-09** | A Custodian can approve a `PENDING` request. The system records who decided and when. | Custodian | 1 |
| **FR-10** | A Custodian can reject a `PENDING` request with a reason. The reason is visible to the Borrower. | Custodian | 1 |
| **FR-11** | A Borrower can cancel their own request while it is `PENDING` or `APPROVED`. | Borrower | 2 |
| **FR-12** | A Custodian can record the checkout (hand-over) of an `APPROVED` request. The request becomes `CHECKED_OUT`. | Custodian | 2 |
| **FR-13** | A Custodian can record the return of a `CHECKED_OUT` request with a condition (`GOOD` or `DAMAGED`) and an optional note. The request becomes `RETURNED`. | Custodian | 2 |
| **FR-14** | The system shows a `CHECKED_OUT` request as **overdue** when today is after its due date. Custodians can list all overdue loans, and Borrowers see an overdue flag on their own loans. | System, Custodian, Borrower | 2 |
| **FR-15** | A Custodian can create and edit items (asset tag, name, category, description, location). | Custodian | 2 |
| **FR-16** | A Custodian can change an item's status between `ACTIVE` and `MAINTENANCE`, and can retire it (`RETIRED`). | Custodian | 2 |
| **FR-17** | A Custodian can create and rename categories. | Custodian | 3 |
| **FR-18** | A logged-in user can search the catalog by keyword (name or asset tag) and filter to items free for a chosen date range. | Borrower, Custodian | 3 |
| **FR-19** | A Custodian can view the complete loan history of an item. | Custodian | 3 |
| **FR-20** | A Custodian sees a dashboard with counts of pending requests, checkouts due to start today, loans due today, overdue loans and items in maintenance. | Custodian | 3 |
| **FR-21** | A Custodian can download a CSV report of requests within a date range. | Custodian | 3 |

---

## A5. Business Rules (BR)

All dates are calendar dates in the **Asia/Bangkok** timezone. Loan periods are **inclusive**: a loan from
10 Nov to 12 Nov occupies 10, 11 and 12 Nov. "Today" is the server's current date in Asia/Bangkok.

| ID | Rule | Enforced when | Sprint |
|---|---|---|---|
| **BR-01** | **Valid loan period.** The start date must be today or later. The due date must be on or after the start date. The period (due − start + 1) is at most **14 days**. | Request creation | 1 |
| **BR-02** | **Only active items are lendable.** A request can be created or approved only for an item whose status is `ACTIVE`. Items in `MAINTENANCE` or `RETIRED` are rejected. | Creation, approval | 1 |
| **BR-03** | **No double booking.** A request cannot be created or approved if its period overlaps the period of any `APPROVED` or `CHECKED_OUT` request for the same item. A `CHECKED_OUT` loan that is overdue occupies the item until it is returned: its effective end is `max(dueDate, today)`. Overlapping `PENDING` requests from different borrowers may coexist, but only one of them can be approved. | Creation, approval | 1 (overdue extension: 2) |
| **BR-04** | **No duplicate request.** A Borrower cannot create a request whose period overlaps one of their *own* active requests for the same item. | Creation | 1 |
| **BR-05** | **Active request limit.** A Borrower may hold at most **3** active requests at any time. | Creation | 1 |
| **BR-06** | **Lifecycle transitions.** Only these transitions are allowed: `PENDING→APPROVED`, `PENDING→REJECTED`, `PENDING→CANCELLED`, `APPROVED→CHECKED_OUT`, `APPROVED→CANCELLED`, `CHECKED_OUT→RETURNED`. Every other transition is refused and leaves the request unchanged. `REJECTED`, `CANCELLED` and `RETURNED` are final. A `PENDING` request whose due date has already passed can no longer be approved, only rejected. | Every state change | 1 (approve/reject), 2 (rest) |
| **BR-07** | **Rejection needs a reason** of 1–500 characters after trimming. | Rejection | 1 |
| **BR-08** | **Overdue borrowers are blocked.** A Borrower who holds any overdue loan cannot create new requests until it is returned. | Request creation | 2 |
| **BR-09** | **Checkout window.** An approved request can be checked out only when today is between its start date and due date inclusive. An approved request whose due date has passed without checkout can only be cancelled. | Checkout | 2 |
| **BR-10** | **Damage goes to maintenance.** Returning an item with condition `DAMAGED` sets the item's status to `MAINTENANCE` in the same transaction. | Return | 2 |
| **BR-11** | **Safe retirement.** An item cannot be retired while it has an `APPROVED` or `CHECKED_OUT` request. When an item is retired, its `PENDING` requests are rejected automatically with the reason "Item retired". Putting an item into `MAINTENANCE` does not cancel existing approved loans, but BR-02 blocks new approvals. | Item status change | 2 |
| **BR-12** | **Unique asset tag.** Asset tags are unique (case-insensitive) and match `^[A-Z]{2,5}-\d{3,5}$` (for example `CPE-0042`). | Item create/edit | 2 |
| **BR-13** | **Role separation.** Only Borrowers create and cancel requests. Only Custodians approve, reject, check out, return and manage inventory. | Every protected operation | 1 |
| **BR-14** | **Ownership.** A Borrower can read and act only on their own requests. Another borrower's request is treated as non-existent. | Every request read/action | 1 |

---

## A6. Non-Functional Requirements (NFR)

| ID | Requirement and measurable target | Verification method | Sprint |
|---|---|---|---|
| **NFR-01** | **Authentication required.** Every endpoint except `/api/health`, `/api/ready`, `GET /api/categories` and `POST /api/auth/login` returns **401** to a request with a missing, malformed, unknown, expired or logged-out token. The response body contains no domain data. | Parameterised API test over the route list | 1 |
| **NFR-02** | **Authorization in the backend.** Role-restricted operations return **403**. Another borrower's request returns **404**. In both cases no data changes. Frontend hiding is cosmetic only. | API tests per role/ownership case | 1 |
| **NFR-03** | **Password storage.** Passwords are stored only as bcrypt hashes (cost ≥ 12 in production). No plaintext password appears in the database, logs, API responses or repository. | Unit test + DB integration test + repo/secret scan | 1 |
| **NFR-04** | **Session lifetime.** A session expires **8 hours** after login (configurable). Logout deletes it on the server. Session tokens have ≥ 256 bits of randomness and are stored only as SHA-256 hashes. | API tests (expired + logged-out token), DB inspection test | 1 |
| **NFR-05** | **No double booking under concurrency.** When two overlapping pending requests for the same item are approved concurrently, exactly one becomes `APPROVED`. The other receives 409 and stays `PENDING`. | API integration test firing parallel approvals | 1 |
| **NFR-06** | **Safe errors.** Every error response uses the JSON shape `{ "error": { "code", "message", "details?" } }`. Unexpected errors return 500 with code `INTERNAL_ERROR` and never include stack traces, SQL or secrets. | API test with a forced internal error | 1 |
| **NFR-07** | **Persistence.** All data (users, sessions, items, requests) lives in PostgreSQL. Data created before an application restart and a redeploy is still present afterwards. | Lab 5 check C-05 (before/after screenshots) | 2 |
| **NFR-08** | **Configuration and secrets.** Every setting comes from environment variables listed in `.env.example`. No real secret is committed, baked into the image, or shipped in the client bundle. | Fresh-clone build (Lab 5 C-03), GitHub secret scanning, review | 2 |
| **NFR-09** | **Quality gate.** Every PR into `staging` or `main` runs build, migrations, seed and all automated tests in CI. A failing required check blocks the merge. | Lab 5 checks C-01, C-02 | 2 |
| **NFR-10** | **Traceable releases.** The running service reports its release commit SHA at `/api/health`, and the SHA matches the deployed image tag. | Smoke test + Lab 5 C-06 | 2 |
| **NFR-11** | **Performance.** With 500 items and 5,000 requests seeded, `GET /api/items` and `GET /api/requests` respond with p95 < **500 ms** locally (50 sequential calls). | Scripted timing check | 3 |
| **NFR-12** | **Responsive UI.** All screens are usable at **360 px** width with no horizontal scrolling. | Playwright mobile-viewport E2E + manual check | 3 |
| **NFR-13** | **Accessibility basics.** Every form control has a label. All actions are keyboard-reachable. Automated axe scan reports no *serious/critical* violations on main screens. | Playwright + axe-core | 3 |
| **NFR-14** | **Login throttling.** After 5 failed logins for the same email within 15 minutes, further attempts get **429** for the rest of the window. | API test | 3 |

---

## A7. Assumptions, decisions, questions and resolutions

### Assumptions

| ID | Assumption |
|---|---|
| AS-01 | One equipment room, one timezone (Asia/Bangkok). Loans are counted in whole days, so no time-of-day booking is needed. |
| AS-02 | Every lendable thing is an individually asset-tagged unit. Several identical boards are separate items. |
| AS-03 | Hand-over and return happen in person at the counter. The custodian records them in the system at that moment. |
| AS-04 | Seeded accounts are enough for the course (Deliverable 1 §2). Demo passwords come from environment variables or Secret Manager. |
| AS-05 | The UI language is English. The Thai product name appears in the title and headings. Full Thai localisation is not in scope. |

### Design decisions

| ID | Decision | Alternatives considered | Rationale |
|---|---|---|---|
| DD-01 | Use the course reference stack: React (Vite) + Express on Node.js 24 + Prisma + PostgreSQL 16, packaged in one container. | Separate frontend hosting; other frameworks | Matches the Lab 5 starter kit, CI and GCP scripts. Lowest delivery risk. |
| DD-02 | Model **items** as individual units with a separate **request** entity that carries the lifecycle. Item status (`ACTIVE`/`MAINTENANCE`/`RETIRED`) is separate from loan state. "On loan" is derived. | A single `status` field on the item (`AVAILABLE`/`ON_LOAN`) | Date-range bookings need history and future commitments, which a single item flag cannot express. |
| DD-03 | Use **opaque server-side session tokens** returned in the login JSON and sent as `Authorization: Bearer`. The token is stored in the DB as a SHA-256 hash. Logout deletes the session row. | JWT; httpOnly cookie sessions | The kit's smoke test expects a `token` field with Bearer auth. Opaque tokens allow real logout, and sessions in the DB survive redeploys (Lab 5 recommendation). |
| DD-04 | The client keeps the token in `sessionStorage`. XSS exposure is reduced by React escaping, no `dangerouslySetInnerHTML`, and a strict Content-Security-Policy via `helmet`. | `localStorage`; cookie | The token is cleared when the tab closes. The cookie alternative would require CSRF handling. Trade-off accepted for course scope. |
| DD-05 | Check overlap and limits in the application inside a DB transaction that **locks the item row** (`SELECT … FOR UPDATE`). Transitions use a conditional update (`WHERE status = 'PENDING'`). | PostgreSQL exclusion constraint with `daterange` | Simpler to test and to explain. An exclusion constraint may be added in Sprint 3 hardening as defence in depth. |
| DD-06 | Overdue status is **derived on read** (`CHECKED_OUT` and today > dueDate) and not stored. | Nightly scheduled job | No scheduler is needed on Cloud Run with scale-to-zero, and the value cannot become stale. |
| DD-07 | Business-rule violations return **409** with a specific error code. Malformed input and BR-01/BR-07 field rules return **400** `VALIDATION_ERROR` with per-field details. | 422 for all rule errors | Keeps "your input is wrong" apart from "the current state forbids this". |
| DD-08 | A borrower who asks for another borrower's request gets **404**, not 403. | 403 | Does not reveal that the request exists (BR-14). |
| DD-09 | `GET /api/categories` is public. | Require authentication | Non-sensitive reference data that the Lab 5 smoke test uses to prove migrate + seed worked. |

### Questions and resolutions

| ID | Question | Resolution |
|---|---|---|
| Q-01 | Can a Custodian borrow equipment? | No. A person who needs both roles gets two accounts (BR-13). Revisit if stakeholders object. |
| Q-02 | Should overlapping pending requests be blocked at creation? | No. Only approved/checked-out periods block creation (BR-03). Competing requests are allowed and the custodian picks one. A borrower's own duplicates are blocked (BR-04). |
| Q-03 | What happens to approved loans when an item goes to maintenance? | They stay approved. The custodian decides whether to cancel them. New approvals are blocked (BR-02). Retirement is stricter (BR-11). |
| Q-04 | Maximum loan length and active-request limit? | 14 days and 3 active requests (BR-01, BR-05). These are configurable constants. Confirm the values with the stakeholder. |
| Q-05 | Is a separate Admin role needed? | Not for this product. Accounts are seeded and advanced account administration is excluded. |

---

## A8. Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-10 | Team 47 | Initial SRS: context, actors, scope, FR-01–21, BR-01–14, NFR-01–14, assumptions and decisions. |
