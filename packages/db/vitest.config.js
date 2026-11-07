import { vitestConfig } from '@ge/config/vitest';

export default vitestConfig({ integrationGlobalSetup: './src/testing/global-setup.ts' });
