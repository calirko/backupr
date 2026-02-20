import { createContext, useContext, useEffect, useRef, useState } from "react";

const ThemeContext = createContext({
	theme: "light",
	toggleTheme: () => {},
});

export const useTheme = () => {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within ThemeProvider");
	}
	return context;
};

export function ThemeProvider({ children }) {
	const [theme, setTheme] = useState(() => {
		if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
			return "dark";
		}
		return "light";
	});

	const isInitializing = useRef(true);

	// Load saved theme from store on mount
	useEffect(() => {
		const loadTheme = async () => {
			try {
				const savedTheme = await window.store?.get("theme");
				if (savedTheme === "light" || savedTheme === "dark") {
					setTheme(savedTheme);
				}
			} catch (e) {
				console.error("Failed to load theme:", e);
			} finally {
				isInitializing.current = false;
			}
		};
		loadTheme();
	}, []);

	// Only apply theme and save to store after initialization
	useEffect(() => {
		// Skip saving during initialization to prevent double writes
		if (isInitializing.current) return;

		const root = window.document.documentElement;
		root.classList.remove("light", "dark");
		root.classList.add(theme);
		window.store?.set("theme", theme);
	}, [theme]);

	const toggleTheme = () => {
		setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
	};

	return (
		<ThemeContext.Provider value={{ theme, toggleTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}
