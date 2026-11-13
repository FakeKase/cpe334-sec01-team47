import { useCallback, useEffect, useState } from "react"

import { api, type ApiError } from "./client"

type Result<T> = { status: "ok"; data: T } | { status: "error"; error: ApiError }
type State<T> = { status: "loading" } | Result<T>

/** GET `path` and reload when it changes. A result is only shown for the request that produced it. */
export function useApi<T>(path: string) {
	const [attempt, setAttempt] = useState(0)
	const key = `${attempt}:${path}`
	const [result, setResult] = useState<(Result<T> & { key: string }) | null>(null)

	useEffect(() => {
		let ignore = false
		api<T>(path).then(
			(data) => !ignore && setResult({ key, status: "ok", data }),
			(error: ApiError) => !ignore && setResult({ key, status: "error", error })
		)
		return () => {
			ignore = true
		}
	}, [path, key])

	const retry = useCallback(() => setAttempt((n) => n + 1), [])
	const state: State<T> = result?.key === key ? result : { status: "loading" }
	return { state, retry }
}
