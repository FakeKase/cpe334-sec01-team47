import { setupServer } from "msw/node"

/** Mocked API for component tests (STS §1). Each test adds its own handlers with `server.use(...)`. */
export const server = setupServer()
