import { Button } from "@/components/ui/button";
import { SignInIcon } from "@phosphor-icons/react/dist/ssr";
import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <p>test</p>
      <Link to="/login">
        <Button><SignInIcon/> Login</Button>
      </Link>
    </div>
  );
}
