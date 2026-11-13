import { Elysia } from "elysia"

import { AppError, type ErrorDetail } from "../errors"

const body = (code: string, message: string, details?: ErrorDetail[]) => ({
	error: { code, message, ...(details && { details }) },
})

/** Maps every failure to `{ error: { code, message, details? } }` and never leaks internals (NFR-06). */
export const errorHandler = new Elysia({ name: "errorHandler" })
	.error({ APP_ERROR: AppError })
	.onError({ as: "global" }, ({ code, error, set }) => {
		if (error instanceof AppError) {
			set.status = error.status
			return body(error.code, error.message, error.details)
		}
		if (code === "NOT_FOUND") {
			set.status = 404
			return body("NOT_FOUND", "Not found.")
		}
		if (code === "VALIDATION" || code === "PARSE") {
			set.status = 400
			return body("VALIDATION_ERROR", "The request is invalid.", validationDetails(error))
		}
		console.error(error) // stack stays on the server
		set.status = 500
		return body("INTERNAL_ERROR", "Something went wrong.")
	})

function validationDetails(error: unknown): ErrorDetail[] {
	const all = (error as { all?: { path?: string; message?: string; summary?: string }[] }).all
	if (!Array.isArray(all)) return []
	return all.map((i) => ({
		field: (i.path ?? "").replace(/^\//, "").replaceAll("/", "."),
		message: i.message ?? i.summary ?? "Invalid value.",
	}))
}
