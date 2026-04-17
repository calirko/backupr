import { ComputerTowerIcon, HouseIcon, PackageIcon, UserIcon } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import UserDropdown from "./user-dropdown";
import { useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  { label: "Dashboard", path: "/dashboard", icon: <HouseIcon/> },
  { label: "Agents", path: "/agents", icon: <ComputerTowerIcon/> },
  { label: "Backup Jobs", path: "/backup-jobs", icon: <PackageIcon/> },
  { label: "Users", path: "/users", icon: <UserIcon/> },
];

export default function Navbar() {
  const navigate = useNavigate();

  return (
    <nav className="w-full h-14 border-b bg-background">
      <div className="h-full flex justify-between items-center">
        <div className="h-full flex">
          <div className="h-full flex items-center p-2 border-r">
            <img
              src="icon.png"
              alt="logo"
              className="h-full"
            />
          </div>
          <div>
            <div className="h-full flex items-center">
              <div className="h-full flex items-center">
                {NAV_ITEMS.map((item) => (
                  <div key={item.path} className="h-full flex items-center">
                    <div className={`h-full flex items-center border-r gap-1 ${item.path === window.location.pathname ? "" : "text-muted-foreground"}`}>
                      <Button variant="ghost" className="h-full px-4" onClick={() => navigate(item.path)}>
                        {item.icon}
                        {item.label}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="h-full p-2 border-l">
          <UserDropdown/>
        </div>
      </div>
    </nav>
  );
}
