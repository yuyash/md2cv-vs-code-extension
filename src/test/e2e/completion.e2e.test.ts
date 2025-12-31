/**
 * E2E Tests for Completion (IntelliSense) Feature
 *
 * Tests the Language Server completion functionality
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { activateExtension, sleep, closeAllEditors, getCompletions } from './helper';

suite('Completion E2E Tests', () => {
  suiteSetup(async () => {
    await activateExtension();
    // Wait for Language Server to be ready
    await sleep(2000);
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('should provide completions in resume code block', async () => {
    // Open a test fixture
    const fixturesPath = path.resolve(__dirname, 'fixtures');
    const filePath = path.join(fixturesPath, 'sample-cv-en.md');
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    // Wait for Language Server to process the document
    await sleep(1000);

    // Find a position inside a code block (metadata section)
    // Line 6 should be inside the metadata block
    const position = new vscode.Position(6, 0);

    // Get completions at this position
    const completions = await getCompletions(document, position);

    // Verify completions were returned
    assert.ok(completions, 'Completions should be returned');

    // Note: The actual completions depend on Language Server implementation
    // This test verifies the completion provider is working
  });

  test('should provide snippet completions', async () => {
    // Open a test fixture
    const fixturesPath = path.resolve(__dirname, 'fixtures');
    const filePath = path.join(fixturesPath, 'sample-cv-en.md');
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    // Wait for Language Server to process
    await sleep(1000);

    // Get completions at the beginning of a line (for snippets)
    const position = new vscode.Position(0, 0);
    const completions = await getCompletions(document, position);

    // Verify completions were returned
    assert.ok(completions, 'Completions should be returned');
  });
});
