import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const context = resolve(root, 'services/nosana-clip');
const image = process.env.NOSANA_IMAGE ?? 'canvascraft-nosana-clip:0.1.0';

console.log(`Building Nosana CLIP image ${image}`);
const result = spawnSync('docker', ['build', '--platform', 'linux/amd64', '--tag', image, context], {
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Docker could not start: ${result.error.message}`);
  process.exitCode = 1;
} else if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
} else {
  console.log(`Built ${image}. Push it to a public registry before posting the Nosana job.`);
}
