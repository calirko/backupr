export default function DataTableWrapper({
	children,
	classname,
}: {
	children: React.ReactNode;
	classname?: string;
}) {
	return (
		<div className={`grow min-h-0 flex`}>
			<div
				className={`border rounded-md overflow-hidden h-fit w-full ${classname || ""}`}
			>
				{children}
			</div>
		</div>
	);
}
