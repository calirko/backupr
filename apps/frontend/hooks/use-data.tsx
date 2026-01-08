"use client";

import React, {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

// Types for the data context
interface Filters {
	[key: string]: unknown;
}

interface OrderBy {
	[key: string]: "asc" | "desc";
}

interface PageState {
	filters: Filters;
	skip: number;
	take: number;
	orderBy: OrderBy;
	selectedRows: any[];
}

type Listener = () => void;

// Default values
const getDefaultFilters = (): Filters => {
	if (typeof window === "undefined") return {};
	try {
		const company = localStorage.getItem("company");
		if (company) {
			const parsed = JSON.parse(company);
			return { company_id: parsed?.id };
		}
	} catch (error) {
		console.error("Error parsing company from localStorage:", error);
	}
	return {};
};

const defaultSkip = 0;
const defaultTake = 35;
const defaultOrderBy: OrderBy = { createdAt: "desc" };
const defaultSelectedRows: any[] = [];

const getDefaultPageState = (
	initialFilters?: Filters,
	initialSkip?: number,
	initialTake?: number,
	initialOrderBy?: OrderBy,
	initialSelectedRows?: any[],
): PageState => ({
	filters: initialFilters ?? getDefaultFilters(),
	skip: initialSkip ?? defaultSkip,
	take: initialTake ?? defaultTake,
	orderBy: initialOrderBy ?? defaultOrderBy,
	selectedRows: initialSelectedRows ?? defaultSelectedRows,
});

// Create context
const DataContext = createContext<
	| {
			storeRef: React.MutableRefObject<Map<string, PageState>>;
			listenersRef: React.MutableRefObject<Map<string, Set<Listener>>>;
			initialFilters: Filters;
			initialSkip: number;
			initialTake: number;
			initialOrderBy: OrderBy;
			initialSelectedRows: string[];
			clearAllFilters: () => void;
	  }
	| undefined
>(undefined);

// Provider props
interface DataProviderProps {
	children: ReactNode;
	initialFilters?: Filters;
	initialSkip?: number;
	initialTake?: number;
	initialOrderBy?: OrderBy;
	initialSelectedRows?: string[];
}

// Provider component
export function DataProvider({
	children,
	initialFilters = getDefaultFilters(),
	initialSkip = defaultSkip,
	initialTake = defaultTake,
	initialOrderBy = defaultOrderBy,
	initialSelectedRows = defaultSelectedRows,
}: DataProviderProps) {
	// Global store for all data keys (shared across all instances)
	const storeRef = useRef<Map<string, PageState>>(new Map());
	// Listeners for each key
	const listenersRef = useRef<Map<string, Set<Listener>>>(new Map());

	// Function to clear filters for all keys
	const clearAllFilters = useCallback(() => {
		// Iterate through all keys in the store
		for (const [key, state] of storeRef.current.entries()) {
			// Clear filters for this key
			storeRef.current.set(key, {
				...state,
				filters: {},
			});

			// Notify all listeners for this key
			const listeners = listenersRef.current.get(key);
			if (listeners) {
				for (const listener of listeners) {
					listener();
				}
			}
		}
	}, []);

	const value = {
		storeRef,
		listenersRef,
		initialFilters,
		initialSkip,
		initialTake,
		initialOrderBy,
		initialSelectedRows,
		clearAllFilters,
	};

	return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// Hook to use the data context
export function useData(key: string) {
	const context = useContext(DataContext);

	if (context === undefined) {
		throw new Error("useData must be used within a DataProvider");
	}

	const {
		storeRef,
		listenersRef,
		initialFilters,
		initialSkip,
		initialTake,
		initialOrderBy,
		initialSelectedRows,
		clearAllFilters: clearAllFiltersGlobal,
	} = context;

	// Use ref to track current key to prevent race conditions
	const keyRef = useRef(key);

	// Initialize state for current key if it doesn't exist
	if (!storeRef.current.has(key)) {
		storeRef.current.set(
			key,
			getDefaultPageState(
				initialFilters,
				initialSkip,
				initialTake,
				initialOrderBy,
				initialSelectedRows,
			),
		);
	}

	// Current state for this key
	const [currentState, setCurrentState] = useState<PageState>(() => {
		const state = storeRef.current.get(key);
		if (!state) {
			const defaultState = getDefaultPageState(
				initialFilters,
				initialSkip,
				initialTake,
				initialOrderBy,
				initialSelectedRows,
			);
			storeRef.current.set(key, defaultState);
			return defaultState;
		}
		return state;
	});

	// Subscribe to changes for this key
	useEffect(() => {
		keyRef.current = key;

		// Initialize state for new key if it doesn't exist
		if (!storeRef.current.has(key)) {
			storeRef.current.set(
				key,
				getDefaultPageState(
					initialFilters,
					initialSkip,
					initialTake,
					initialOrderBy,
					initialSelectedRows,
				),
			);
		}

		// Update current state to reflect the new key's state
		const state = storeRef.current.get(key);
		if (state) {
			setCurrentState(state);
		}

		// Create listener for this instance
		const listener = () => {
			const updatedState = storeRef.current.get(key);
			if (updatedState) {
				setCurrentState(updatedState);
			}
		};

		// Add listener to the set for this key
		if (!listenersRef.current.has(key)) {
			listenersRef.current.set(key, new Set());
		}
		listenersRef.current.get(key)?.add(listener);

		// Cleanup: remove listener when component unmounts or key changes
		return () => {
			listenersRef.current.get(key)?.delete(listener);
		};
	}, [
		key,
		storeRef,
		listenersRef,
		initialFilters,
		initialSkip,
		initialTake,
		initialOrderBy,
		initialSelectedRows,
	]);

	// Helper function to update store and notify all listeners
	const updateStore = useCallback(
		(updater: (state: PageState) => PageState) => {
			const currentKey = keyRef.current;
			const currentPageState = storeRef.current.get(currentKey);
			if (!currentPageState) return;

			const newState = updater(currentPageState);
			storeRef.current.set(currentKey, newState);

			// Notify all listeners subscribed to this key
			const listeners = listenersRef.current.get(currentKey);
			if (listeners) {
				for (const listener of listeners) {
					listener();
				}
			}
		},
		[storeRef, listenersRef],
	);

	// Setters with key safety
	const setFilters = useCallback(
		(filters: Filters | ((prev: Filters) => Filters)) => {
			updateStore((state) => ({
				...state,
				filters:
					typeof filters === "function" ? filters(state.filters) : filters,
			}));
		},
		[updateStore],
	);

	const setSkip = useCallback(
		(skip: number | ((prev: number) => number)) => {
			updateStore((state) => ({
				...state,
				skip: typeof skip === "function" ? skip(state.skip) : skip,
			}));
		},
		[updateStore],
	);

	const setTake = useCallback(
		(take: number | ((prev: number) => number)) => {
			updateStore((state) => ({
				...state,
				take: typeof take === "function" ? take(state.take) : take,
			}));
		},
		[updateStore],
	);

	const setOrderBy = useCallback(
		(orderBy: OrderBy | ((prev: OrderBy) => OrderBy)) => {
			updateStore((state) => ({
				...state,
				orderBy:
					typeof orderBy === "function" ? orderBy(state.orderBy) : orderBy,
			}));
		},
		[updateStore],
	);

	const setSelectedRows = useCallback(
		(selectedRows: any[] | ((prev: any[]) => any[])) => {
			updateStore((state) => ({
				...state,
				selectedRows:
					typeof selectedRows === "function"
						? selectedRows(state.selectedRows)
						: selectedRows,
			}));
		},
		[updateStore],
	);

	// Utility functions
	const updateFilter = useCallback(
		(filterKey: string, value: unknown) => {
			updateStore((state) => ({
				...state,
				filters: {
					...state.filters,
					[filterKey]: value,
				},
			}));
		},
		[updateStore],
	);

	const removeFilter = useCallback(
		(filterKey: string) => {
			updateStore((state) => {
				const { [filterKey]: _removed, ...rest } = state.filters;
				return {
					...state,
					filters: rest,
				};
			});
		},
		[updateStore],
	);

	const clearFilters = useCallback(() => {
		updateStore((state) => ({
			...state,
			filters: {},
		}));
	}, [updateStore]);

	const resetPagination = useCallback(() => {
		updateStore((state) => ({
			...state,
			skip: 0,
		}));
	}, [updateStore]);

	const updateOrderBy = useCallback(
		(field: string, direction: "asc" | "desc") => {
			updateStore((state) => ({
				...state,
				orderBy: {
					...state.orderBy,
					[field]: direction,
				},
			}));
		},
		[updateStore],
	);

	const clearOrderBy = useCallback(() => {
		updateStore((state) => ({
			...state,
			orderBy: {},
		}));
	}, [updateStore]);

	const addSelectedRow = useCallback(
		(id: string) => {
			updateStore((state) => ({
				...state,
				selectedRows: state.selectedRows.includes(id)
					? state.selectedRows
					: [...state.selectedRows, id],
			}));
		},
		[updateStore],
	);

	const removeSelectedRow = useCallback(
		(id: string) => {
			updateStore((state) => ({
				...state,
				selectedRows: state.selectedRows.filter((rowId) => rowId !== id),
			}));
		},
		[updateStore],
	);

	const toggleSelectedRow = useCallback(
		(id: string) => {
			updateStore((state) => ({
				...state,
				selectedRows: state.selectedRows.includes(id)
					? state.selectedRows.filter((rowId) => rowId !== id)
					: [...state.selectedRows, id],
			}));
		},
		[updateStore],
	);

	const clearSelectedRows = useCallback(() => {
		updateStore((state) => ({
			...state,
			selectedRows: [],
		}));
	}, [updateStore]);

	const selectAllRows = useCallback(
		(ids: string[]) => {
			updateStore((state) => ({
				...state,
				selectedRows: ids,
			}));
		},
		[updateStore],
	);

	return {
		// State values from current key
		filters: currentState.filters,
		skip: currentState.skip,
		take: currentState.take,
		orderBy: currentState.orderBy,
		selectedRows: currentState.selectedRows,

		// Setters
		setFilters,
		setSkip,
		setTake,
		setOrderBy,
		setSelectedRows,

		// Utility functions
		updateFilter,
		removeFilter,
		clearFilters,
		resetPagination,
		updateOrderBy,
		clearOrderBy,
		addSelectedRow,
		removeSelectedRow,
		toggleSelectedRow,
		clearSelectedRows,
		selectAllRows,

		// Global utilities
		clearAllFilters: clearAllFiltersGlobal,
	};
}
