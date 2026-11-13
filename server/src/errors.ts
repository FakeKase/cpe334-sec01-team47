export type ErrorDetail = { field: string; message: string }

/** Expected failure with a stable `code`; the error handler turns it into the NFR-06 JSON shape. */
export class AppError extends Error {
	constructor(
		readonly code: string,
		readonly status: number,
		message: string,
		readonly details?: ErrorDetail[]
	) {
		super(message)
	}
}

export const unauthenticated = () => new AppError("UNAUTHENTICATED", 401, "Authentication required.")
export const forbidden = () => new AppError("FORBIDDEN", 403, "You are not allowed to do this.")
export const notFound = () => new AppError("NOT_FOUND", 404, "Not found.")
