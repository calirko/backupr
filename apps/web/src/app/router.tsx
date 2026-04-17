import { createBrowserRouter } from "react-router-dom";
import AgentsPage from "./(app)/agents/page";
import DashboardPage from "./(app)/dashboard/page";
import AppLayout from "./(app)/layout";
import AuthMiddleware from "./(app)/middleware";
import UsersPage from "./(app)/users/page";
import LoginPage from "./(auth)/login/page";
import RootLayout from "./layout";
import HomePage from "./page";

const router = createBrowserRouter([
	{
		path: "/",
		element: <RootLayout />,
		children: [
			// Public routes
			{ index: true, element: <HomePage /> },
			{ path: "login", element: <LoginPage /> },
			{
				element: <AuthMiddleware />,
				children: [
					{
						element: <AppLayout />,
						children: [
							{ path: "dashboard", element: <DashboardPage /> },
							{ path: "agents", element: <AgentsPage /> },
							{ path: "users", element: <UsersPage /> },
						],
					},
				],
			},
		],
	},
]);

export default router;
