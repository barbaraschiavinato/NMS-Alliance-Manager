import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [{ protocol: "https", hostname: "nmsalmanac.com", pathname: "/planets/**" }],
	},
	async redirects() {
		return [
			{ source: "/stazioni", destination: "/stations", permanent: true },
			{ source: "/utenti", destination: "/users", permanent: true },
		];
	},
};

export default nextConfig;