/**
 * E2E Test Runner for md2cv VS Code Extension
 *
 * Uses @vscode/test-electron to run tests inside VS Code
 */

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    // The folder containing the Extension Manifest package.json
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');

    // The path to the extension test script
    const extensionTestsPath = path.resolve(__dirname, './index');

    // The path to the test fixtures workspace
    const testWorkspacePath = path.resolve(__dirname, './fixtures');

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        testWorkspacePath,
        '--disable-extensions', // Disable other extensions
      ],
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
