import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const distDir = resolve(root, 'dist');

// Version is read from package.json so the zip name always matches the build.
const pkg = (await import('../package.json', { with: { type: 'json' } })).default;
const outName = `session-transfer-v${pkg.version}.zip`;
const outPath = resolve(root, outName);

await mkdir(dirname(outPath), { recursive: true });

const output = createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`\u2713 ${outName} created (${(archive.pointer() / 1024).toFixed(1)} KB)`);
});
archive.on('warning', (err) => console.warn(err));
archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);
archive.directory(distDir, false);
await archive.finalize();
