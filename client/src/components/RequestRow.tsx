import { type BorrowRequest, formatPeriod, formatTimestampDate, requestStatus } from "../api/requests"

export const card = "rounded-xl border border-line bg-surface"

function RequestStatusBadge({ status }: Pick<BorrowRequest, "status">) {
	const { label, tone } = requestStatus[status]
	return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
}

/** F-04 row, also the Custodian's All tab with `showBorrower`. Desktop: one line with item, period, badge and submitted date. Mobile (360): stacked, badge beside the date. */
export function RequestRow({ r, showBorrower = false }: { r: BorrowRequest; showBorrower?: boolean }) {
	return (
		<li
			className={`${card} grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 p-4 md:grid-cols-[minmax(0,1fr)_14rem_8rem_auto]`}>
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
		</li>
	)
}
