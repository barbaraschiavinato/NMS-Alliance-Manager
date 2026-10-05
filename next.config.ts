import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [{ protocol: "https", hostname: "nmsalmanac.com", pathname: "/planets/**" }],
	},
};

export default nextConfig;