/**
 * E2E Test Entry Point
 *
 * This file is loaded by VS Code test runner and executes all E2E tests
 */

import * as path from 'path';
import Mocha from 'mocha';
import * as glob from 'glob';

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'bdd',
    color: true,
    timeout: 60000, // 60 seconds timeout for E2E tests
  });

  const testsRoot = path.resolve(__dirname, '.');

  return new Promise((resolve, reject) => {
    // Find all test files
    glob
      .glob('**/*.e2e.test.js', { cwd: testsRoot })
      .then((files: string[]) => {
        // Add files to the test suite
        files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

        try {
          // Run the mocha test
          mocha.run((failures: number) => {
            if (failures > 0) {
              reject(new Error(`${failures} tests failed.`));
            } else {
              resolve();
            }
          });
        } catch (err) {
          console.error(err);
          reject(err);
        }
      })
      .catch((err: Error) => {
        reject(err);
      });
  });
}
