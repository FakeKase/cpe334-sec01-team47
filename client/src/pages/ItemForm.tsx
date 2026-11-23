import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"

import type { Category, ItemDetail, ItemStatus } from "../api/catalog"
import { ApiError, api } from "../api/client"
import { useApi } from "../api/useApi"
import { Alert, buttonClass, ErrorState, LoadingState } from "../components/states"
import { Toast } from "../components/Toast"
import { useToast } from "../components/useToast"
import { border, FieldError, input } from "./RequestForm"
import { NotFound } from "./SystemPages"

const BR12 = "Asset tag must look like CPE-0042: 2 to 5 letters, a hyphen and 3 to 5 digits."

type Values = { assetTag: string; name: string; categoryId: string; location: string; description: string }
type Field = keyof Values
type FieldErrors = Partial<Record<Field, string>>

const FIELDS: Field[] = ["assetTag", "name", "categoryId", "location", "description"]
const empty: Values = { assetTag: "", name: "", categoryId: "", location: "", description: "" }
const valuesOf = (item: ItemDetail): Values => ({
	assetTag: item.assetTag,
	name: item.name,
	categoryId: item.category.id,
	location: item.location ?? "",
	description: item.description ?? "",
})

/** The body the server expects: trimmed, tag upper-cased (BR-12). */
const toBody = (v: Values) => ({
	assetTag: v.assetTag.trim().toUpperCase(),
	name: v.name.trim(),
	categoryId: v.categoryId,
	location: v.location.trim(),
	description: v.description.trim(),
})

/** Mirrors the server rules of F-09 §2 with the same messages. The server checks them again. */
function validate(v: Values): FieldErrors {
	const b = toBody(v)
	const errors: FieldErrors = {}
	if (!/^[A-Z]{2,5}-\d{3,5}$/.test(b.assetTag)) errors.assetTag = BR12
	if (!b.name) errors.name = "Name is required."
	else if (b.name.length > 100) errors.name = "Name can be at most 100 characters."
	if (!b.categoryId) errors.categoryId = "Choose a category."
	if (b.location.length > 100) errors.location = "Location can be at most 100 characters."
	if (b.description.length > 1000) errors.description = "Description can be at most 1000 characters."
	return errors
}

/** Server 400 details and the 409 duplicate go under their field; anything else becomes the alert message. */
function fieldErrorsOf(err: unknown): FieldErrors | string {
	const errors: FieldErrors = {}
	if (err instanceof ApiError)
		for (const d of err.details) if (FIELDS.includes(d.field as Field)) errors[d.field as Field] ??= d.message
	if (Object.keys(errors).length > 0) return errors
	return err instanceof ApiError ? err.message : "Something went wrong. Please try again."
}

function Labelled({ id, label, error, children }: { id: Field; label: string; error?: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="text-sm font-medium">
				{label}
			</label>
			{children}
			<FieldError id={`${id}-error`} message={error} />
		</div>
	)
}

function ItemFields({
	values,
	errors,
	onChange,
	categories,
}: {
	values: Values
	errors: FieldErrors
	onChange: (field: Field, value: string) => void
	categories?: Category[]
}) {
	const props = (id: Field) => ({
		id,
		value: values[id],
		onChange: (e: { target: { value: string } }) => onChange(id, e.target.value),
		"aria-invalid": !!errors[id],
		"aria-describedby": `${id}-error`,
		className: `${input} ${border(errors[id])}`,
	})
	return (
		<div className="flex flex-col gap-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<Labelled id="assetTag" label="Asset tag" error={errors.assetTag}>
					<input {...props("assetTag")} placeholder="CPE-0042" autoCapitalize="characters" />
				</Labelled>
				<Labelled id="name" label="Name" error={errors.name}>
					<input {...props("name")} />
				</Labelled>
				<Labelled id="categoryId" label="Category" error={errors.categoryId}>
					<select {...props("categoryId")} disabled={!categories}>
						<option value="">Choose a category</option>
						{categories?.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name}
							</option>
						))}
					</select>
				</Labelled>
				<Labelled id="location" label="Location" error={errors.location}>
					<input {...props("location")} />
				</Labelled>
			</div>
			<Labelled id="description" label="Description" error={errors.description}>
				<textarea {...props("description")} rows={4} className={`${props("description").className} py-2`} />
			</Labelled>
		</div>
	)
}

