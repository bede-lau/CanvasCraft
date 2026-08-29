import path from 'node:path';

import { config as loadEnvironment } from 'dotenv';

import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
loadEnvironment({ path: path.join(repoRoot, '.env'), quiet: true });
if (process.env['DATA_DIR'] && !path.isAbsolute(process.env['DATA_DIR'])) {
  process.env['DATA_DIR'] = path.resolve(repoRoot, process.env['DATA_DIR']);
}

const config = loadConfig();
const app = await buildApp({ config, logger: true });

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
