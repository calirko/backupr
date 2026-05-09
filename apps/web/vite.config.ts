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
			minify: "terser",
			cssMinify: "lightningcss", // much faster than the default esbuild CSS minifier
			cssCodeSplit: true, // splits CSS per async chunk (default true, but worth being explicit)
			sourcemap: false, // disable for production unless you need it
			reportCompressedSize: false, // speeds up build, skips gzip size reporting
			chunkSizeWarningLimit: 1000,
			terserOptions: {
				compress: {
					drop_console: true,
					drop_debugger: true,
					pure_funcs: ["console.log", "console.info", "console.debug"],
					passes: 2, // run compress twice for slightly better results
				},
				mangle: {
					safari10: true, // only if you care about old Safari
				},
				format: {
					comments: false, // strip all comments
				},
			},
			rollupOptions: {
				output: {
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
