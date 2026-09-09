import { readFile } from 'node:fs/promises';

const target = process.argv[2];
if (!target) throw new Error('JWT id is required');

for (const file of process.argv.slice(3)) {
  const contents = await readFile(file, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    try {
      const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url'));
      if (payload.id === target) console.log(`${file}:${key}`);
    } catch {
      // Ignore non-JWT environment values.
    }
  }
}
