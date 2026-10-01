const variants = {
	info: {
		box: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800",
		text: "text-blue-800 dark:text-blue-200",
	},
	warning: {
		box: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800",
		text: "text-amber-800 dark:text-amber-200",
	},
};

export function NoticeCard({
	children,
	variant = "info",
}: React.PropsWithChildren<{ variant?: keyof typeof variants }>) {
	const style = variants[variant];
	return (
		<div className={`dynround border rounded-md p-3 ${style.box}`}>
			<div className={`text-xs ${style.text}`}>{children}</div>
		</div>
	);
}
