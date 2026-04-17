import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignInIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function LoginPage() {
  const navigate = useNavigate();

  async function onSubmit(form: React.SubmitEvent<HTMLFormElement>) {
    form.preventDefault()
    const data = new FormData(form.currentTarget);
    const email = data.get("email") as string;
    const password = data.get("password") as string;

    if (!email || !password) {
      toast.error("Please fill in all fields", {
        description: "Both email and password are required",
      });
      return;
    }

    await requestLogin(email, password);
  }

  async function requestLogin(email: string, password: string) {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (response.ok) {
        toast.success("Logged in successfully", {
          description: data.message,
        });

        const { token } = data;
        localStorage.setItem("token", token);
        navigate("/dashboard");

      } else {
        toast.error("Login failed", {
          description: data.error,
        });
        console.error(data.error);
      }
    } catch (error) {
      toast.error("An error occurred", {
        description: error instanceof Error ? error.message : String(error),
      });
      console.error(error);
    }
  }

  return (
    <div className="flex w-full h-full items-center justify-center flex-col gap-10">
      <div className="flex gap-6 items-center">
        <img
          src="/icon.png"
          className="h-30"
        />
        <h1 className="text-7xl font-black">Backupr</h1>
      </div>
      <Card className="w-full max-w-sm">
         <CardHeader>
           <CardTitle>Login to your account</CardTitle>
           <CardDescription>
             Enter your email below to login to your account
           </CardDescription>
         </CardHeader>
         <CardContent>
           <form onSubmit={onSubmit} id="login-form">
             <div className="flex flex-col gap-6">
               <div className="grid gap-2">
                 <Label htmlFor="email">Email</Label>
                 <Input
                   name="email"
                   type="email"
                   placeholder="m@example.com"
                   required
                 />
               </div>
               <div className="grid gap-2">
                 <div className="flex items-center">
                   <Label htmlFor="password">Password</Label>

                 </div>
                 <Input name="password" type="password" required />
               </div>
             </div>
           </form>
         </CardContent>
         <CardFooter className="flex-col gap-2">
          <Button type="submit" className="w-full" form="login-form">
            <SignInIcon/>
             Login
           </Button>
         </CardFooter>
      </Card>
      <p className="text-xs text-muted-foreground">Developed and designed by <a href="https://github.com/calirko" className="underline">calirko</a></p>
    </div>
  );
}
