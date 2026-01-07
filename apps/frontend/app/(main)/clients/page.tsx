"use client";

import CompanyCombobox from "@/components/comboBoxes/companyCombobox";
import BulkData from "@/components/layout/data/bulkData";
import Data from "@/components/layout/data/data";
import { TableAction } from "@/components/layout/data/dataActions";
import DataFooter from "@/components/layout/data/dataFooter";
import DataHeader, {
	type SearchField,
} from "@/components/layout/data/dataHeader";
import ExportData from "@/components/layout/data/exportData";
import DataTableWrapper from "@/components/layout/dataTableWrapper";
import StatusBadge from "@/components/layout/statusBadge";
import { Button } from "@/components/ui/button";
import RelativeDate from "@/components/ui/relativeDate";
import { TableLink } from "@/components/ui/table";
import { useData } from "@/hooks/use-data";
import Api from "@/lib/api";
import { userRoleDict } from "@controlegas/shared/enum/user";
import { Token } from "@controlegas/shared/public/token";
import Cookies from "js-cookie";
import { Pencil, Shield, Trash, Truck, User, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function UsersPage() {
	const [loading, setLoading] = useState(true);
	const [data, setData] = useState({ items: [], total: 0 });
	const { skip, take, filters, orderBy } = useData("users");
	const payload = Token.payload(Cookies.get("token") || "");
	const isAdmin = payload?.user?.role === "ADMIN";

	const columns = [
		{ key: "id", label: "Código" },
		{ key: "name", label: "Nome" },
		{ key: "email", label: "Email" },
		{ key: "role_label", label: "Cargo", orderByKey: "role" },
		{ key: "createdAt", label: "Criado em" },
		{ key: "updatedAt", label: "Atualizado em" },
		{ key: "company", label: "Empresa", orderByKey: "company.name" },
	];

	const filterFields = [
		{
			name: "email",
			label: "Email",
			type: "string",
			matching: "contains",
		},
		{ name: "id", label: "Código", type: "number" },
		{
			name: "name",
			label: "Nome",
			type: "string",
			matching: "contains",
		},
		{
			name: "role",
			label: "Cargo",
			type: "select",
			matching: "equals",
			options: Object.entries(userRoleDict).map(([value, label]) => ({
				value,
				label,
			})),
		},
		{
			name: "createdAt",
			label: "Data de Criação",
			type: "date",
			matching: "between",
		},
		{
			name: "company_id",
			label: "Empresa",
			type: "combobox",
			matching: "equals",
			children: <CompanyCombobox />,
		},
	] as SearchField[];

	const dataActions: TableAction[] = [
		{
			label: "Ações Gerais",
			id: "general",
		},
		{
			id: "edit",
			label: "Editar",
			icon: <Pencil />,
			href: (row) => `/users/${row.id}/edit`,
			disabled: (row) =>
				payload?.user?.id === row.id ||
				(payload?.user?.role !== "ADMIN" && row.role !== "DELIVERYMAN"),
		},
		{
			id: "delete",
			label: "Excluir",
			icon: <Trash />,
			disabled: (row) =>
				payload?.user?.id === row.id ||
				(payload?.user?.role !== "ADMIN" && row.role !== "DELIVERYMAN"),
			onClick: async (row) => {
				try {
					await Api.del(
						`/users`,
						{ ids: [row.id] },
						{ token: Cookies.get("token") },
					);
					toast.success("Usuário excluído com sucesso");
					fetchData();
				} catch (error: any) {
					console.error(error);

					let message = error?.message;

					switch (message) {
						case "You cannot delete your own user account":
							message = "Você não pode excluir sua própria conta de usuário";
							break;
						case "These users cannot be deleted because they have associated data in the system":
							message =
								"Este usuário não pode ser excluído porque possui dados associados no sistema";
							break;
						default:
							message = error?.message || "Erro ao excluir usuário";
							break;
					}

					toast.error(message);
				}
			},
			onBulkClick: async (rows) => {
				const ids = rows.map((r) => r.id);
				try {
					await Api.del(`/users`, { ids }, { token: Cookies.get("token") });
					toast.success("Usuários excluídos com sucesso");
					fetchData();
				} catch (error: any) {
					console.error(error);

					let message = error?.message;

					switch (message) {
						case "You cannot delete your own user account":
							message = "Você não pode excluir sua própria conta de usuário";
							break;
						case "These users cannot be deleted because they have associated data in the system":
							message =
								"Um ou mais usuários não podem ser excluídos porque possuem dados associados no sistema";
							break;
						default:
							message = error?.message || "Erro ao excluir usuário";
							break;
					}

					toast.error(message);
				}
			},
			requireConfirmation: true,
			variant: "destructive",
		},
	];

	async function fetchData() {
		const urlParams = new URLSearchParams({
			skip: String(skip),
			take: String(take),
			filters: encodeURIComponent(JSON.stringify(filters)),
			orderBy: encodeURIComponent(JSON.stringify(orderBy)),
		});

		try {
			const response: any = await Api.get(`/users?${urlParams.toString()}`, {
				token: Cookies.get("token"),
			});
			const prettyData = response.data.map((e: any) => ({
				...e,
				role_label: (() => {
					const roleLabel =
						userRoleDict[e.role as keyof typeof userRoleDict] || e.role;

					switch (e.role) {
						case "ADMIN":
							return (
								<StatusBadge
									label={roleLabel}
									variant="success"
									icon={<Shield size={16} />}
								/>
							);
						case "USER":
							return (
								<StatusBadge
									label={roleLabel}
									variant="neutral"
									icon={<User size={16} />}
								/>
							);
						case "DELIVERYMAN":
							return (
								<StatusBadge
									label={roleLabel}
									variant="neutral"
									icon={<Truck size={16} />}
								/>
							);
						default:
							return roleLabel;
					}
				})(),
				company: (
					<TableLink href={`/companies/${e.company.id}/edit`}>
						{e.company.name || "Sem Empresa"}
					</TableLink>
				),
				updatedAt: <RelativeDate date={new Date(e.updatedAt)} />,
				createdAt: <RelativeDate date={new Date(e.createdAt)} />,
			}));
			setData({ items: prettyData, total: response.total });
		} catch (error) {
			console.error(error);
			toast.error("Erro ao buscar usuários");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		setLoading(true);
		fetchData();
	}, [skip, take, filters, orderBy]);

	return (
		<div className="flex flex-col gap-3 md:gap-4 h-full">
			<DataHeader filterFields={filterFields} name="users">
				<BulkData
					actions={dataActions}
					total={data.total}
					disabled={loading}
					name="users"
				>
					<Link href={"/users/new"}>
						<Button>
							<UserPlus />
							Novo Usuário
						</Button>
					</Link>
					<ExportData
						name="users"
						disabled={loading}
						endpoints={{
							pdf: "/users/reports/pdf",
							excel: "/users/reports/excel",
						}}
						fileName="usuarios"
					/>
				</BulkData>
			</DataHeader>
			<DataTableWrapper>
				<Data
					name="users"
					columns={columns}
					data={data.items}
					loading={loading}
					actions={dataActions}
					showOrderBy
				/>
			</DataTableWrapper>
			<DataFooter total={data.total} loading={loading} name="users" />
		</div>
	);
}
