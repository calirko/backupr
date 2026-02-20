import { DataProvider } from "@/hooks/use-data";
import { DialogProvider } from "@/hooks/use-dialog";
import { MemoryProvider } from "@/hooks/use-memory";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Backupr",
	description: "Aplicativo para empresa de controle de backups",
	icons: {
		icon: "/icons/icon.png",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="pt-BR" suppressHydrationWarning className="overflow-y-hidden">
			<body
				className={`${inter.variable} antialiased h-dvh`}
				suppressHydrationWarning
			>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<DataProvider>
						<MemoryProvider>
							<DialogProvider>{children}</DialogProvider>
						</MemoryProvider>
					</DataProvider>
				</ThemeProvider>
				<Toaster position="bottom-center" richColors />
			</body>
		</html>
	);
}
