# F-01 — Authentication and session

| | |
|---|---|
| **Linked requirements** | FR-01, FR-02, FR-03, BR-13 (role guard), NFR-01, NFR-03, NFR-04, NFR-06 |
| **Depends on** | SR-01 (app skeleton, `User`/`Session` tables, seed, test harness) |
| **Sprint** | 1 |
| **Contract version** | 0.1 (draft, 2026-11-10). See [version history](#version-history). |

## 1. Behavior and workflow

1. An anonymous user opens any page. If no token is stored, the SPA routes to `/login`.
2. The user enters an email and password and submits. The client calls `POST /api/auth/login`.
3. The server lower-cases the email and looks up the user. It verifies the password with bcrypt. When the
   email is unknown it still compares against a dummy hash. On success it creates a session and returns
   `{ token, expiresAt, user }`.
4. The client stores the token in `sessionStorage` and loads `GET /api/auth/me` on app start to restore
   identity. It routes Borrowers to `/items` and Custodians to `/requests`.
5. Every API call sends `Authorization: Bearer <token>`. `requireAuth` resolves the session or returns 401.
6. On **Log out**, the client calls `POST /api/auth/logout`, clears `sessionStorage` and routes to `/login`
   even if the call fails. The server deletes the session.
7. When any API call returns 401, the client clears the token and routes to `/login?expired=1`.

This feature also provides the shared middleware used by every later feature:
`requireAuth`, `requireRole(...roles)`, `errorHandler` (NFR-06) and `notFound`.

## 2. Rules, validation and failure cases

| Case | Result |
|---|---|
| Body missing `email` or `password`, `email` not a valid email, or `password` empty / > 200 chars | 400 `VALIDATION_ERROR` with `details` |
| Unknown email **or** wrong password | 401 `INVALID_CREDENTIALS`, message "Invalid email or password." The same body is used in both cases, and no session is created. |
| Email with different letter case (`Borrower1@Example.test`) | Treated as the same account |
| Token missing, not `Bearer`, unknown, expired, or already logged out | 401 `UNAUTHENTICATED`, message "Authentication required." No other data. |
| Expired session encountered | 401, and the expired row is deleted |
| Logout with an invalid token | 401 (the client still clears local state) |
| Authenticated but wrong role on a role-restricted route | 403 `FORBIDDEN` (from `requireRole`) |
| Unhandled exception anywhere | 500 `INTERNAL_ERROR`, "Something went wrong." Stack trace logged on the server only. |

## 3. Permissions

Login is public. `me` and `logout` require any authenticated role. No role restrictions are specific to
this feature, but `requireRole` defined here is used by F-03 and F-05.

## 4. API

### `POST /api/auth/login` (public)

Request:
```json
{ "email": "borrower1@example.test", "password": "••••••••" }
```
200:
```json
{
  "token": "q3V…43-char-base64url…",
  "expiresAt": "2026-11-10T13:00:00.000Z",
  "user": { "id": "uuid", "email": "borrower1@example.test", "displayName": "Borrower One", "role": "BORROWER" }
}
```
Errors: 400 `VALIDATION_ERROR`, 401 `INVALID_CREDENTIALS`.

### `GET /api/auth/me` (authenticated)

200: `{ "user": { "id", "email", "displayName", "role" } }`. Errors: 401 `UNAUTHENTICATED`.

### `POST /api/auth/logout` (authenticated)

204, no body. Errors: 401 `UNAUTHENTICATED`.

### `GET /api/health`, `GET /api/ready` (public; from SR-01)

`{ "status": "ok" }` and `{ "db": "connected" }` (503 `{ "db": "unavailable" }` if `SELECT 1` fails).

## 5. Data

Uses `User` and `Session` exactly as in [system-sds.md §C2](../../system-sds.md#c2-data-design). It is created
by the initial migration in SR-01. **No other schema change.** The seed creates three users with bcrypt
hashes from `SEED_*_PASSWORD`.

## 6. UI

- `/login`: email and password fields with labels, a **Log in** button (disabled while submitting), and an
  error alert with the server message. With `?expired=1`, it shows "Your session has ended. Please log in
  again."
- Header on all signed-in pages: display name, role badge ("Borrower" / "Custodian"), **Log out** button.
- `RequireAuth` route wrapper: no token → `/login`. `RequireRole` wrapper: wrong role → "You are not allowed
  to do this" page. This is cosmetic only; the backend enforces access.

## 7. Acceptance criteria

| AC | Given / When / Then |
|---|---|
| **AC-01** | **Given** the seeded Borrower, **when** they log in with the correct email and password, **then** the response is 200 with a non-empty `token`, an `expiresAt` about 8 h ahead and `user.role = "BORROWER"`, and a `Session` row exists for that user. The same holds for the Custodian with `role = "CUSTODIAN"`. |
| **AC-02** | **When** login uses a wrong password, **or** an email that does not exist, **then** both return 401 `INVALID_CREDENTIALS` with identical bodies, no `token`, and no new `Session` row. |
| **AC-03** | **When** login is sent with a missing password or a malformed email, **then** 400 `VALIDATION_ERROR` lists the offending field. |
| **AC-04** | **Given** a valid token, `GET /api/auth/me` returns 200 with the user and no `passwordHash`. **Given** no token, a garbage token, or a token whose session `expiresAt` is in the past, it returns 401 `UNAUTHENTICATED` and the body contains no `user`. |
| **AC-05** | **Given** a logged-in user, **when** they call logout, **then** the response is 204, the session row is gone, and `GET /api/auth/me` with the same token returns 401. |
| **AC-06** | **For every** protected Sprint 1 endpoint (`/api/auth/me`, `/api/auth/logout`, `GET /api/items`, `GET /api/items/:id`, `POST /api/requests`, `GET /api/requests`, `GET /api/requests/:id`, `POST /api/requests/:id/approve`, `POST /api/requests/:id/reject`), a request without a token returns 401 and no domain data (NFR-01). |
| **AC-07** | Stored passwords are bcrypt hashes (`$2…`) that differ from the plaintext and verify with `bcrypt.compare`. `Session.tokenHash` is a 64-char hex SHA-256 that differs from the returned token. The plaintext token is not stored anywhere. |
| **AC-08** | **When** a route throws an unexpected error, **then** the response is 500 `{ "error": { "code": "INTERNAL_ERROR", "message": "Something went wrong." } }` with no `stack`, SQL or file paths. |
| **AC-09** | **UI:** a wrong password shows "Invalid email or password." and stays on `/login`. A correct login shows the name and role in the header. **Log out** returns to `/login`, and then opening `/my-requests` redirects to `/login`. |

Tests: see [sts.md](sts.md) (TEST-01 to TEST-11).

## Version history

| Version | Date | Change | Reason |
|---|---|---|---|
| 0.1 | 2026-11-10 | Initial contract | Sprint 1 planning |
