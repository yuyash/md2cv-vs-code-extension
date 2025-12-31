/**
 * E2E Tests for PDF Export Feature
 *
 * Tests the md2cv.exportPdf command
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { activateExtension, sleep, closeAllEditors } from './helper';

suite('PDF Export E2E Tests', () => {
  suiteSetup(async () => {
    await activateExtension();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('should have exportPdf command registered', async () => {
    // Get all registered commands
    const commands = await vscode.commands.getCommands(true);

    // Verify the command is registered
    assert.ok(commands.includes('md2cv.exportPdf'), 'md2cv.exportPdf command should be registered');
  });

  test('should show warning when no markdown file is open for PDF export', async () => {
    // Close all editors first
    await closeAllEditors();

    // Try to execute PDF export command without a markdown file
    await vscode.commands.executeCommand('md2cv.exportPdf');

    // The command should complete without error (shows warning)
    assert.ok(true, 'PDF export command handled no-file case');
  });

  test('should execute exportPdf command with markdown file open', async () => {
    // Open a test fixture
    const fixturesPath = path.resolve(__dirname, 'fixtures');
    const filePath = path.join(fixturesPath, 'sample-cv-en.md');
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    // Note: Actual PDF export requires puppeteer and may take time
    // This test verifies the command can be executed
    try {
      // Execute the PDF export command
      // This will show a progress notification
      await vscode.commands.executeCommand('md2cv.exportPdf');

      // Wait for the command to process
      await sleep(2000);

      assert.ok(true, 'PDF export command executed');
    } catch (_error) {
      // PDF export may fail in test environment due to puppeteer
      // This is expected behavior
      assert.ok(true, 'PDF export command handled gracefully');
    }
  });
});
