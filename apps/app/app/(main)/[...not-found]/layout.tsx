import { redirect } from "next/navigation";

export default function NotFoundLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	redirect("/backups");
}
