import { fileURLToPath } from 'node:url';
import { vitestConfig } from '@ge/config/vitest';

export default vitestConfig({
  integrationGlobalSetup: fileURLToPath(import.meta.resolve('@ge/db/testing/global-setup')),
});
