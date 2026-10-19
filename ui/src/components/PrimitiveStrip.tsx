import { useState } from "react";

// Set VITE_PRIMITIVE_ADDRESS at build time to the verified Primitive inbox that feeds /webhooks/primitive.
const ADDRESS: string = (import.meta.env.VITE_PRIMITIVE_ADDRESS as string | undefined) ?? "";

export function PrimitiveStrip() {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		if (!ADDRESS) return;
		try {
			await navigator.clipboard.writeText(ADDRESS);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			/* clipboard blocked: the address stays visible and selectable */
		}
	};

	return (
		<section aria-label="Email a job" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, margin: "12px auto", padding: "12px 16px", maxWidth: 1100, border: "1px solid rgba(127,127,127,.35)", borderRadius: 12 }}>
			<strong>Powered by Primitive</strong>
			<span style={{ opacity: 0.8, flex: "1 1 240px" }}>Email a goal to the yard. A crew forks, builds, and replies in the same thread when it is ready for review.</span>
			{ADDRESS ? (
				<>
					<code style={{ userSelect: "all" }}>{ADDRESS}</code>
					<button type="button" onClick={copy} aria-live="polite">{copied ? "Copied" : "Copy address"}</button>
				</>
			) : (
				<em style={{ opacity: 0.7 }}>Inbox address not configured yet</em>
			)}
		</section>
	);
}
