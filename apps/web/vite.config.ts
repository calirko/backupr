import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");

	return {
		plugins: [react(), tailwindcss()],
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src"),
			},
		},
		build: {
			target: "esnext", // or "es2020" if you need broader browser support
			minify: "oxc", // much faster than terser on the big main chunk; terser hung slow build hosts
			cssMinify: "lightningcss", // much faster than the default esbuild CSS minifier
			cssCodeSplit: true, // splits CSS per async chunk (default true, but worth being explicit)
			sourcemap: false, // disable for production unless you need it
			reportCompressedSize: false, // speeds up build, skips gzip size reporting
			chunkSizeWarningLimit: 1000,
			rolldownOptions: {
				output: {
					minify: {
						compress: { dropConsole: true, dropDebugger: true },
						mangle: true,
						codegen: { removeWhitespace: true },
					},
					manualChunks(id) {
						if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/"))
							return "react";
						if (id.includes("node_modules/react-router-dom"))
							return "router";
					},
				},
			},
		},
		server: {
			port: 5173,
			...(mode !== "production" && {
				proxy: {
					"/api": {
						target: env.API_URL,
						changeOrigin: true,
						ws: true,
					},
				},
			}),
		},
	};
});
