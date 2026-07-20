import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

function getToken(): string | null {
	return localStorage.getItem("token");
}

export default function RootRedirect() {
	const [redirect, setRedirect] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const token = getToken();
		if (!token) {
			setRedirect("/login");
			setLoading(false);
			return;
		}

		fetch("/api/auth/me", {
			headers: { Authorization: `Bearer ${token}` },
		})
			.then((res) => {
				if (res.status === 401) {
					localStorage.removeItem("token");
					setRedirect("/login");
				} else {
					setRedirect("/dashboard");
				}
			})
			.catch(() => {
				// network error - assume authenticated and redirect to dashboard
				setRedirect("/dashboard");
			})
			.finally(() => {
				setLoading(false);
			});
	}, []);

	if (loading) return null;
	if (redirect) return <Navigate to={redirect} replace />;
	return null;
}
