import { vitestConfig } from '@ge/config/vitest';

export default vitestConfig({ integrationGlobalSetup: './test/api-server.ts' });
