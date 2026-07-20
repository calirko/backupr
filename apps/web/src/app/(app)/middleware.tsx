import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

function getToken(): string | null {
	return localStorage.getItem("token");
}

export default function AuthMiddleware() {
	const location = useLocation();
	const [valid, setValid] = useState<boolean | null>(null);

	useEffect(() => {
		const token = getToken();
		if (!token) {
			setValid(false);
			return;
		}

		fetch("/api/auth/me", {
			headers: { Authorization: `Bearer ${token}` },
		})
			.then((res) => {
				if (res.status === 401) {
					localStorage.removeItem("token");
					setValid(false);
				} else {
					setValid(true);
				}
			})
			.catch(() => {
				// network error - keep the user in, retry on next navigation
				setValid(true);
			});
	}, [location.pathname]);

	if (valid === null) return null;
	if (!valid)
		return <Navigate to="/login" state={{ from: location }} replace />;
	return <Outlet />;
}
