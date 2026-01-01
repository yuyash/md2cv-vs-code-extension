/**
 * E2E Tests for environment variable metadata support
 */

import * as assert from 'assert';
import { parseMarkdown } from 'md2cv';
import { activateExtension, closeAllEditors, openFixture } from './helper';

describe('Env Vars E2E Tests', () => {
  const originalEnv = { ...process.env };

  suiteSetup(async () => {
    await activateExtension();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  teardown(() => {
    process.env = { ...originalEnv };
  });

  test('uses environment variables when frontmatter is absent', async () => {
    process.env.NAME = 'Env User';
    process.env.EMAIL_ADDRESS = 'env@example.com';
    process.env.PHONE_NUMBER = '000-000-0000';

    const document = await openFixture('env-vars.md');

    const result = parseMarkdown(document.getText());
    assert.ok(result.ok, 'parseMarkdown should succeed');

    if (!result.ok) {
      return;
    }

    assert.strictEqual(result.value.metadata.name, 'Env User');
    assert.strictEqual(result.value.metadata.email_address, 'env@example.com');
    assert.strictEqual(result.value.metadata.phone_number, '000-000-0000');
  });
});
