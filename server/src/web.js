import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function installWeb(app) {
  const bundled = fileURLToPath(new URL('../public/', import.meta.url));
  const development = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  const root = process.env.FRONTEND_DIR || (fs.existsSync(path.join(bundled, 'index.html')) ? bundled : development);
  if (!fs.existsSync(path.join(root, 'index.html'))) return;
  // A single hosted service serves the site, API and WebSocket. No Vite process
  // or second port is needed in production; HTTPS is provided by the host.
  app.use(express.static(root, { index: false, setHeaders: (res, file) => res.set('Cache-Control', file.includes(path.sep + 'assets' + path.sep) ? 'public, max-age=31536000, immutable' : 'no-cache') }));
  app.get('*', (req, res, next) => {
    if (/^\/(api|uploads|socket\.io)(\/|$)/.test(req.path)) return next();
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(root, 'index.html'));
  });
}
