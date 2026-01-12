"use client";

import InputCurrency from "@/components/ui/input-currency";
import InputDate from "@/components/ui/input-date";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useData } from "@/hooks/use-data";
import { setNestedValue } from "@/lib/utils";
import { ChevronsDownUp, ChevronsUpDown, Search, X } from "lucide-react";
import { cloneElement, useState } from "react";
import { withMask } from "use-mask-input";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import FormPanel from "../formPanel";

export type SearchField =
	| {
			name: string;
			label: string;
			type:
				| "string"
				| "number"
				| "date"
				| "phone"
				| "plate"
				| "cep"
				| "currency"
				| "cpf/cnpj";
			matching?: "equals" | "contains" | "between" | "lte" | "gte";
	  }
	| {
			name: string;
			label: string;
			type: "combobox";
			children: React.ReactNode;
			matching?: "equals" | "contains" | "between";
	  }
	| {
			name: string;
			label: string;
			type: "select";
			options: { value: string | number; label: string }[];
			matching?: "equals" | "contains" | "between";
	  };

export default function DataHeader({
	children,
	filterFields,
	name,
}: {
	children?: React.ReactNode;
	filterFields: SearchField[];
	name: string;
}) {
	const { filters, setFilters, setSkip } = useData(name);
	const [localFilters, setLocalFilters] = useState<Record<string, any>>(() =>
		filterFields.reduce(
			(acc, field) => {
				acc[field.name] = filters[field.name] || "";
				return acc;
			},
			{} as Record<string, any>,
		),
	);
	const [advancedExpanded, setAdvancedExpanded] = useState(false);

	function buildQueryObject() {
		const query: Record<string, any> = {};

		for (const field of filterFields) {
			if (localFilters[field.name]) {
				let value: any;

				switch (field?.matching || "equals") {
					case "equals":
						value = localFilters[field.name];
						break;
					case "contains":
						value = {
							contains: localFilters[field.name],
							mode: "insensitive",
						};
						break;
					case "between":
						if (field.type === "date") {
							const date = new Date(localFilters[field.name]);
							date.setHours(0, 0, 0, 0);
							const endDate = new Date(localFilters[field.name]);
							endDate.setHours(23, 59, 59, 999);
							value = {
								gte: date.toISOString(),
								lte: endDate.toISOString(),
							};
						} else {
							value = {
								gte: localFilters[field.name],
								lte: localFilters[field.name],
							};
						}
						break;
					case "gte":
						if (field.type === "date") {
							const date = new Date(localFilters[field.name]);
							date.setHours(0, 0, 0, 0);
							value = { gte: date.toISOString() };
						} else {
							value = { gte: localFilters[field.name] };
						}
						break;
					case "lte":
						if (field.type === "date") {
							const date = new Date(localFilters[field.name]);
							date.setHours(23, 59, 59, 999);
							value = { lte: date.toISOString() };
						} else {
							value = { lte: localFilters[field.name] };
						}
						break;
					default:
						throw new Error(`Unknown matching type: ${field.matching}`);
				}

				// Check if field name contains dots
				if (field.name.includes(".")) {
					setNestedValue(query, field.name, value);
				} else {
					query[field.name] = value;
				}
			}
		}

		return query;
	}

	function renderInput(field: SearchField) {
		switch (field.type) {
			case "phone":
				return (
					<Input
						placeholder={field.label}
						value={localFilters[field.name]}
						onChange={(e) => {
							setLocalFilters({
								...localFilters,
								[field.name]: e.target.value,
							});
						}}
						ref={withMask(["(99) 9999-9999", "(99) 99999-9999"])}
					/>
				);
			case "currency":
				return (
					<InputCurrency
						placeholder={field.label}
						value={localFilters[field.name]}
						onChange={(e) => {
							setLocalFilters({
								...localFilters,
								[field.name]: e,
							});
						}}
					/>
				);
			case "plate":
				return (
					<Input
						placeholder={field.label}
						value={localFilters[field.name]}
						onChange={(e) => {
							setLocalFilters({
								...localFilters,
								[field.name]: e.target.value,
							});
						}}
						ref={withMask(["AAA-9999", "AAA9A99"])}
					/>
				);
			case "cpf/cnpj":
				return (
					<Input
						placeholder={field.label}
						value={localFilters[field.name]}
						onChange={(e) => {
							setLocalFilters({
								...localFilters,
								[field.name]: e.target.value,
							});
						}}
						ref={withMask(["999.999.999-99", "99.999.999/9999-99"])}
					/>
				);
			case "cep":
				return (
					<Input
						placeholder={field.label}
						value={localFilters[field.name]}
						onChange={(e) => {
							setLocalFilters({
								...localFilters,
								[field.name]: e.target.value,
							});
						}}
						ref={withMask(["99999-999"])}
					/>
				);
			case "string":
				return (
					<Input
						placeholder={field.label}
						value={localFilters[field.name]}
						onChange={(e) => {
							setLocalFilters({
								...localFilters,
								[field.name]: e.target.value,
							});
						}}
					/>
				);
			case "number":
				return (
					<Input
						type="number"
						placeholder={field.label}
						value={localFilters[field.name]}
						onChange={(e) => {
							setLocalFilters({
								...localFilters,
								[field.name]: Number.parseInt(e.target.value, 10),
							});
						}}
					/>
				);
			case "combobox":
				return cloneElement<any>(field.children as React.ReactElement, {
					selected: String(localFilters[field.name]),
					onSelectionChange: (e: string) =>
						setLocalFilters({
							...localFilters,
							[field.name]: Number.parseInt(e, 10),
						}),
				});
			case "date":
				return (
					<InputDate
						name={field.name}
						value={localFilters[field.name]}
						onValueChange={(value) => {
							setLocalFilters({
								...localFilters,
								[field.name]: value,
							});
						}}
					/>
				);
			case "select":
				return (
					<Select
						value={String(localFilters[field.name] || "")}
						onValueChange={(e) => {
							setLocalFilters({
								...localFilters,
								[field.name]: e,
							});
						}}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Selecione uma Opção" />
						</SelectTrigger>
						<SelectContent>
							{field.options.map((option) => (
								<SelectItem key={option.value} value={String(option.value)}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				);
			default:
				return null;
		}
	}

	return (
		<div className="flex flex-col gap-4 w-full">
			<div className="w-full flex justify-between items-center flex-col md:flex-row gap-2">
				{children && (
					<div className="flex gap-2 w-full md:w-fit [&>*]:flex-1 md:[&>*]:flex-none md:[&>*]:w-auto [&_a>button]:w-full">
						{children || ""}
					</div>
				)}
				<div className="flex gap-2  w-full md:w-fit">
					<div className="flex items-center gap-2 grow">
						{renderInput(filterFields[0])}
						<Button
							className="p-1! md:aspect-square min-w-9"
							onClick={() => {
								setSkip(0);
								setFilters(buildQueryObject());
							}}
						>
							<Search />
						</Button>
					</div>
					<Button
						variant={"outline"}
						className="p-1! aspect-square"
						onClick={() => {
							setFilters({});
							setLocalFilters(
								filterFields.reduce(
									(acc, field) => {
										acc[field.name] = "";
										return acc;
									},
									{} as Record<string, string>,
								),
							);
						}}
					>
						<X />
					</Button>
					<Button
						variant={"outline"}
						className="p-1! aspect-square"
						onClick={() => setAdvancedExpanded(!advancedExpanded)}
					>
						{advancedExpanded ? <ChevronsDownUp /> : <ChevronsUpDown />}
					</Button>
				</div>
			</div>
			{advancedExpanded && (
				<FormPanel title="Filtro Avançado" className="grid-cols-2">
					{filterFields.slice(1, filterFields.length).map((field) => (
						<div key={field.name}>
							<Label>{field.label}</Label>
							{renderInput(field)}
						</div>
					))}
				</FormPanel>
			)}
		</div>
	);
}
