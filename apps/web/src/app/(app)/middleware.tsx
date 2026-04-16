import { Navigate, Outlet, useLocation } from "react-router-dom";

function getToken(): string | null {
  return localStorage.getItem("token");
}

export default function AuthMiddleware() {
  const token = getToken();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
