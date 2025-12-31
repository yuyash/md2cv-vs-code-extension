/**
 * E2E Tests for Validation (Diagnostics) Feature
 *
 * Tests the Language Server validation functionality
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { activateExtension, sleep, closeAllEditors, waitForDiagnostics } from './helper';

suite('Validation E2E Tests', () => {
  suiteSetup(async () => {
    await activateExtension();
    // Wait for Language Server to be ready
    await sleep(2000);
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('should provide diagnostics for incomplete CV', async () => {
    // Open the incomplete CV fixture
    const fixturesPath = path.resolve(__dirname, 'fixtures');
    const filePath = path.join(fixturesPath, 'incomplete-cv.md');
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    // Wait for diagnostics to be published
    const diagnostics = await waitForDiagnostics(uri, 5000);

    // Verify diagnostics were returned for the incomplete CV
    // The incomplete CV is missing required fields like email_address, phone_number
    assert.ok(diagnostics.length > 0, 'Diagnostics should be returned for incomplete CV');
  });

  test('should not show errors for valid CV', async () => {
    // Open a valid CV fixture
    const fixturesPath = path.resolve(__dirname, 'fixtures');
    const filePath = path.join(fixturesPath, 'sample-cv-en.md');
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    // Wait for Language Server to process
    await sleep(2000);

    // Get diagnostics
    const diagnostics = vscode.languages.getDiagnostics(uri);

    // A valid CV should have no error diagnostics
    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);

    // Note: There might be warnings, but no errors for a valid CV
    assert.ok(errors.length === 0, 'Valid CV should not have error diagnostics');
  });
});
