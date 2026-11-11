import {
	CheckSquareIcon,
	InfoIcon,
	WarningIcon,
	XSquareIcon,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Subtle per-level tint, like the badges: a hint of the level color mixed into
 * the popover background (kept opaque so page content doesn't show through),
 * a tinted border, and text in the level color itself.
 *
 * Mixing happens in oklab, not oklch: oklch interpolates hue, and the theme's
 * neutrals carry a blue hue, which would drag e.g. red toward purple.
 */
function levelVars(level: string, color: string) {
	return {
		[`--${level}-bg`]: `color-mix(in oklab, ${color} 10%, var(--popover))`,
		[`--${level}-border`]: `color-mix(in oklab, ${color} 30%, transparent)`,
		[`--${level}-text`]: color,
	};
}

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className="toaster group"
			icons={{
				warning: <WarningIcon style={{ color: "var(--yellowish)" }} />,
				error: <XSquareIcon style={{ color: "var(--destructive)" }} />,
				success: <CheckSquareIcon style={{ color: "var(--greenish)" }} />,
				info: <InfoIcon style={{ color: "var(--blueish)" }} />,
			}}
			position="bottom-center"
			expand
			richColors
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--dyn-radius)",
					...levelVars("success", "var(--greenish)"),
					...levelVars("error", "var(--destructive)"),
					...levelVars("warning", "var(--yellowish)"),
					...levelVars("info", "var(--blueish)"),
				} as React.CSSProperties
			}
			toastOptions={{
				classNames: {
					toast: "cn-toast dynround",
					description: "opacity-80",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
