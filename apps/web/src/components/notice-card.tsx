export function NoticeCard({ children }: React.PropsWithChildren<{}>) {
	return (
		<div className="dynround bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-3">
			<p className="text-xs text-blue-800 dark:text-blue-200">{children}</p>
		</div>
	);
}
