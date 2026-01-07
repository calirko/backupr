"use client";

import { useParams, useRouter } from "next/navigation";
import UserEntry from "../../userEntry";

export default function EditUserPage() {
	const router = useRouter();
	const params = useParams<{ id: string }>();

	return (
		<UserEntry
			user_id={params.id}
			onCancel={() => router.push("/users")}
			onFinish={() => router.push("/users")}
		/>
	);
}
