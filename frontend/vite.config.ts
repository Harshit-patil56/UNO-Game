import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// Custom dev server middleware to handle clean URLs and custom 404 routing locally
function mpaDevServerPlugin(): Plugin {
  return {
    name: 'mpa-dev-server',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (!req.url) return next();
        
        // Parse URL pathname
        const url = new URL(req.url, 'http://localhost');
        const pathname = url.pathname;

        // 1. Rewrite clean URLs (e.g. /about -> /about.html)
        const pages = ['about', 'privacy', 'terms', 'contact', '404', '500'];
        const matchedPage = pages.find(p => pathname === `/${p}` || pathname === `/${p}/`);
        if (matchedPage) {
          req.url = `/${matchedPage}.html`;
          return next();
        }

        // 2. Route invalid clean URLs (no extension, not asset, not HMR/dev server internal request) to /404.html
        const accept = req.headers.accept || '';
        if (
          accept.includes('text/html') &&
          pathname !== '/' &&
          !pathname.startsWith('/src/') &&
          !pathname.startsWith('/@') &&
          !pathname.startsWith('/node_modules/') &&
          !pages.some(p => pathname.startsWith(`/${p}.html`)) &&
          !pathname.includes('.')
        ) {
          console.log(`[mpaDevServer] Unmatched route: ${pathname}. Serving /404.html`);
          req.url = '/404.html';
        }

        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), mpaDevServerPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        terms: resolve(__dirname, 'terms.html'),
        contact: resolve(__dirname, 'contact.html'),
        '404': resolve(__dirname, '404.html'),
        '500': resolve(__dirname, '500.html'),
      }
    }
  }
})
