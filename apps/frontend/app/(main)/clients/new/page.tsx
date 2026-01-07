"use client";

import { useRouter } from "next/navigation";
import UserEntry from "../userEntry";

export default function NewUserPage() {
	const router = useRouter();

	return (
		<UserEntry
			onCancel={() => router.push("/users")}
			onFinish={() => router.push("/users")}
		/>
	);
}
