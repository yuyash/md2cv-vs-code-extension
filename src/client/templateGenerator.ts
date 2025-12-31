/**
 * Template generation module for md2cv VS Code extension
 * Provides UI for selecting template options and generating CV templates
 */

import * as vscode from 'vscode';
import { generateTemplate, getAvailableLanguages } from 'md2cv/template';
import type { TemplateLanguage, TemplateOptions, OutputFormat } from 'md2cv/types';

/**
 * Template language option for QuickPick
 */
interface LanguageOption {
  label: string;
  description: string;
  value: TemplateLanguage;
}

/**
 * Template format option for QuickPick
 */
interface FormatOption {
  label: string;
  description: string;
  value: OutputFormat;
}

/**
 * Comment option for QuickPick
 */
interface CommentOption {
  label: string;
  description: string;
  value: boolean;
}

/**
 * Get language options for QuickPick
 */
function getLanguageOptions(): LanguageOption[] {
  return [
    {
      label: 'English',
      description: vscode.l10n.t('English CV template'),
      value: 'en',
    },
    {
      label: '日本語 (Japanese)',
      description: vscode.l10n.t('Japanese CV/Rirekisho template'),
      value: 'ja',
    },
  ];
}

/**
 * Get format options for QuickPick based on selected language
 */
function getFormatOptions(language: TemplateLanguage): FormatOption[] {
  if (language === 'en') {
    // English only supports CV format
    return [
      {
        label: 'CV',
        description: vscode.l10n.t('Western-style CV format'),
        value: 'cv',
      },
    ];
  }

  // Japanese supports multiple formats
  return [
    {
      label: 'CV',
      description: vscode.l10n.t('Western-style CV format'),
      value: 'cv',
    },
    {
      label: vscode.l10n.t('Rirekisho (履歴書)'),
      description: vscode.l10n.t('Japanese resume format'),
      value: 'rirekisho',
    },
    {
      label: vscode.l10n.t('Both (両方)'),
      description: vscode.l10n.t('Both CV and Rirekisho sections'),
      value: 'both',
    },
  ];
}

/**
 * Get comment options for QuickPick
 */
function getCommentOptions(): CommentOption[] {
  return [
    {
      label: vscode.l10n.t('Yes, include comments'),
      description: vscode.l10n.t('Add explanatory comments to help you fill in the template'),
      value: true,
    },
    {
      label: vscode.l10n.t('No, minimal template'),
      description: vscode.l10n.t('Generate a clean template without comments'),
      value: false,
    },
  ];
}

/**
 * Show language selection QuickPick
 */
export async function selectLanguage(): Promise<TemplateLanguage | undefined> {
  const options = getLanguageOptions();

  const selected = await vscode.window.showQuickPick(
    options.map((opt) => ({
      label: opt.label,
      description: opt.description,
      value: opt.value,
    })),
    {
      placeHolder: vscode.l10n.t('Select template language'),
      title: vscode.l10n.t('Template Language'),
    }
  );

  return selected?.value;
}

/**
 * Show format selection QuickPick
 */
export async function selectFormat(language: TemplateLanguage): Promise<OutputFormat | undefined> {
  const options = getFormatOptions(language);

  // If only one option (English CV), auto-select it
  if (options.length === 1) {
    return options[0].value;
  }

  const selected = await vscode.window.showQuickPick(
    options.map((opt) => ({
      label: opt.label,
      description: opt.description,
      value: opt.value,
    })),
    {
      placeHolder: vscode.l10n.t('Select document format'),
      title: vscode.l10n.t('Document Format'),
    }
  );

  return selected?.value;
}

/**
 * Show comment option QuickPick
 */
export async function selectIncludeComments(): Promise<boolean | undefined> {
  const options = getCommentOptions();

  const selected = await vscode.window.showQuickPick(
    options.map((opt) => ({
      label: opt.label,
      description: opt.description,
      value: opt.value,
    })),
    {
      placeHolder: vscode.l10n.t('Include explanatory comments?'),
      title: vscode.l10n.t('Template Comments'),
    }
  );

  return selected?.value;
}

/**
 * Generate template content based on options
 */
export function generateTemplateContent(options: TemplateOptions): string {
  return generateTemplate(options);
}

/**
 * Create a new file with the generated template and open it in the editor
 */
export async function createTemplateFile(
  content: string,
  language: TemplateLanguage
): Promise<vscode.TextDocument | undefined> {
  // Generate a suggested filename based on language
  const suggestedName = language === 'ja' ? 'rirekisho.md' : 'resume.md';

  // Show save dialog
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(suggestedName),
    filters: {
      [vscode.l10n.t('Markdown files')]: ['md'],
    },
    title: vscode.l10n.t('Save Template As'),
  });

  if (!uri) {
    return undefined;
  }

  // Write the file
  const encoder = new TextEncoder();
  await vscode.workspace.fs.writeFile(uri, encoder.encode(content));

  // Open the file in the editor
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);

  return document;
}

/**
 * Main function to generate a template
 * Shows UI for selecting options and creates the template file
 */
export async function generateTemplateCommand(): Promise<void> {
  // Step 1: Select language
  const language = await selectLanguage();
  if (!language) {
    return; // User cancelled
  }

  // Step 2: Select format
  const format = await selectFormat(language);
  if (!format) {
    return; // User cancelled
  }

  // Step 3: Select whether to include comments
  const includeComments = await selectIncludeComments();
  if (includeComments === undefined) {
    return; // User cancelled
  }

  // Generate template content
  const options: TemplateOptions = {
    language,
    format,
    includeComments,
    outputPath: undefined,
  };

  const content = generateTemplateContent(options);

  // Create file and open in editor
  const document = await createTemplateFile(content, language);

  if (document) {
    vscode.window.showInformationMessage(
      vscode.l10n.t('Template created successfully: {0}', document.fileName)
    );
  }
}

/**
 * Export available languages for testing
 */
export { getAvailableLanguages };
