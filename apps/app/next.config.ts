import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/* config options here */
	reactCompiler: true,
	basePath: "",
	assetPrefix: "",
	experimental: {
		serverActions: {
			bodySizeLimit: undefined,
		},
	},
};

export default nextConfig;
