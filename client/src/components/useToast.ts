import { useEffect, useState } from "react"

/** A toast message that clears itself after 4 s. `at` makes the same message shown twice restart the timer. */
export function useToast(initial?: string) {
	const [toast, setToast] = useState(() => (initial ? { message: initial, at: Date.now() } : null))

	useEffect(() => {
		if (!toast) return
		const timer = setTimeout(() => setToast(null), 4000)
		return () => clearTimeout(timer)
	}, [toast])

	return [toast?.message, (message: string) => setToast({ message, at: Date.now() })] as const
}
