import { defineConfig, type Plugin } from 'vite';

/**
 * Content-Security-Policy for the built site. It blocks every network request except loading
 * the playground's own static files from the same origin (scripts, styles, the OCR worker,
 * wasm core and model). Nothing can be sent anywhere: no fetch/XHR/WebSocket to other
 * origins, no form posts, no external images or fonts. The OCR worker starts from a blob:
 * URL so it inherits this policy. Applied only to the production build (Vite's dev server
 * needs a WebSocket for hot reload).
 */
export const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "img-src 'self' blob: data:",
  "style-src 'self'",
  "font-src 'none'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

export default defineConfig({
  base: './',
  plugins: [csp()],
  build: { target: 'es2022', sourcemap: true },
});
