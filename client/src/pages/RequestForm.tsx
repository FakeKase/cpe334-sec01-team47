import { type FormEvent, useState } from "react"
import { Link, useNavigate } from "react-router"

import { ApiError, api } from "../api/client"
import { type BorrowRequest, formatDate, today } from "../api/requests"
import { useApi } from "../api/useApi"
import { border, describedBy, FieldError, input } from "../components/form"
import { Alert, buttonClass } from "../components/states"

const PURPOSE_MAX = 300
const MAX_DAYS = 14

type Field = "startDate" | "dueDate" | "purpose"
type FieldErrors = Partial<Record<Field, string>>

const dayNumber = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86_400_000

/** Required fields and BR-01, with the messages of the contract (F-03 §1 step 2). The server checks them again. */
function validate(startDate: string, dueDate: string, purpose: string): FieldErrors {
	const errors: FieldErrors = {}
	if (!startDate) errors.startDate = "Start date is required."
	else if (startDate < today()) errors.startDate = "Start date cannot be in the past."

	if (!dueDate) errors.dueDate = "Due date is required."
	else if (startDate && dueDate < startDate) errors.dueDate = "Due date must be on or after the start date."
	else if (startDate && dayNumber(dueDate) - dayNumber(startDate) + 1 > MAX_DAYS)
		errors.dueDate = "A loan can be at most 14 days."

	const length = purpose.trim().length
	if (length === 0) errors.purpose = "Purpose is required."
	else if (length > PURPOSE_MAX) errors.purpose = `Purpose must be at most ${PURPOSE_MAX} characters.`
	return errors
}

/** F-03: a Borrower requests the item for a period. On success it goes to My requests with a confirmation banner. */
export function RequestForm({ itemId }: { itemId: string }) {
	const navigate = useNavigate()
	const [startDate, setStartDate] = useState("")
	const [dueDate, setDueDate] = useState("")
	const [purpose, setPurpose] = useState("")
	const [errors, setErrors] = useState<FieldErrors>({})
	const [serverError, setServerError] = useState("")
	const [submitting, setSubmitting] = useState(false)
	// BR-08 (F-08): an overdue loan blocks new requests. Checked up front; while loading or on failure the server decides.
	const overdue = useApi<BorrowRequest[]>("/requests?overdue=true").state
	const loan = overdue.status === "ok" ? overdue.data.find((r) => r.overdue) : undefined
	const [refused, setRefused] = useState(false)
	const blocked = !!loan || refused

	async function submit(e: FormEvent) {
		e.preventDefault()
		setServerError("")
		const local = validate(startDate, dueDate, purpose)
		setErrors(local)
		if (Object.keys(local).length > 0) return

		setSubmitting(true)
		try {
			await api<BorrowRequest>("/requests", {
				method: "POST",
				body: { itemId, startDate, dueDate, purpose: purpose.trim() },
			})
			navigate("/my-requests", { state: { submitted: true } })
		} catch (err) {
			const known = new Set<string>(["startDate", "dueDate", "purpose"])
			const fieldErrors: FieldErrors = {}
			if (err instanceof ApiError)
				for (const d of err.details) if (known.has(d.field)) fieldErrors[d.field as Field] ??= d.message
			if (err instanceof ApiError && err.code === "OVERDUE_BLOCK") setRefused(true)
			if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors)
			else setServerError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
			setSubmitting(false)
		}
	}

	const trimmed = purpose.trim().length
	return (
		<form onSubmit={submit} noValidate className="mt-3 flex max-w-xl flex-col gap-4">
			{loan && (
				<Alert kind="error">
					You have an overdue loan: {loan.item.name}, due {formatDate(loan.dueDate)}. Return it before making a new
					request.{" "}
					<Link to="/my-requests" className="font-medium text-link underline underline-offset-4">
						View my requests
					</Link>
				</Alert>
			)}
			{serverError && <Alert kind="error">{serverError}</Alert>}

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1">
					<label htmlFor="startDate" className="text-sm font-medium">
						Start date
					</label>
					<input
						id="startDate"
						type="date"
						min={today()}
						value={startDate}
						onChange={(e) => setStartDate(e.target.value)}
						aria-invalid={!!errors.startDate}
						aria-describedby={describedBy("startDate", errors.startDate)}
						className={`${input} ${border(errors.startDate)}`}
					/>
					<FieldError id="startDate-error" message={errors.startDate} />
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="dueDate" className="text-sm font-medium">
						Due date
					</label>
					<input
						id="dueDate"
						type="date"
						min={startDate || today()}
						value={dueDate}
						onChange={(e) => setDueDate(e.target.value)}
						aria-invalid={!!errors.dueDate}
						aria-describedby={describedBy("dueDate", errors.dueDate)}
						className={`${input} ${border(errors.dueDate)}`}
					/>
					<FieldError id="dueDate-error" message={errors.dueDate} />
				</div>
			</div>

			<div className="flex flex-col gap-1">
				<label htmlFor="purpose" className="text-sm font-medium">
					Purpose
				</label>
				<textarea
					id="purpose"
					rows={4}
					value={purpose}
					onChange={(e) => setPurpose(e.target.value)}
					aria-invalid={!!errors.purpose}
					aria-describedby={describedBy("purpose", errors.purpose, "purpose-count")}
					placeholder="What will you use it for?"
					className={`${input} py-2 ${border(errors.purpose)}`}
				/>
				<div className="flex justify-between gap-4">
					<FieldError id="purpose-error" message={errors.purpose} />
					<p
						id="purpose-count"
						className={`ml-auto text-sm ${trimmed > PURPOSE_MAX ? "text-error-fg" : "text-secondary"}`}>
						{trimmed}/{PURPOSE_MAX}
					</p>
				</div>
			</div>

			<button type="submit" disabled={submitting || blocked} className={`${buttonClass()} self-start`}>
				Submit request
			</button>
		</form>
	)
}
