import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@phosphor-icons/react";

export default function DashboardPage() {
	const [data, setData] = useState();

	async function fetchData() {
		try {
			const response = await fetch("/api/dashboard", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			const json = await response.json();

			if (response.ok) {
				setData(json);
			} else {
				console.error(json);
				toast.error("Error loading dashboard", {
					description: json.error,
				});
			}
		} catch (error) {
			console.error(error);
			toast.error("Error loading dashboard", {
				description: error.message,
			});
		}
	}

	useEffect(() => {
		fetchData();
	}, []);

	return (
		<div className="w-full grow px-14 pt-4 flex flex-col gap-6">
			<div>
				<h1 className="text-4xl font-black">Dashboard</h1>
				<p className="text-muted-foreground text-sm">
					Overview of your agents and backup status.
				</p>
			</div>
			<div className="grid grid-cols-4 gap-4">
				<Card>
					<CardHeader>
						<CardTitle>Total Agents</CardTitle>
						{/*<CardDescription>
                 The total number of agents (computers running the application) connected.
               </CardDescription>*/}
					</CardHeader>
					<CardContent>
						<h1 className="text-4xl font-black">{data?.stats?.total_agents}</h1>
						<p className="text-muted-foreground text-xs">
							{data?.stats?.active_agents} currently online
						</p>
					</CardContent>
					<CardFooter>
						<Button variant="outline" className="w-full">
							<ArrowRightIcon />
							Manage Agents
						</Button>
					</CardFooter>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Active Jobs</CardTitle>
						{/*<CardDescription>
                 The total number of agents (computers running the application) connected.
               </CardDescription>*/}
					</CardHeader>
					<CardContent>
						<h1 className="text-4xl font-black">{data?.stats?.total_jobs}</h1>
						<p className="text-muted-foreground text-xs">Across all agents</p>
					</CardContent>
					<CardFooter>
						<Button variant="outline" className="w-full">
							<ArrowRightIcon />
							Manage Jobs
						</Button>
					</CardFooter>
				</Card>

				<div className="bg-red-500 col-span-2 row-span-2"></div>

				<Card>
					<CardHeader>
						<CardTitle>Total Agents</CardTitle>
						{/*<CardDescription>
                 The total number of agents (computers running the application) connected.
               </CardDescription>*/}
					</CardHeader>
					<CardContent>
						<h1 className="text-4xl font-black">{data?.stats?.total_jobs}</h1>
						<p className="text-muted-foreground text-xs">
							Currently online {data?.stats?.active_agents}
						</p>
					</CardContent>
					<CardFooter>
						<Button variant="outline" className="w-full">
							<ArrowRightIcon />
							Manage Agents
						</Button>
					</CardFooter>
				</Card>
			</div>
		</div>
	);
}
