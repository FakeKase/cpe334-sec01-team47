# F-14 — Loan report (CSV export)

| | |
|---|---|
| **Linked requirements** | FR-21, BR-13, NFR-02, NFR-06, NFR-11, NFR-12, NFR-13 |
| **Depends on** | F-07 (checkout and return data), F-08 (overdue), F-09 (item and category names) |
| **Sprint** | 3 |
| **Contract version** | 0.1 (draft, 2026-11-28). See [version history](#version-history). |

## 1. Behavior and workflow

1. A Custodian opens **Reports** (`/reports`) from the header, picks **From** and **To** dates and presses **Download CSV**.
2. The client calls `GET /api/reports/requests.csv?from=&to=` with the Bearer token and saves the response as a file.
   A plain link cannot send the token, so the client reads the response and offers it as a download.
3. The server returns one row per request whose **loan period overlaps** `[from, to]`, both ends inclusive: its
   `startDate` is on or before `to`, and its `dueDate` is on or after `from`. The report covers every status.

**Decision to confirm in review:** "within a date range" (FR-21) is taken as "the loan period touches the range", so a
loan that starts before the range and ends inside it is included. Filtering by the day a request was submitted is the
alternative, and it would change this rule only.

## 2. Rules, validation and failure cases

| Case | Result |
|---|---|
| Valid range with requests | 200, `text/csv`, a header row and one row per request |
| Valid range with none | 200, the header row only |
| `from` or `to` missing, or not `YYYY-MM-DD` | 400 `VALIDATION_ERROR`, field `from` or `to` |
| `to` before `from` | 400, field `to`, "To must be on or after From." |
| A range longer than 366 days | 400, field `to`, "The range can be at most 366 days." |
| Borrower | 403 `FORBIDDEN` (BR-13), and **no row** in the body |
| No or invalid token | 401 `UNAUTHENTICATED` |

A failed call answers with the usual JSON error (NFR-06), not with CSV.

### The file

- **Encoding:** UTF-8 with a byte order mark, so Excel shows Thai text correctly. **Line ends:** CRLF. Every row,
  including the last, ends with CRLF.
- **Headers and name:** `Content-Type: text/csv; charset=utf-8` and
  `Content-Disposition: attachment; filename="loans_<from>_<to>.csv"`.
- **Quoting (RFC 4180):** a field that contains a comma, a double quote, CR or LF is wrapped in double quotes, and
  each double quote inside is doubled. Other fields are written as they are.
- **Formula guard:** a text field that starts with `=`, `+`, `-` or `@` (or a tab or CR) is written with a single
  quote in front, so a spreadsheet never runs it. The purpose and the notes come from users, so this applies to
  `purpose`, `returnNote`, `rejectionReason` and the names.
- **Order:** by `startDate`, then `createdAt`, then `requestId`, so the file is the same for the same data.
- **Dates** are `YYYY-MM-DD`, **timestamps** ISO-8601 in UTC. A missing value is an empty field.

| Column | Value |
|---|---|
| `requestId` | the request id |
| `assetTag`, `itemName`, `category` | the item and its category |
| `borrower` | the Borrower's display name (no e-mail address) |
| `status` | `PENDING` … `RETURNED` |
| `startDate`, `dueDate` | the loan period |
| `purpose` | the purpose |
| `createdAt` | when it was submitted |
| `decidedBy`, `decidedAt`, `rejectionReason` | the decision |
| `cancelledAt` | when it was cancelled |
| `checkedOutBy`, `checkedOutAt` | the hand-over |
| `returnedTo`, `returnedAt`, `returnCondition`, `returnNote` | the return |
| `overdue` | `true` or `false` (the F-08 rule, as of today) |

## 3. Permissions

| Operation | Anonymous | Borrower | Custodian |
|---|---|---|---|
| `GET /api/reports/requests.csv` | 401 | 403 | ✅ |
| `/reports` page and header link | to `/login` | "You are not allowed to do this", no link | ✅ |

## 4. API

### `GET /api/reports/requests.csv?from=<date>&to=<date>` (Custodian)

200: the file described in §2. Errors: 400, 401, 403 (JSON). The route is read-only and changes nothing.

## 5. Data

Read-only, **no schema change**. One query with joins over `BorrowRequest`, `Item`, `Category` and `User`, bounded by
the 366-day limit. The response is built in memory, which is acceptable for the size of this product (NFR-11 in
SR-03 measures a full year with 5,000 requests).

## 6. UI

- `/reports`, heading "Reports". **From** and **To** (`type="date"`, labelled), both required, and **Download CSV**
  (primary).
- Client checks mirror §2 and appear under the fields. The button is disabled while the download runs and reads
  "Preparing…".
- On success the browser saves the file, and a toast says "Report downloaded". On a server error an alert shows the
  message, and the dates stay.
- At 360 px the fields stack (NFR-12). Labels, keyboard access and visible focus as everywhere else (NFR-13).
- The header gets a **Reports** link for the Custodian only.

## 7. Acceptance criteria

| AC | Given / When / Then |
|---|---|
| **AC-106** | **Given** requests in several statuses with known values, **when** a Custodian downloads the report for a range that contains all of them, **then** 200, `Content-Type` starts with `text/csv`, the file begins with the byte order mark and the 21 header names in §2 in that order, and each request is one row whose values equal the stored ones. Rows are ordered by `startDate`, `createdAt`, `requestId`. A range with no request gives the header row only. |
| **AC-107** | **Range rule.** For a range 20–22 Nov, a request 18–20 Nov, 22–24 Nov and 21–21 Nov is included, and one 17–19 Nov and one 23–25 Nov is not. A loan that spans the whole range is included. |
| **AC-108** | **Quoting.** A purpose containing a comma, a double quote and a line break, and a Thai text, come out as one field, quoted with the quotes doubled. The file parses with a standard CSV reader back to the stored text, with the same number of columns on every row. |
| **AC-109** | **Formula guard.** A purpose of `=1+1`, `+cmd`, `-2` and `@SUM(A1)` is written with a leading single quote. The text of an ordinary purpose is unchanged. |
| **AC-110** | **When** `from` or `to` is missing or malformed, `to` is before `from`, or the range is 367 days, **then** 400 `VALIDATION_ERROR` naming the field and a JSON body. A range of exactly 366 days is accepted. |
| **AC-111** | **When** a Borrower calls it, **then** 403 with no row. No token → 401. Neither response is CSV. |
| **AC-112** | **UI:** a Custodian chooses two dates and downloads the file. The button is disabled meanwhile. A server error shows its message and keeps the dates. A Borrower has no **Reports** link and is not allowed on `/reports`. |
| **AC-113** | **Journey (E2E):** a Custodian downloads the report for a range that holds a known request, and the saved file contains that request's asset tag and purpose. |

Tests: see [sts.md](sts.md) (TEST-126 to TEST-134).

## 8. Definition of Done

1. Every AC above is implemented, and a deviation is a new contract version.
2. Every STS test for F-14 exists, ran on the release commit and passes, with none skipped or weakened.
3. The CSV writer is a small unit-tested function (quoting, the formula guard, the BOM and CRLF), and the API tests
   parse the real response with a CSV reader, not with string matching.
4. The role check is in the backend, and a test proves a Borrower gets no row (BR-13, NFR-02).
5. The NFR-11 check in SR-03 includes this endpoint for a full year.
6. The PR was reviewed by the other student and CI is green. The contract, STS and traceability match the code.

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-28 | Initial contract | Sprint 3 planning |
