import {
	AppleLogoIcon,
	ArrowClockwiseIcon,
	ChartBarIcon,
	DeviceMobileIcon,
	EnvelopeSimpleIcon,
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
import { jwtDecode } from "jwt-decode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Dialog, DialogContent, DialogTitle } from "../../ui/dialog";

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
							onClick={async () => {
								try {
									await fetch("/api/users/me/logout", {
										method: "POST",
										headers: {
											Authorization: `Bearer ${localStorage.getItem("token")}`,
										},
									});
								} finally {
									localStorage.removeItem("token");
									window.location.reload();
								}
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

type EmailPreference = "receive_emails" | "receive_weekly_report";

const EMAIL_PREFERENCES: {
	key: EmailPreference;
	label: string;
	description: string;
	enabledToast: string;
	disabledToast: string;
}[] = [
	{
		key: "receive_emails",
		label: "Alerts",
		description:
			"Get an email when a backup fails, and reminders while a job goes 5+ days without a successful backup.",
		enabledToast: "Email alerts enabled",
		disabledToast: "Email alerts disabled",
	},
	{
		key: "receive_weekly_report",
		label: "Weekly report",
		description:
			"A summary every Monday: backups run, success rate, daily activity, agent uptime, job health and storage.",
		enabledToast: "Weekly report enabled",
		disabledToast: "Weekly report disabled",
	},
];

function PreferencesPanel() {
	const [status, setStatus] = useState<
		({ enabled: boolean } & Record<EmailPreference, boolean>) | null
	>(null);
	const [userId, setUserId] = useState("");
	const [saving, setSaving] = useState<EmailPreference | null>(null);
	const [sending, setSending] = useState<"test" | "weekly-report" | null>(null);

	useEffect(() => {
		const token = localStorage.getItem("token");
		if (token) {
			const decoded: any = jwtDecode(token);
			setUserId(decoded.user?.id ?? "");
		}
		fetch("/api/notifications/status", {
			headers: { Authorization: `Bearer ${token}` },
		})
			.then((res) => (res.ok ? res.json() : null))
			.then(setStatus)
			.catch(() => setStatus(null));
	}, []);

	async function handleToggle(
		pref: (typeof EMAIL_PREFERENCES)[number],
		value: boolean,
	) {
		if (!status) return;
		setSaving(pref.key);
		try {
			const res = await fetch(`/api/users/${userId}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
				body: JSON.stringify({ [pref.key]: value }),
			});
			if (!res.ok) {
				const err = await res.json();
				toast.error("Failed to update email preferences", {
					description: err.error,
				});
			} else {
				setStatus({ ...status, [pref.key]: value });
				toast.success(value ? pref.enabledToast : pref.disabledToast);
			}
		} catch (err) {
			toast.error("Failed to update email preferences", {
				description: err instanceof Error ? err.message : String(err),
			});
		} finally {
			setSaving(null);
		}
	}

	async function handleSend(kind: "test" | "weekly-report") {
		const label = kind === "test" ? "test email" : "weekly report";
		setSending(kind);
		try {
			const res = await fetch(`/api/notifications/${kind}`, {
				method: "POST",
				headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
			});
			const body = await res.json();
			if (!res.ok) {
				toast.error(`Failed to send ${label}`, { description: body.error });
			} else {
				toast.success(
					kind === "test" ? "Test email sent" : "Weekly report sent",
					{ description: body.message },
				);
			}
		} catch (err) {
			toast.error(`Failed to send ${label}`, {
				description: err instanceof Error ? err.message : String(err),
			});
		} finally {
			setSending(null);
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<Card size="sm">
				<CardHeader className="border-b">
					<CardTitle>Email</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{EMAIL_PREFERENCES.map((pref) => (
						<div key={pref.key} className="flex items-start gap-2">
							<Checkbox
								id={`settings_${pref.key}`}
								checked={status?.[pref.key] ?? false}
								onCheckedChange={(v) => handleToggle(pref, v === true)}
								disabled={!status || saving !== null}
								className="mb-0 mt-0.5"
							/>
							<div className="min-w-0">
								<Label
									htmlFor={`settings_${pref.key}`}
									className="cursor-pointer"
								>
									{pref.label}
								</Label>
								<p className="text-xs text-muted-foreground mt-0.5">
									{pref.description}
								</p>
							</div>
						</div>
					))}
					{status && !status.enabled && (
						<p className="text-xs text-muted-foreground">
							Email isn't configured on the server yet, so no emails will be
							sent until the MAIL_* settings are set.
						</p>
					)}
				</CardContent>
				<CardFooter className="justify-end gap-2 flex-wrap">
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleSend("weekly-report")}
						disabled={!status?.enabled || sending !== null}
					>
						<ChartBarIcon />
						{sending === "weekly-report" ? "Sending..." : "Send report now"}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleSend("test")}
						disabled={!status?.enabled || sending !== null}
					>
						<EnvelopeSimpleIcon />
						{sending === "test" ? "Sending..." : "Send test email"}
					</Button>
				</CardFooter>
			</Card>
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
				<div className="min-h-10 flex items-center justify-center gap-2 flex-col">
					{sessions.map((session) => (
						<Card key={session.id} size="sm" className="w-full">
							<CardContent className="flex items-center justify-between gap-4 w-full">
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
