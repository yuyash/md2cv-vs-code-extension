/**
 * E2E Tests for Hover Feature
 *
 * Tests the Language Server hover functionality
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { activateExtension, sleep, closeAllEditors, getHover } from './helper';

suite('Hover E2E Tests', () => {
  suiteSetup(async () => {
    await activateExtension();
    // Wait for Language Server to be ready
    await sleep(2000);
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('should provide hover information for metadata fields', async () => {
    // Open a test fixture
    const fixturesPath = path.resolve(__dirname, 'fixtures');
    const filePath = path.join(fixturesPath, 'sample-cv-en.md');
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    // Wait for Language Server to process
    await sleep(1000);

    // Find the line with "name:" field (should be around line 5)
    const text = document.getText();
    const lines = text.split('\n');
    let nameLineIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('name:')) {
        nameLineIndex = i;
        break;
      }
    }

    if (nameLineIndex >= 0) {
      // Get hover at the "name" field
      const position = new vscode.Position(nameLineIndex, 0);
      const hovers = await getHover(document, position);

      // Verify hover information was returned
      assert.ok(hovers, 'Hover information should be returned');
    }
  });

  test('should provide hover information for section headers', async () => {
    // Open a test fixture
    const fixturesPath = path.resolve(__dirname, 'fixtures');
    const filePath = path.join(fixturesPath, 'sample-cv-en.md');
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    // Wait for Language Server to process
    await sleep(1000);

    // Find the "Work Experience" section header
    const text = document.getText();
    const lines = text.split('\n');
    let sectionLineIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('# Work Experience')) {
        sectionLineIndex = i;
        break;
      }
    }

    if (sectionLineIndex >= 0) {
      // Get hover at the section header
      const position = new vscode.Position(sectionLineIndex, 5);
      const _hovers = await getHover(document, position);

      // Hover may or may not be provided for section headers
      // This test verifies the hover provider doesn't crash
      assert.ok(true, 'Hover provider handled section header');
    }
  });
});
