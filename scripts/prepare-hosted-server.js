import fs from 'node:fs';
import path from 'node:path';
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const folder = path.resolve('artifacts', `server-${version}`);
fs.mkdirSync(folder, { recursive: true });
for (const name of ['src', 'scripts', 'package.json', 'package-lock.json', 'README.md', 'Dockerfile', '.dockerignore']) fs.cpSync(path.join('server', name), path.join(folder, name), { recursive: true });
fs.cpSync('client/dist', path.join(folder, 'public'), { recursive: true });
console.log(`Hosted web + backend prepared at ${folder}. No database, uploads or secrets included. Nothing deployed.`);
