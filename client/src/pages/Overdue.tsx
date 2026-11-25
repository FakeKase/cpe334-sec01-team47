import { type BorrowRequest, daysSince, formatDate } from "../api/requests"
import { useApi } from "../api/useApi"
import { card } from "../components/RequestRow"
import { EmptyState, ErrorState, LoadingState } from "../components/states"

/** F-08 (FR-14): every overdue loan, oldest due date first (the server's order). Returns happen on /requests. */
export function Overdue() {
	const { state, retry } = useApi<BorrowRequest[]>("/requests?overdue=true")

	return (
		<div>
			<h1 className="text-[22px] leading-[30px] font-semibold md:text-[28px] md:leading-9">Overdue loans</h1>
			<p className="mt-1 text-secondary">Checked-out loans past their due date, oldest first.</p>

			<div className="mt-4 md:mt-6">
				{state.status === "loading" && (
					<div className={card}>
						<LoadingState message="Loading overdue loans…" />
					</div>
				)}
				{state.status === "error" && <ErrorState onRetry={retry} />}
				{state.status === "ok" &&
					(state.data.length === 0 ? (
						<div className={card}>
							<EmptyState title="No overdue loans." />
						</div>
					) : (
						<ul className="flex flex-col gap-3">
							{state.data.map((r) => {
								const days = daysSince(r.dueDate)
								return (
									<li
										key={r.id}
										className={`${card} flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-6 md:px-5`}>
										<div className="flex min-w-0 flex-col gap-1 md:flex-1">
											<p className="font-medium">{r.borrower.displayName}</p>
											<p className="text-sm text-secondary">
												{r.item.name} · {r.item.assetTag}
											</p>
										</div>
										<div className="flex flex-col gap-1 text-sm md:items-end">
											<p className="font-medium">Due {formatDate(r.dueDate)}</p>
											<p className="font-medium text-error-fg">
												{days} {days === 1 ? "day" : "days"} overdue
											</p>
										</div>
									</li>
								)
							})}
						</ul>
					))}
			</div>
		</div>
	)
}
