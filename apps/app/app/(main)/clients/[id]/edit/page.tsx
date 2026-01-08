"use client";

import { useParams, useRouter } from "next/navigation";
import ClientEntry from "../../clientEntry";

export default function EditClientPage() {
	const router = useRouter();
	const params = useParams<{ id: string }>();

	return (
		<ClientEntry
			client_id={params.id}
			onCancel={() => router.push("/clients")}
			onFinish={() => router.push("/clients")}
		/>
	);
}
