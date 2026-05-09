import { useEffect, useState } from "react";
import pkg from "../../package.json";

export function VersionBadge() {
	const [serverVersion, setServerVersion] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/ping")
			.then((r) => r.json())
			.then((d) => setServerVersion(d.version ?? null))
			.catch(() => setServerVersion(null));
	}, []);

	return (
		<div className="fixed bottom-3 right-3 flex items-center gap-1.5 text-[12px] text-muted-foreground/50 select-none pointer-events-none z-50 font-mono">
			<span>web v{pkg.version}</span>
			{serverVersion !== null && (
				<>
					<span>·</span>
					<span>server v{serverVersion}</span>
				</>
			)}
		</div>
	);
}
