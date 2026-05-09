import { jwtDecode } from "jwt-decode";
import { useEffect, useState } from "react";
import {
	AppleLogoIcon,
	ArrowClockwiseIcon,
	DeviceMobileIcon,
	FloppyDiskIcon,
	HardDrivesIcon,
	LinuxLogoIcon,
	LockSimpleIcon,
	SignOutIcon,
	SlidersIcon,
	UserIcon,
	WindowsLogoIcon,
	XSquareIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "../../ui/dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getGravatarImageUrl } from "@/lib/gravatar";
import { cn } from "@/lib/utils";

const tabs = [
	{ id: "account", label: "Account", icon: UserIcon },
	{ id: "preferences", label: "Preferences", icon: SlidersIcon },
	{ id: "security", label: "Security", icon: LockSimpleIcon },
] as const;

type TabId = (typeof tabs)[number]["id"];

function AccountPanel() {
	const [user, setUser] = useState({ id: "", name: "", email: "", avatar: "" });
	const [saving, setSaving] = useState(false);
	const [refreshing, setRefreshing] = useState(false);

	useEffect(() => {
		const token = localStorage.getItem("token");
		if (token) {
			const decoded: any = jwtDecode(token);
			setUser({
				id: decoded.user?.id ?? "",
				name: decoded.user?.name ?? "",
				email: decoded.user?.email ?? "",
				avatar: getGravatarImageUrl(decoded.user?.email) ?? "",
			});
		}
	}, []);

	async function handleUsernameChange(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const username = (
			new FormData(e.currentTarget).get("username") as string
		)?.trim();
		if (!username) {
			toast.warning("Username is required");
			return;
		}
		setSaving(true);
		try {
			const res = await fetch(`/api/users/${user.id}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
				body: JSON.stringify({ username }),
			});
			if (!res.ok) {
				const err = await res.json();
				toast.error("Failed to update username", { description: err.error });
			} else {
				toast.success("Username updated");
			}
		} catch (err) {
			toast.error("Failed to update username", {
				description: err instanceof Error ? err.message : String(err),
			});
		} finally {
			setSaving(false);
		}
	}

	async function handleRefreshToken() {
		setRefreshing(true);
		try {
			const res = await fetch("/api/auth/refresh", {
				method: "POST",
				headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
			});
			if (!res.ok) {
				const err = await res.json();
				toast.error("Failed to refresh token", { description: err.error });
			} else {
				const { token } = await res.json();
				localStorage.setItem("token", token);
				toast.success("Token refreshed");
			}
		} catch (err) {
			toast.error("Failed to refresh token", {
				description: err instanceof Error ? err.message : String(err),
			});
		} finally {
			setRefreshing(false);
		}
	}

	return (
		<div className="flex flex-col gap-3">
			{/* User info */}
			<Card size="sm">
				<CardContent className="flex items-center gap-3">
					<div className="size-10 dynround bg-muted flex items-center justify-center shrink-0 overflow-hidden">
						{user.avatar ? (
							<img
								src={user.avatar}
								alt={user.name}
								className="h-full w-full object-cover"
								onError={(e) =>
									((e.currentTarget as HTMLImageElement).style.display = "none")
								}
							/>
						) : (
							<UserIcon className="size-5" />
						)}
					</div>
					<div className="flex flex-col min-w-0">
						<span className="text-sm font-medium leading-none truncate">
							{user.name}
						</span>
						<span className="text-xs text-muted-foreground truncate mt-0.5">
							{user.email}
						</span>
					</div>
				</CardContent>
			</Card>

			{/* Change username */}
			<Card size="sm">
				<CardHeader className="border-b">
					<CardTitle>Username</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={handleUsernameChange}
						id="change-username"
						className="space-y-1.5"
					>
						<Label>New username</Label>
						<Input name="username" placeholder="Enter new username" />
					</form>
				</CardContent>
				<CardFooter className="justify-end">
					<Button
						type="submit"
						form="change-username"
						size="sm"
						disabled={saving}
					>
						<FloppyDiskIcon />
						{saving ? "Saving..." : "Save"}
					</Button>
				</CardFooter>
			</Card>

			{/* Session */}
			<Card size="sm">
				<CardHeader className="border-b">
					<CardTitle>Session</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<div className="flex items-center justify-between gap-4">
						<div className="min-w-0">
							<p className="text-sm font-medium">Refresh Token</p>
							<p className="text-xs text-muted-foreground">
								Invalidate the current session and generate a new token
							</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={handleRefreshToken}
							disabled={refreshing}
							className="shrink-0"
						>
							<ArrowClockwiseIcon />
							{refreshing ? "Refreshing..." : "Refresh"}
						</Button>
					</div>
					<div className="flex items-center justify-between gap-4">
						<div className="min-w-0">
							<p className="text-sm font-medium">Logout</p>
							<p className="text-xs text-muted-foreground">
								Sign out of your account
							</p>
						</div>
						<Button
							variant="destructive"
							size="sm"
							className="shrink-0"
							onClick={() => {
								localStorage.removeItem("token");
								window.location.reload();
							}}
						>
							<SignOutIcon />
							Logout
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function PreferencesPanel() {
	return (
		<div className="text-sm text-muted-foreground">
			Preferences coming soon.
		</div>
	);
}

interface Session {
	id: string;
	info: { browser?: string; os?: string; ip?: string; user_agent?: string };
	created_at: string;
	expires_at: string;
	is_current: boolean;
}

function SecurityPanel() {
	const [sessions, setSessions] = useState<Session[]>([]);
	const [loading, setLoading] = useState(true);
	const [revoking, setRevoking] = useState<string | null>(null);

	async function fetchSessions() {
		setLoading(true);
		try {
			const res = await fetch("/api/users/me/sessions", {
				headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
			});
			if (res.ok) setSessions(await res.json());
		} finally {
			setLoading(false);
		}
	}

	async function revokeSession(id: string) {
		setRevoking(id);
		try {
			const res = await fetch(`/api/users/me/sessions/${id}`, {
				method: "DELETE",
				headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
			});
			if (res.ok) {
				setSessions((prev) => prev.filter((s) => s.id !== id));
				toast.success("Session revoked");
			} else {
				const err = await res.json();
				toast.error("Failed to revoke session", { description: err.error });
			}
		} catch (err) {
			toast.error("Failed to revoke session", {
				description: err instanceof Error ? err.message : String(err),
			});
		} finally {
			setRevoking(null);
		}
	}

	useEffect(() => {
		fetchSessions();
	}, []);

	if (loading) {
		return (
			<div className="text-sm text-muted-foreground">Loading sessions…</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<div>
				<p className="mb-2">Sessions</p>
				{sessions.map((session) => (
					<Card key={session.id} size="sm">
						<CardContent className="flex items-center justify-between gap-4">
							<div className="flex gap-4 items-center">
								<div className="dynround bg-accent/50 p-2">
									{session.info.os == "Linux" ? (
										<LinuxLogoIcon size={25} />
									) : session.info.os == "Windows" ? (
										<WindowsLogoIcon size={25} />
									) : session.info.os == "macOS" ? (
										<AppleLogoIcon size={25} />
									) : session.info.os == "iOS" ||
										session.info.os == "Android" ? (
										<DeviceMobileIcon size={25} />
									) : (
										<HardDrivesIcon size={25} />
									)}
								</div>
								<div className="flex flex-col gap-1 min-w-0">
									<div className="flex items-center gap-2">
										<span className="text-sm font-medium">
											{session.info.browser ?? "Unknown browser"} on{" "}
											{session.info.os ?? "Unknown OS"}
										</span>
										{session.is_current && (
											<span className="dynround text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-medium shrink-0">
												Current
											</span>
										)}
									</div>
									<span className="text-xs text-muted-foreground">
										{session.info.ip ?? "Unknown IP"} · Signed in{" "}
										{new Date(session.created_at).toLocaleDateString(
											undefined,
											{
												month: "short",
												day: "numeric",
												year: "numeric",
											},
										)}
									</span>
								</div>
							</div>
							<Button
								variant="destructive"
								size="sm"
								className="shrink-0"
								disabled={session.is_current || revoking === session.id}
								onClick={() => revokeSession(session.id)}
							>
								<XSquareIcon />
								{revoking === session.id ? "Revoking…" : "Revoke"}
							</Button>
						</CardContent>
					</Card>
				))}
				{sessions.length === 0 && (
					<div className="text-sm text-muted-foreground">
						No active sessions.
					</div>
				)}
			</div>
		</div>
	);
}

const panels: Record<TabId, React.FC> = {
	account: AccountPanel,
	preferences: PreferencesPanel,
	security: SecurityPanel,
};

export default function SettingsDialog({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}): React.JSX.Element {
	const [activeTab, setActiveTab] = useState<TabId>("account");
	const Panel = panels[activeTab];

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent
				className="sm:max-w-4xl sm:min-h-140 overflow-hidden p-0 gap-0"
				showCloseButton={false}
			>
				<div className="flex h-full min-h-72">
					{/* Sidebar */}
					<div className="flex flex-col gap-1 w-44 shrink-0 bg-muted/50 border-r p-3">
						<DialogTitle className="pb-2">Settings</DialogTitle>
						{tabs.map(({ id, label, icon: Icon }) => (
							<Button
								key={id}
								type="button"
								onClick={() => setActiveTab(id)}
								className={cn(
									"text-left justify-start w-full",
									activeTab !== id && "text-muted-foreground",
								)}
								variant={activeTab === id ? "outline" : "ghost"}
							>
								<Icon className="size-4 shrink-0" />
								{label}
							</Button>
						))}
					</div>

					{/* Content */}
					<div className="flex-1 p-4 overflow-y-auto">
						<Panel />
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
