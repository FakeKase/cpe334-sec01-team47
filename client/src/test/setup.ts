import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterAll, afterEach, beforeAll } from "vitest"

import { server } from "./server"

// jsdom has no modal dialog API. This is enough for the reject dialog; the Playwright spec covers the real one.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
	this.open = true
}
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
	this.open = false
	this.dispatchEvent(new Event("close"))
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }))
afterEach(() => {
	cleanup()
	server.resetHandlers()
	sessionStorage.clear()
})
afterAll(() => server.close())
