/**
 * E2E Test Helper Functions
 *
 * Provides utility functions for E2E tests
 */

import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Wait for the extension to activate
 */
export async function activateExtension(): Promise<vscode.Extension<unknown> | undefined> {
  const ext = vscode.extensions.getExtension('md2cv.md2cv-vscode');
  if (!ext) {
    return undefined;
  }

  if (!ext.isActive) {
    await ext.activate();
  }

  return ext;
}

/**
 * Open a test fixture file
 */
export async function openFixture(fixtureName: string): Promise<vscode.TextDocument> {
  const fixturesPath = path.resolve(__dirname, 'fixtures');
  const filePath = path.join(fixturesPath, fixtureName);
  const uri = vscode.Uri.file(filePath);
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);
  return document;
}

/**
 * Wait for a specified amount of time
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for diagnostics to be published for a document
 */
export async function waitForDiagnostics(
  uri: vscode.Uri,
  timeout: number = 5000
): Promise<vscode.Diagnostic[]> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const diagnostics = vscode.languages.getDiagnostics(uri);
    if (diagnostics.length > 0) {
      return diagnostics;
    }
    await sleep(100);
  }

  return vscode.languages.getDiagnostics(uri);
}

/**
 * Execute a VS Code command and return the result
 */
export async function executeCommand<T>(
  command: string,
  ...args: unknown[]
): Promise<T | undefined> {
  return vscode.commands.executeCommand<T>(command, ...args);
}

/**
 * Get completion items at a position in a document
 */
export async function getCompletions(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.CompletionList | undefined> {
  return vscode.commands.executeCommand<vscode.CompletionList>(
    'vscode.executeCompletionItemProvider',
    document.uri,
    position
  );
}

/**
 * Get hover information at a position in a document
 */
export async function getHover(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.Hover[] | undefined> {
  return vscode.commands.executeCommand<vscode.Hover[]>(
    'vscode.executeHoverProvider',
    document.uri,
    position
  );
}

/**
 * Close all editors
 */
export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
