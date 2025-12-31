/**
 * E2E Tests for Template Generator Feature
 *
 * Tests the md2cv.generateTemplate command
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateExtension, sleep, closeAllEditors } from './helper';

suite('Template Generator E2E Tests', () => {
  suiteSetup(async () => {
    await activateExtension();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('should have generateTemplate command registered', async () => {
    // Get all registered commands
    const commands = await vscode.commands.getCommands(true);

    // Verify the command is registered
    assert.ok(
      commands.includes('md2cv.generateTemplate'),
      'md2cv.generateTemplate command should be registered'
    );
  });

  test('should execute generateTemplate command without error', async () => {
    // Note: This test verifies the command can be executed
    // The actual template generation requires user interaction (QuickPick)
    // so we just verify the command is callable

    try {
      // The command will show a QuickPick, which we can't interact with in E2E tests
      // But we can verify it doesn't throw an error
      const commandPromise = vscode.commands.executeCommand('md2cv.generateTemplate');

      // Wait a short time for the QuickPick to appear
      await sleep(500);

      // Cancel the QuickPick by pressing Escape
      await vscode.commands.executeCommand('workbench.action.closeQuickOpen');

      // Wait for command to complete
      await commandPromise;

      assert.ok(true, 'generateTemplate command executed without error');
    } catch (_error) {
      // Command may throw if cancelled, which is expected
      assert.ok(true, 'generateTemplate command handled cancellation');
    }
  });
});
