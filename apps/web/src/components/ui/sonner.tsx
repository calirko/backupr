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
				warning: <WarningIcon className="text-orange-200" />,
				error: <XSquareIcon className="text-destructive" />,
				success: <CheckSquareIcon style={{ color: "var(--greenish)" }} />,
				info: <InfoIcon />,
			}}
			position="bottom-center"
			expand
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--dyn-radius)",
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
