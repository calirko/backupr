import { createBrowserRouter } from "react-router-dom";
import AgentsPage from "./(app)/agents/page";
import BackupJobsPage from "./(app)/backup-jobs/page";
import BackupPoliciesPage from "./(app)/backup-policies/page";
import AgentJobsPage from "./(app)/backups/agent-jobs";
import BackupsPage from "./(app)/backups/page";
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
			// Root redirect based on auth status
			{ index: true, element: <HomePage /> },
			// Login route (public)
			{ path: "login", element: <LoginPage /> },
			// Protected app routes
			{
				element: <AuthMiddleware />,
				children: [
					{
						element: <AppLayout />,
						children: [
							{ path: "dashboard", element: <DashboardPage /> },
							{ path: "agents", element: <AgentsPage /> },
							{ path: "users", element: <UsersPage /> },
							{ path: "backup-jobs", element: <BackupJobsPage /> },
							{ path: "backup-policies", element: <BackupPoliciesPage /> },
							{ path: "backups", element: <BackupsPage /> },
							{ path: "backups/:agentId/jobs", element: <AgentJobsPage /> },
						],
					},
				],
			},
			// Catch-all: redirect non-existent pages based on auth status
			{ path: "*", element: <AuthMiddleware /> },
		],
	},
]);

export default router;
