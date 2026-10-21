import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFileSync } from 'node:fs';
import { routes } from './src/routes.paths.js';

/**
 * Génère sitemap.xml au build si SITE_URL est défini (ex. https://www.mon-client.fr).
 * Sans domaine connu, aucun sitemap n'est inventé.
 */
function sitemap() {
  return {
    name: 'harmony-sitemap',
    closeBundle() {
      const base = (process.env.SITE_URL || '').replace(/\/$/, '');
      if (!base) return;
      const urls = routes.map((p) => `  <url><loc>${base}${p === '/' ? '/' : p}</loc></url>`).join('\n');
      writeFileSync('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
      writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
    },
  };
}

export default defineConfig({
  plugins: [react(), sitemap()],
  define: { 'import.meta.env.HARMONY_PREVIEW': 'false' },
  build: { target: 'es2020', sourcemap: false },
});
