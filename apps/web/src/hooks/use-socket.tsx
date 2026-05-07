import {
   createContext,
   ReactNode,
   useCallback,
   useContext,
   useEffect,
   useRef,
   useState,
} from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5174";
const RECONNECT_TIMEOUT_MS = 5000;
const MAX_RECONNECT_TIMEOUT_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 30000;

export interface AgentJobState {
	id: string;
	jobId: string;
	status: "queued" | "running" | "completed" | "failed";
	files: string[];
	compression_level: number;
	use_password: boolean;
	password?: string;
	startedAt?: string;
	completedAt?: string;
	error?: string;
	statusMessage?: string;
}

export interface AgentStatus {
	agentId: string;
	status: "connected" | "disconnected" | string;
	lastSeen: string | null;
	currentJob?: AgentJobState | null;
	jobQueue?: AgentJobState[];
}

interface SocketContextValue {
	send: (message: Record<string, unknown>) => void;
	isConnected: boolean;
	agentStatuses: AgentStatus[];
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({
	token,
	children,
}: {
	token: string;
	children: ReactNode;
}) {
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const reconnectAttemptsRef = useRef(0);
	const shouldReconnectRef = useRef(true);
	const [isConnected, setIsConnected] = useState(false);
	const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);

	const connect = useCallback(() => {
		if (!shouldReconnectRef.current) return;

		const wsUrl = API_URL.replace(/^http/, "ws") + `/web/ws?token=${token}`;
		console.log("[socket] connecting...");

		try {
			const ws = new WebSocket(wsUrl);
			wsRef.current = ws;

			ws.onopen = () => {
				console.log("[socket] connected");
				setIsConnected(true);
				reconnectAttemptsRef.current = 0;

				if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
				heartbeatIntervalRef.current = setInterval(() => {
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(JSON.stringify({ type: "ping" }));
					}
				}, HEARTBEAT_INTERVAL_MS);
			};

			ws.onclose = () => {
				console.log("[socket] disconnected");
				setIsConnected(false);

				if (heartbeatIntervalRef.current) {
					clearInterval(heartbeatIntervalRef.current);
					heartbeatIntervalRef.current = null;
				}

				if (shouldReconnectRef.current) {
					const backoffMs = Math.min(
						RECONNECT_TIMEOUT_MS * Math.pow(1.5, reconnectAttemptsRef.current),
						MAX_RECONNECT_TIMEOUT_MS,
					);
					const delayMs = backoffMs + Math.random() * 1000;
					console.log(`[socket] reconnecting in ${Math.round(delayMs)}ms (attempt ${reconnectAttemptsRef.current + 1})`);
					reconnectAttemptsRef.current++;

					if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
					reconnectTimeoutRef.current = setTimeout(() => connect(), delayMs);
				}
			};

			ws.onerror = (e) => console.error("[socket] error", e);

			ws.onmessage = (event) => {
				let message: Record<string, unknown>;
				try {
					message = JSON.parse(event.data.toString());
				} catch {
					return;
				}

				switch (message.type) {
					case "ping":
						ws.send(JSON.stringify({ type: "pong" }));
						break;
					case "agent_statuses":
						setAgentStatuses((message.agents as AgentStatus[]) ?? []);
						break;
					case "pong":
					case "connected":
						break;
					default:
						console.warn("[socket] unhandled message type:", message.type);
				}
			};
		} catch (error) {
			console.error("[socket] connection error:", error);
		}
	}, [token]);

	useEffect(() => {
		shouldReconnectRef.current = true;
		connect();

		return () => {
			shouldReconnectRef.current = false;
			if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
			if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
		};
	}, [token, connect]);

	const send = useCallback((message: Record<string, unknown>) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(message));
		} else {
			console.warn("[socket] cannot send: not connected");
		}
	}, []);

	return (
		<SocketContext.Provider value={{ send, isConnected, agentStatuses }}>
			{children}
		</SocketContext.Provider>
	);
}

export function useSocket() {
	const ctx = useContext(SocketContext);
	if (!ctx) throw new Error("useSocket must be used inside <SocketProvider>");
	return ctx;
}
