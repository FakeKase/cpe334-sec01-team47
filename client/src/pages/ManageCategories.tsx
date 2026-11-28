import { type FormEvent, useEffect, useRef, useState } from "react"

import type { Category } from "../api/catalog"
import { ApiError, api } from "../api/client"
import { useApi } from "../api/useApi"
import { border, describedBy, FieldError, input } from "../components/form"
import { Alert, buttonClass, EmptyState, ErrorState, LoadingState } from "../components/states"
import { Toast } from "../components/Toast"
import { useToast } from "../components/useToast"

const MAX = 60
const byName = (a: Category, b: Category) => a.name.localeCompare(b.name)

/** F-10 client check. The server decides in the end and its message is shown as it is. */
const check = (value: string) => {
	const name = value.trim()
	if (!name) return "Name is required."
	if (name.length > MAX) return `Name can be at most ${MAX} characters.`
}

/** A 400 or 409 puts its `name` detail under the field; anything else becomes the generic alert. */
function describe(e: unknown): { field?: string; alert?: string } {
	const err = e as ApiError
	const detail = err.details?.find((d) => d.field === "name")
	return detail ? { field: detail.message } : { alert: err.message }
}

/** The form that renames one category in place. It mounts when the row opens, so it always starts from the current
 * name. Esc and Cancel close it without a call. */
function RenameForm({
	category,
	onStop,
	onRenamed,
}: {
	category: Category
	onStop: () => void
	onRenamed: (c: Category) => void
}) {
	const [name, setName] = useState(category.name)
	const [error, setError] = useState<string>()
	const [alert, setAlert] = useState<string>()
	const [busy, setBusy] = useState(false)
	const field = useRef<HTMLInputElement>(null)
	const id = `rename-${category.id}`

	useEffect(() => {
		field.current?.focus()
		field.current?.select()
	}, [])

	async function save(e: FormEvent) {
		e.preventDefault()
		const problem = check(name)
		if (problem) return setError(problem)
		setBusy(true)
		setError(undefined)
		setAlert(undefined)
		try {
			onRenamed(await api<Category>(`/categories/${category.id}`, { method: "PATCH", body: { name } }))
			onStop()
		} catch (err) {
			const { field: fieldError, alert: other } = describe(err)
			setError(fieldError)
			setAlert(other)
			setBusy(false)
		}
	}

	return (
		<li className="rounded-xl border border-line bg-surface p-4">
			<form onSubmit={save} className="flex flex-col gap-3" noValidate>
				<div className="flex flex-col gap-1">
					<label htmlFor={id} className="text-sm font-medium">
						Category name
					</label>
					<input
						ref={field}
						id={id}
						value={name}
						maxLength={MAX}
						disabled={busy}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => e.key === "Escape" && !busy && onStop()}
						aria-invalid={!!error}
						aria-describedby={describedBy(id, error)}
						className={`${input} ${border(error)}`}
					/>
					<FieldError id={`${id}-error`} message={error} />
				</div>
				{alert && <Alert kind="error">{alert}</Alert>}
				<div className="flex gap-3">
					<button type="submit" className={buttonClass()} disabled={busy}>
						{busy ? "Saving…" : "Save"}
					</button>
					<button type="button" className={buttonClass("secondary")} disabled={busy} onClick={onStop}>
						Cancel
					</button>
				</div>
			</form>
		</li>
	)
}

function CategoryRow({
	category,
	editing,
	onEdit,
	onStop,
	onRenamed,
}: {
	category: Category
	editing: boolean
	onEdit: () => void
	onStop: () => void
	onRenamed: (c: Category) => void
}) {
	if (editing) return <RenameForm category={category} onStop={onStop} onRenamed={onRenamed} />
	return (
		<li className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
			<p className="min-w-0 font-medium break-words">{category.name}</p>
			<button
				type="button"
				className={buttonClass("secondary")}
				onClick={onEdit}
				aria-label={`Rename ${category.name}`}>
				Rename
			</button>
		</li>
	)
}

/** F-10: the Custodian's list of categories, with add and rename. There is no delete (FR-17). */
export function ManageCategories() {
	const { state, retry } = useApi<Category[]>("/categories")
	const [added, setAdded] = useState<Category[]>([])
	const [renamed, setRenamed] = useState<Record<string, string>>({})
	const [editing, setEditing] = useState<string | null>(null)
	const [name, setName] = useState("")
	const [error, setError] = useState<string>()
	const [alert, setAlert] = useState<string>()
	const [busy, setBusy] = useState(false)
	const [toast, showToast] = useToast()

	async function add(e: FormEvent) {
		e.preventDefault()
		const problem = check(name)
		if (problem) return setError(problem)
		setBusy(true)
		setError(undefined)
		setAlert(undefined)
		try {
			const created = await api<Category>("/categories", { method: "POST", body: { name } })
			setAdded((a) => [...a, created])
			setName("")
			showToast("Category added")
		} catch (err) {
			const { field, alert: other } = describe(err)
			setError(field)
			setAlert(other)
		} finally {
			setBusy(false)
		}
	}

	// What the server sent, plus what this page added or renamed since, so the list never flashes or reloads.
	const categories =
		state.status === "ok"
			? [...state.data, ...added].map((c) => ({ ...c, name: renamed[c.id] ?? c.name })).sort(byName)
			: []

	return (
		<div>
			<h1 className="text-2xl font-semibold">Categories</h1>

			<form onSubmit={add} className="mt-4 flex flex-col gap-3 md:max-w-120" noValidate>
				<div className="flex flex-col gap-1">
					<label htmlFor="category-name" className="text-sm font-medium">
						Name
					</label>
					<input
						id="category-name"
						value={name}
						maxLength={MAX}
						disabled={busy}
						onChange={(e) => setName(e.target.value)}
						aria-invalid={!!error}
						aria-describedby={describedBy("category-name", error)}
						className={`${input} ${border(error)}`}
					/>
					<FieldError id="category-name-error" message={error} />
				</div>
				{alert && <Alert kind="error">{alert}</Alert>}
				<button type="submit" className={`${buttonClass()} md:self-start`} disabled={busy}>
					{busy ? "Adding…" : "Add category"}
				</button>
			</form>

			{state.status === "loading" && <LoadingState message="Loading categories…" />}
			{state.status === "error" && <ErrorState onRetry={retry} />}
			{state.status === "ok" &&
				(categories.length === 0 ? (
					<EmptyState title="No categories yet." />
				) : (
					<ul className="mt-6 flex flex-col gap-3">
						{categories.map((c) => (
							<CategoryRow
								key={c.id}
								category={c}
								editing={editing === c.id}
								onEdit={() => setEditing(c.id)}
								onStop={() => setEditing(null)}
								onRenamed={(saved) => {
									setRenamed((r) => ({ ...r, [saved.id]: saved.name }))
									showToast("Category renamed")
								}}
							/>
						))}
					</ul>
				))}

			<Toast message={toast} />
		</div>
	)
}