function useCategories() {
	const { state } = useApi<Category[]>("/categories")
	return state.status === "ok" ? state.data : undefined
}

/** One form for create and edit: client checks first, then the server's field errors or alert. `send` may return
 * the saved values to show. */
function useItemForm(initial: Values, send: (body: ReturnType<typeof toBody>) => Promise<Values | void>) {
	const [values, setValues] = useState(initial)
	const [errors, setErrors] = useState<FieldErrors>({})
	const [alert, setAlert] = useState("")
	const [submitting, setSubmitting] = useState(false)

	async function submit(e: FormEvent) {
		e.preventDefault()
		setAlert("")
		const local = validate(values)
		setErrors(local)
		if (Object.keys(local).length > 0) return
		setSubmitting(true)
		try {
			const saved = await send(toBody(values))
			if (saved) setValues(saved)
		} catch (err) {
			const mapped = fieldErrorsOf(err)
			if (typeof mapped === "string") setAlert(mapped)
			else setErrors(mapped)
		}
		setSubmitting(false)
	}

	const onChange = (field: Field, value: string) => setValues((v) => ({ ...v, [field]: value }))
	return { values, errors, alert, submitting, submit, onChange }
}

function BackLink() {
	return (
		<Link to="/manage/items" className="text-sm text-muted underline underline-offset-4">
			← Back to inventory
		</Link>
	)
}

/** F-09 `/manage/items/new`. */
export function NewItem() {
	const navigate = useNavigate()
	const categories = useCategories()
	const form = useItemForm(empty, async (body) => {
		await api("/items", { method: "POST", body })
		navigate("/manage/items", { state: { toast: "Item created" } })
	})

	return (
		<div>
			<BackLink />
			<h1 className="mt-3 text-2xl font-semibold">Add item</h1>
			<form onSubmit={form.submit} noValidate className="mt-4 flex max-w-2xl flex-col gap-4">
				{form.alert && <Alert kind="error">{form.alert}</Alert>}
				<ItemFields values={form.values} errors={form.errors} onChange={form.onChange} categories={categories} />
				<button type="submit" disabled={form.submitting} className={`${buttonClass()} self-start`}>
					Add item
				</button>
			</form>
		</div>
	)
}

/** F-09 `/manage/items/:id`. */
export function EditItem() {
	const { id = "" } = useParams()
	const { state, retry } = useApi<ItemDetail>(`/items/${encodeURIComponent(id)}`)

	if (state.status === "loading") return <LoadingState message="Loading item…" />
	if (state.status === "error") return state.error.status === 404 ? <NotFound /> : <ErrorState onRetry={retry} />
	return <EditItemForm loaded={state.data} />
}

const STATUS_LABEL: Record<ItemStatus, string> = {
	ACTIVE: "Active",
	MAINTENANCE: "Under maintenance",
	RETIRED: "Retired",
}
const STATUS_TOAST: Record<ItemStatus, string> = {
	ACTIVE: "Item set active",
	MAINTENANCE: "Item set to maintenance",
	RETIRED: "Item retired",
}

