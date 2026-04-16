// RootLayout.tsx
import { Outlet } from "react-router-dom";
import "../main.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import GridBackground from "@/components/grid-background";

export default function RootLayout() {
  return (
    <>
      <GridBackground />
      <div className="h-dvh dark text-foreground relative z-10">
        <TooltipProvider>
          <Outlet />
          <Toaster position="bottom-center" expand />
        </TooltipProvider>
      </div>
    </>
  );
}
