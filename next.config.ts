import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * En-têtes de sécurité globaux. La CSP des pages de l'application (avec nonce) est posée par
 * middleware.ts ; les aperçus (/apercu) ont leur propre CSP « sandbox » (voir preview.ts).
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['esbuild', 'sharp', '@vercel/sandbox'],
  // Fichiers nécessaires à la compilation des aperçus React côté serveur (kit + dépendances autorisées).
  outputFileTracingIncludes: {
    '/api/jobs/[id]/advance': [
      './templates/react-site/**/*',
      './node_modules/react/**/*',
      './node_modules/react-dom/**/*',
      './node_modules/scheduler/**/*',
      './node_modules/react-router/**/*',
      './node_modules/react-router-dom/**/*',
      './node_modules/cookie/**/*',
      './node_modules/set-cookie-parser/**/*',
      './node_modules/motion/**/*',
      './node_modules/framer-motion/**/*',
      './node_modules/motion-dom/**/*',
      './node_modules/motion-utils/**/*',
      './node_modules/tslib/**/*',
      './node_modules/lucide-react/dist/esm/**/*',
      './node_modules/lucide-react/package.json',
      './node_modules/esbuild/**/*',
      './node_modules/@esbuild/linux-x64/**/*',
    ],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/((?!apercu/).*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] },
    ];
  },
};

export default nextConfig;
