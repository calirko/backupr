"use client";

import {
	useState,
	useCallback,
	useContext,
	createContext,
	type ReactNode,
	useRef,
	type JSX,
	useEffect,
} from "react";

type DialogComponent<Props, Result = void> = (
	props: Props & { open: boolean; onClose: (result?: Result) => void },
) => JSX.Element;

type DialogState = {
	id: string;
	// biome-ignore lint/suspicious/noExplicitAny: Generic dialog system requires dynamic typing
	Component: DialogComponent<any, any>;
	// biome-ignore lint/suspicious/noExplicitAny: Props are validated at runtime
	props: any;
	// biome-ignore lint/suspicious/noExplicitAny: Result type is preserved through generics
	resolve: (result: any) => void;
	isVisible: boolean;
};

type DialogQueueItem = {
	id: string;
	// biome-ignore lint/suspicious/noExplicitAny: Generic dialog system requires dynamic typing
	Component: DialogComponent<any, any>;
	// biome-ignore lint/suspicious/noExplicitAny: Props are validated at runtime
	props: any;
	// biome-ignore lint/suspicious/noExplicitAny: Result type is preserved through generics
	resolve: (result: any) => void;
};

type DialogContextType = {
	openDialog: <Props extends Record<string, unknown>, Result = void>(
		Component: DialogComponent<Props, Result>,
		props?: Omit<Props, "open" | "onClose">,
	) => Promise<Result>;
};

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function useDialog() {
	const ctx = useContext(DialogContext);
	if (!ctx) throw new Error("useDialog must be used within a DialogProvider");
	return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
	const [dialogStack, setDialogStack] = useState<DialogState[]>([]);
	const queueRef = useRef<DialogQueueItem[]>([]);
	const processingRef = useRef(false);
	const closingIdsRef = useRef<Set<string>>(new Set());

	const processQueue = useCallback(() => {
		// Prevent concurrent processing
		if (processingRef.current) return;

		const next = queueRef.current.shift();
		if (next) {
			processingRef.current = true;
			// Add dialog to stack immediately
			setDialogStack((prev) => [
				...prev,
				{
					id: next.id,
					Component: next.Component,
					props: next.props,
					resolve: next.resolve,
					isVisible: false,
				},
			]);
			// Use setTimeout to ensure state update completes before showing
			setTimeout(() => {
				setDialogStack((prev) =>
					prev.map((d) => (d.id === next.id ? { ...d, isVisible: true } : d)),
				);
				processingRef.current = false;
			}, 0);
		}
	}, []);

	// Process queue when possible
	useEffect(() => {
		if (!processingRef.current && queueRef.current.length > 0) {
			processQueue();
		}
	}, [processQueue]);

	const openDialog = useCallback(
		<Props extends Record<string, unknown>, Result = void>(
			Component: DialogComponent<Props, Result>,
			props?: Omit<Props, "open" | "onClose">,
		): Promise<Result> => {
			return new Promise<Result>((resolve) => {
				const id = `dialog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
				queueRef.current.push({ id, Component, props: props || {}, resolve });
				// Process immediately if not already processing
				if (!processingRef.current) {
					processQueue();
				}
			});
		},
		[processQueue],
	);

	const handleClose = useCallback((dialogId: string, result?: unknown) => {
		// Mark as closing
		closingIdsRef.current.add(dialogId);

		// Start closing animation
		setDialogStack((prev) =>
			prev.map((d) => (d.id === dialogId ? { ...d, isVisible: false } : d)),
		);

		// Remove after animation completes
		setTimeout(() => {
			setDialogStack((prev) => {
				const dialog = prev.find((d) => d.id === dialogId);
				if (dialog) {
					dialog.resolve(result);
				}
				closingIdsRef.current.delete(dialogId);
				return prev.filter((d) => d.id !== dialogId);
			});
		}, 300); // Match your animation duration
	}, []);

	const dialogElements = dialogStack.map((dialog) => (
		<dialog.Component
			key={dialog.id}
			{...dialog.props}
			open={dialog.isVisible}
			onClose={(result?: unknown) => handleClose(dialog.id, result)}
		/>
	));

	return (
		<DialogContext.Provider value={{ openDialog }}>
			{children}
			{dialogElements}
		</DialogContext.Provider>
	);
}
