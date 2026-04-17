import { createBrowserRouter } from "react-router-dom";

import RootLayout         from "./layout";
import LoginPage          from "./(auth)/login/page";
import AuthMiddleware     from "./(app)/middleware";
import HomePage from "./page";
import DashboardPage from "./(app)/dashboard/page";
import AppLayout from "./(app)/layout";
import AgentsPage from "./(app)/agents/page";

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      // Public routes
      { index: true,       element: <HomePage /> },
      { path: "login",     element: <LoginPage /> },
      {
        element: <AuthMiddleware />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: "dashboard", element: <DashboardPage /> },
              { path: "agents", element: <AgentsPage /> },
            ],
          },
        ],
      },
    ],
  },
]);

export default router;
