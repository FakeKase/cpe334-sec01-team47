export type ErrorDetail = { field: string; message: string }

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly details: ErrorDetail[] = []
	) {
		super(message)
	}
}

const TOKEN_KEY = "token"

export const tokenStore = {
	get: () => sessionStorage.getItem(TOKEN_KEY),
	set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
	clear: () => sessionStorage.removeItem(TOKEN_KEY),
}

let onUnauthorized = () => {}
/** The auth provider registers what happens on a 401 (clear the user, go to /login?expired=1). */
export const setUnauthorizedHandler = (fn: () => void) => {
	onUnauthorized = fn
}

type Options = {
	method?: "GET" | "POST"
	body?: unknown
	/** Login and logout handle their own 401 (F-01 §1 steps 6 and 7). */
	skip401?: boolean
}

const base = import.meta.env.VITE_API_URL ?? ""

export async function api<T = void>(path: string, { method = "GET", body, skip401 = false }: Options = {}): Promise<T> {
	const token = tokenStore.get()
	let res: Response
	try {
		res = await fetch(`${base}/api${path}`, {
			method,
			headers: {
				...(body !== undefined && { "Content-Type": "application/json" }),
				...(token && { Authorization: `Bearer ${token}` }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		})
	} catch {
		throw new ApiError(0, "NETWORK_ERROR", "Something went wrong. Please try again.")
	}

	if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T

	const payload = await res.json().catch(() => null)
	const error = payload?.error
	if (res.status === 401 && !skip401) {
		tokenStore.clear()
		onUnauthorized()
	}
	throw new ApiError(
		res.status,
		error?.code ?? "INTERNAL_ERROR",
		error?.message ?? "Something went wrong. Please try again.",
		error?.details
	)
}
