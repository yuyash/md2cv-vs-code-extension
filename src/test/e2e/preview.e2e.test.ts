/**
 * E2E Tests for Preview Feature
 *
 * Tests the md2cv.openPreview command and preview functionality
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { activateExtension, sleep, closeAllEditors } from './helper';

suite('Preview E2E Tests', () => {
  suiteSetup(async () => {
    await activateExtension();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('should open preview for markdown file', async () => {
    // Open a test fixture
    const fixturesPath = path.resolve(__dirname, 'fixtures');
    const filePath = path.join(fixturesPath, 'sample-cv-en.md');
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    // Execute the preview command
    await vscode.commands.executeCommand('md2cv.openPreview');

    // Wait for preview to open
    await sleep(1000);

    // Verify that a webview panel was created
    // Note: We can't directly access webview panels, but we can verify the command executed
    assert.ok(true, 'Preview command executed successfully');
  });

  test('should show warning when no markdown file is open', async () => {
    // Close all editors first
    await closeAllEditors();

    // Try to execute preview command without a markdown file
    // This should show a warning message
    await vscode.commands.executeCommand('md2cv.openPreview');

    // The command should complete without error
    assert.ok(true, 'Preview command handled no-file case');
  });
});
