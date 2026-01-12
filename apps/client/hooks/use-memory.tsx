"use client";

import React, {
	createContext,
	useContext,
	useState,
	useRef,
	useCallback,
	type ReactNode,
	useEffect,
} from "react";

// Types for the memory context
interface MemoryState<T = any> {
	data: T | null;
	fetchFn: (() => Promise<T>) | null;
	isLoading: boolean;
}

type Listener = () => void;

// Create context
const MemoryContext = createContext<
	| {
			storeRef: React.MutableRefObject<Map<string, MemoryState>>;
			listenersRef: React.MutableRefObject<Map<string, Set<Listener>>>;
	  }
	| undefined
>(undefined);

// Provider props
interface MemoryProviderProps {
	children: ReactNode;
}

// Provider component
export function MemoryProvider({ children }: MemoryProviderProps) {
	const storeRef = useRef<Map<string, MemoryState>>(new Map());
	const listenersRef = useRef<Map<string, Set<Listener>>>(new Map());

	const value = {
		storeRef,
		listenersRef,
	};

	return (
		<MemoryContext.Provider value={value}>{children}</MemoryContext.Provider>
	);
}

// Hook to use the memory context
export function useMemory<T = any>(key: string) {
	const context = useContext(MemoryContext);

	if (context === undefined) {
		throw new Error("useMemory must be used within a MemoryProvider");
	}

	const { storeRef, listenersRef } = context;

	const keyRef = useRef(key);

	// Initialize state for current key if it doesn't exist
	if (!storeRef.current.has(key)) {
		storeRef.current.set(key, {
			data: null,
			fetchFn: null,
			isLoading: false,
		});
	}

	const [currentState, setCurrentState] = useState<MemoryState<T>>(() => {
		const state = storeRef.current.get(key);
		if (!state) {
			const defaultState: MemoryState<T> = {
				data: null,
				fetchFn: null,
				isLoading: false,
			};
			storeRef.current.set(key, defaultState);
			return defaultState;
		}
		return state as MemoryState<T>;
	});

	// Subscribe to changes for this key
	useEffect(() => {
		keyRef.current = key;

		if (!storeRef.current.has(key)) {
			storeRef.current.set(key, {
				data: null,
				fetchFn: null,
				isLoading: false,
			});
		}

		const state = storeRef.current.get(key);
		if (state) {
			setCurrentState(state as MemoryState<T>);
		}

		const listener = () => {
			const updatedState = storeRef.current.get(key);
			if (updatedState) {
				setCurrentState(updatedState as MemoryState<T>);
			}
		};

		if (!listenersRef.current.has(key)) {
			listenersRef.current.set(key, new Set());
		}
		listenersRef.current.get(key)?.add(listener);

		return () => {
			listenersRef.current.get(key)?.delete(listener);
		};
	}, [key, storeRef, listenersRef]);

	// Helper function to update store and notify all listeners
	const updateStore = useCallback(
		(updater: (state: MemoryState<T>) => MemoryState<T>) => {
			const currentKey = keyRef.current;
			const currentMemoryState = storeRef.current.get(currentKey);
			if (!currentMemoryState) return;

			const newState = updater(currentMemoryState as MemoryState<T>);
			storeRef.current.set(currentKey, newState);

			const listeners = listenersRef.current.get(currentKey);
			if (listeners) {
				for (const listener of listeners) {
					listener();
				}
			}
		},
		[storeRef, listenersRef],
	);

	// Set data
	const setData = useCallback(
		(data: T | null) => {
			updateStore((state) => ({
				...state,
				data,
			}));
		},
		[updateStore],
	);

	// Set fetch function
	const setFetchFn = useCallback(
		(fetchFn: (() => Promise<T>) | null) => {
			updateStore((state) => ({
				...state,
				fetchFn,
			}));
		},
		[updateStore],
	);

	// Reload function
	const reload = useCallback(async () => {
		const currentMemoryState = storeRef.current.get(keyRef.current);
		if (!currentMemoryState?.fetchFn) {
			console.warn(`No fetch function set for key: ${keyRef.current}`);
			return;
		}

		updateStore((state) => ({
			...state,
			isLoading: true,
		}));

		try {
			const result = await currentMemoryState.fetchFn();
			updateStore((state) => ({
				...state,
				data: result,
				isLoading: false,
			}));
		} catch (error) {
			console.error(`Error reloading data for key ${keyRef.current}:`, error);
			updateStore((state) => ({
				...state,
				isLoading: false,
			}));
		}
	}, [storeRef, updateStore]);

	return {
		data: currentState.data,
		isLoading: currentState.isLoading,
		setData,
		setFetchFn,
		load: reload,
	};
}
