import {
	CheckSquareIcon,
	InfoIcon,
	SpinnerIcon,
	WarningIcon,
	XSquareIcon,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className="toaster group"
			icons={{
				success: <CheckSquareIcon className="size-4" />,
				info: <InfoIcon className="size-4" />,
				warning: <WarningIcon className="size-4" />,
				error: <XSquareIcon className="size-4" />,
				loading: <SpinnerIcon className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
					"--z-index": 9999,
				} as React.CSSProperties
			}
			toastOptions={{
				classNames: {
					toast: "cn-toast dynround",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
