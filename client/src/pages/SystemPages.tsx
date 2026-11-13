import { Link } from "react-router"

import { buttonClass } from "../components/states"

function Page({ title, children }: { title: string; children: string }) {
	return (
		<div className="py-16 text-center">
			<h1 className="text-2xl font-semibold">{title}</h1>
			<p className="mt-2 text-muted">{children}</p>
			<Link to="/" className={`${buttonClass()} mt-6`}>
				Back to home
			</Link>
		</div>
	)
}

export const Forbidden = () => <Page title="You are not allowed to do this">Your role cannot open this page.</Page>
export const NotFound = () => <Page title="Not found">The page you asked for does not exist.</Page>
