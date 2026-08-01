/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  productionBrowserSourceMaps: false,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: [
      '@rainbow-me/rainbowkit',
      '@headlessui/react',
      'recharts',
      'viem',
      'wagmi',
      'clsx',
    ],
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'prestodex-arc.vercel.app',
          },
        ],
        destination: 'https://presto-42o.pages.dev/:path*',
        permanent: false,
      },
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'prestodex-b-a3ca.vercel.app',
          },
        ],
        destination: 'https://presto-42o.pages.dev/:path*',
        permanent: false,
      },
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'prestodex.vercel.app',
          },
        ],
        destination: 'https://presto-42o.pages.dev/:path*',
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },
};

export default nextConfig;
