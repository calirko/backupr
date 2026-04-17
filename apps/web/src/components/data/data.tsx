import { ArrowDownIcon, ArrowUpIcon, XSquareIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useData } from "@/hooks/use-data";
import { Card, CardContent } from "../ui/card";
import { Spinner } from "../ui/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "../ui/table";
import {
	RowActionsWrapper,
	RowDataActions,
	type TableAction,
} from "./dataActions";

export interface Column {
	key: string;
	label: string;
	orderable?: boolean;
	align?: "left" | "center" | "right";
	padding?: boolean;
	width?: "auto" | "fit";
	orderByKey?: string;
}

export default function Data({
	columns,
	data,
	loading,
	actions,
	showOrderBy,
	name,
	footer,
}: {
	columns: Column[];
	data: any[];
	loading?: boolean;
	actions?: TableAction[];
	showOrderBy?: boolean;
	name: string;
	footer?: Record<string, React.ReactNode | string | number>;
}) {
	const { orderBy, setOrderBy, selectedRows } = useData(name);
	const bottomDivRef = useRef<HTMLDivElement>(null);
	const [showBottomDiv, setShowBottomDiv] = useState(true);

	type Row = { id?: string | number } & Record<
		string,
		React.ReactNode | string | number | null | undefined
	>;

	useEffect(() => {
		const checkHeight = () => {
			if (bottomDivRef.current) {
				const height = bottomDivRef.current.offsetHeight;
				setShowBottomDiv(height > 1);
			}
		};

		checkHeight();
		// Check on resize as well
		window.addEventListener("resize", checkHeight);
		return () => window.removeEventListener("resize", checkHeight);
	}, [data]);

	function getCellClass(
		col: { padding?: boolean; width?: "auto" | "fit" },
		isLast?: boolean,
	) {
		const classes: string[] = [];

		// padding: default is enabled, only add p-0! when explicitly disabled
		if (col.padding === false) classes.push("p-0!");

		// width handling
		if (col.width === "fit") classes.push("w-8");
		else if (col.width === "auto") classes.push("w-auto");

		return classes.join(" ");
	}

	function tableRows({ row, striped }: { row: Row; striped?: boolean }) {
		return (
			<TableRow
				key={row.id}
				className={`${striped && "bg-table-row"} ${selectedRows.find((e: Row) => e.id === row.id) ? "bg-sidebar" : ""} text-xs`}
			>
				{columns.map((col, index) => (
					<TableCell
						key={col.key}
						align={col.align}
						className={`${getCellClass(
							col,
							index === columns.length - 1 &&
								(!actions || actions.length === 0),
						)} select-text max-w-42.5`}
					>
						{(() => {
							const value = row[col.key];
							const isString = typeof value === "string";
							const isNumber = typeof value === "number";
							const isPrimitive = isString || isNumber;
							const stringValue = isPrimitive ? String(value) : null;
							const shouldShowTooltip = stringValue && stringValue.length > 20;

							return shouldShowTooltip ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<div className="truncate select-text!">
											{value ? (
												value
											) : (
												<p className="text-muted-foreground text-xs">N / A</p>
											)}
										</div>
									</TooltipTrigger>
									<TooltipContent className="select-text!">
										{stringValue}
									</TooltipContent>
								</Tooltip>
							) : (
								<div className="truncate select-text!">
									{value ? (
										value
									) : (
										<p className="text-muted-foreground text-xs">N / A</p>
									)}
								</div>
							);
						})()}
					</TableCell>
				))}
				{actions && actions.length > 0 && (
					<TableCell align="right" className="p-0! w-8" key={"actions"}>
						<RowDataActions actions={actions} row={row} />
					</TableCell>
				)}
			</TableRow>
		);
	}

	function checkActions({ row, striped }: { row: Row; striped?: boolean }) {
		const hasActions = !!actions && actions.length > 0;

		if (hasActions) {
			return (
				<RowActionsWrapper key={row.id} actions={actions} row={row}>
					{tableRows({ row, striped })}
				</RowActionsWrapper>
			);
		} else {
			return tableRows({ row, striped });
		}
	}

	// Helper functions for nested object access (moved outside to be reusable)
	function getNestedValue(obj: Record<string, any>, path: string): any {
		return path.split(".").reduce((current, part) => current?.[part], obj);
	}

	function setNestedValue(obj: Record<string, any>, path: string, value: any) {
		const parts = path.split(".");
		const lastPart = parts.pop()!;
		const target = parts.reduce((current, part) => {
			if (!current[part]) current[part] = {};
			return current[part];
		}, obj);
		target[lastPart] = value;
	}

	function toggleOrderBy(key: string) {
		const currentValue = getNestedValue(orderBy, key);

		if (!currentValue) {
			const newOrderBy: Record<string, any> = {};
			setNestedValue(newOrderBy, key, "asc");
			setOrderBy(newOrderBy);
		} else if (currentValue === "asc") {
			const newOrderBy: Record<string, any> = {};
			setNestedValue(newOrderBy, key, "desc");
			setOrderBy(newOrderBy);
		} else {
			setOrderBy({});
		}
	}

	return (
		<Card className="p-0">
			<CardContent className="p-0 overflow-auto flex flex-col items-center justify-center">
				{loading ? (
					<div className="flex justify-center items-center h-20 text-muted-foreground">
						<Spinner />
					</div>
				) : data.length === 0 ? (
					<div className="py-4 flex gap-2 items-center text-muted-foreground h-20">
						<XSquareIcon />
						<p>No data available.</p>
					</div>
				) : (
					<>
						<Table>
							<TableHeader>
								<TableRow>
									{columns.map((col, index) => (
										<TableHead key={col.key} align={col.align}>
											{showOrderBy && col.orderable !== false ? (
												<Button
													className="-ml-1 p-1 text-xs text-muted-foreground font-semibold h-fit has-[>svg]:px-1"
													variant={"ghost"}
													disabled={loading}
													onClick={() => {
														toggleOrderBy(col?.orderByKey || col.key);
													}}
													onContextMenu={() => {
														const orderKey = col?.orderByKey || col.key;
														if (
															getNestedValue(orderBy, orderKey) ||
															Object.keys(orderBy).length > 0
														)
															setOrderBy({});
													}}
												>
													{col.label}
													{(() => {
														const orderKey = col?.orderByKey || col.key;
														const orderValue = getNestedValue(
															orderBy,
															orderKey,
														);
														return orderValue ? (
															orderValue === "asc" ? (
																<ArrowUpIcon />
															) : (
																<ArrowDownIcon />
															)
														) : (
															""
														);
													})()}
												</Button>
											) : (
												<span className="text-muted-foreground font-semibold text-xs">
													{col.label}
												</span>
											)}
										</TableHead>
									))}
									{actions && actions.length > 0 && (
										<TableHead align="right" className="p-2! w-8" />
									)}
								</TableRow>
							</TableHeader>
							{data.length > 0 && !loading ? (
								<TableBody>
									{data.map((row, index) =>
										checkActions({ row, striped: index % 2 === 0 }),
									)}
								</TableBody>
							) : (
								<TableBody />
							)}
							{footer && data.length > 0 && !loading && (
								<TableFooter>
									{columns.map((col, index) => (
										<TableCell
											key={col.key}
											align={col.align}
											className={`${getCellClass(
												col,
												index === columns.length - 1 &&
													(!actions || actions.length === 0),
											)} text-xs`}
										>
											{footer?.[col?.key] || ""}
										</TableCell>
									))}
									{actions && actions.length > 0 && (
										<TableCell className="p-2! w-8" />
									)}
								</TableFooter>
							)}
						</Table>
						{showBottomDiv && (
							<div ref={bottomDivRef} className="grow w-full border-t" />
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
