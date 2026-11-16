import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 关闭实验性的组件缓存，避免本地与线上行为不一致
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