function EditItemForm({ loaded }: { loaded: ItemDetail }) {
	const categories = useCategories()
	const [item, setItem] = useState(loaded)
	const [toast, showToast] = useToast()
	const form = useItemForm(valuesOf(loaded), async (body) => {
		const saved = await api<ItemDetail>(`/items/${item.id}`, { method: "PATCH", body })
		setItem(saved)
		showToast("Changes saved")
		return valuesOf(saved)
	})
	const retired = item.status === "RETIRED"

	return (
		<div>
			<BackLink />
			<h1 className="mt-3 text-2xl font-semibold">Edit item</h1>
			<form onSubmit={form.submit} noValidate className="mt-4 max-w-2xl">
				<fieldset disabled={retired} className="flex min-w-0 flex-col gap-4">
					{form.alert && <Alert kind="error">{form.alert}</Alert>}
					<ItemFields values={form.values} errors={form.errors} onChange={form.onChange} categories={categories} />
					<button type="submit" disabled={form.submitting} className={`${buttonClass()} self-start`}>
						Save changes
					</button>
				</fieldset>
			</form>

			<StatusSection
				item={item}
				onChanged={(updated) => {
					setItem(updated)
					showToast(STATUS_TOAST[updated.status])
				}}
			/>
			<Toast message={toast} />
		</div>
	)
}

/** FR-16 and BR-11: allowed moves from the current status; retiring needs confirmation. */
function StatusSection({ item, onChanged }: { item: ItemDetail; onChanged: (item: ItemDetail) => void }) {
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState("")
	const [confirming, setConfirming] = useState(false)

	async function change(status: ItemStatus) {
		setBusy(true)
		setError("")
		try {
			onChanged(await api<ItemDetail>(`/items/${item.id}/status`, { method: "POST", body: { status } }))
		} catch (e) {
			setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.")
		}
		setBusy(false)
	}

	return (
		<section aria-labelledby="status-heading" className="mt-8 flex max-w-2xl flex-col gap-3">
			<h2 id="status-heading" className="text-lg font-semibold">
				Status
			</h2>
			<p>
				<span className="inline-block rounded-full border border-line-strong px-2 py-0.5 text-sm">
					{STATUS_LABEL[item.status]}
				</span>
			</p>
			{item.status === "RETIRED" ? (
				<p className="text-muted">Retired items cannot be changed.</p>
			) : (
				<div className="flex flex-wrap gap-3">
					{item.status === "ACTIVE" ? (
						<button
							type="button"
							className={buttonClass("secondary")}
							disabled={busy}
							onClick={() => change("MAINTENANCE")}>
							Set to maintenance
						</button>
					) : (
						<button type="button" className={buttonClass("secondary")} disabled={busy} onClick={() => change("ACTIVE")}>
							Set active
						</button>
					)}
					<button type="button" className={buttonClass("danger")} disabled={busy} onClick={() => setConfirming(true)}>
						Retire item
					</button>
				</div>
			)}
			{error && <Alert kind="error">{error}</Alert>}
			{confirming && (
				<RetireDialog
					name={item.name}
					onKeep={() => setConfirming(false)}
					onRetire={() => {
						setConfirming(false)
						void change("RETIRED")
					}}
				/>
			)}
		</section>
	)
}

/** Native modal dialog, like the reject dialog of F-05: focus trap, Esc and the backdrop come from the browser. */
function RetireDialog({ name, onKeep, onRetire }: { name: string; onKeep: () => void; onRetire: () => void }) {
	const dialog = useRef<HTMLDialogElement>(null)
	useEffect(() => dialog.current?.showModal(), [])

	return (
		<dialog
			ref={dialog}
			onClose={onKeep}
			aria-labelledby="retire-title"
			aria-describedby="retire-description"
			className="mx-auto mt-30 w-[calc(100%-2rem)] max-w-120 rounded-xl bg-surface p-6 text-fg shadow-[0_8px_24px_-4px_rgb(15_23_41/0.18)] backdrop:bg-overlay/50 md:mt-40">
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1">
					<h2 id="retire-title" className="text-lg font-semibold">
						Retire item
					</h2>
					<p className="font-medium break-words">{name}</p>
					<p id="retire-description" className="text-sm text-secondary">
						Retiring is permanent. Pending requests for this item will be rejected with the reason "Item retired".
					</p>
				</div>
				<div className="flex flex-wrap justify-end gap-3">
					<button type="button" className={buttonClass("secondary")} onClick={onKeep}>
						Keep item
					</button>
					<button type="button" className={buttonClass("danger")} onClick={onRetire}>
						Retire item
					</button>
				</div>
			</div>
		</dialog>
	)
}
