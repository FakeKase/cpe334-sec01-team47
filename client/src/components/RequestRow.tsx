import type { ReactNode } from "react"

import { type BorrowRequest, formatPeriod, formatTimestampDate, requestStatus } from "../api/requests"
import { Alert } from "./states"

export const card = "rounded-xl border border-line bg-surface"

function RequestStatusBadge({ status }: Pick<BorrowRequest, "status">) {
	const { label, tone } = requestStatus[status]
	return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
}

/** F-04 row, also the Custodian's All tab with `showBorrower`. Desktop: one line with item, period, badge and submitted date. Mobile (360): stacked, badge beside the date. */
export function RequestRow({
	r,
	showBorrower = false,
	error,
	action,
	actionColumn = false,
}: {
	r: BorrowRequest
	showBorrower?: boolean
	/** A message for this row, for example a 409 from an action. */
	error?: string
	/** A button for this row (F-06 Cancel). Desktop: in the last column. Mobile: on its own line below the row. */
	action?: ReactNode
	/** Reserve the action column on desktop even when this row has no button, so the rows line up. */
	actionColumn?: boolean
}) {
	return (
		<li
			className={`${card} grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 p-4 ${
				actionColumn
					? "md:grid-cols-[minmax(0,1fr)_14rem_8rem_auto_6rem]"
					: "md:grid-cols-[minmax(0,1fr)_14rem_8rem_auto]"
			}`}>
			<div className="col-span-2 min-w-0 md:col-span-1">
				<p className="font-medium">{r.item.name}</p>
				<p className="text-sm text-muted">
					{r.item.assetTag}
					{showBorrower && ` · ${r.borrower.displayName}`}
				</p>
			</div>
			<p className="col-span-2 text-sm font-medium md:col-span-1">{formatPeriod(r.startDate, r.dueDate)}</p>
			<div>
				<RequestStatusBadge status={r.status} />
			</div>
			<p className="text-sm text-muted md:text-right">Submitted {formatTimestampDate(r.createdAt)}</p>
			{r.status === "REJECTED" && r.rejectionReason && (
				<p className="col-span-full mt-1 text-sm text-secondary">Reason: {r.rejectionReason}</p>
			)}
			{error && (
				<div className="col-span-full mt-1">
					<Alert kind="error">{error}</Alert>
				</div>
			)}
			{action && (
				<div className="col-span-full mt-1 flex justify-end md:col-span-1 md:col-start-5 md:row-start-1 md:mt-0">
					{action}
				</div>
			)}
		</li>
	)
}
