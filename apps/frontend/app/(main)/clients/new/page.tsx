"use client";

import { useRouter } from "next/navigation";
import ClientEntry from "../clientEntry";

export default function NewClientPage() {
	const router = useRouter();

	return (
		<ClientEntry
			onCancel={() => router.push("/clients")}
			onFinish={() => router.push("/clients")}
		/>
	);
}
