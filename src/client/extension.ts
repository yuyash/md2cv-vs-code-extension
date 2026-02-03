import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import * as path from 'path';
import { PreviewProvider } from '../preview/previewProvider';
import { parseMarkdown, detectLanguage, type OutputFormat, type PaperSize } from 'md2cv';
import {
  exportToPdf,
  showExportCompletionNotification,
  showExportErrorNotification,
  type PdfExportOptions,
} from './pdfExport';
import { generateTemplateCommand } from './templateGenerator';
import { StatusBarManager } from './statusBar';
import {
  ConfigurationManager,
  getConfigurationManager,
  disposeConfigurationManager,
  ConfigKeys,
  type ConfigChangeEvent,
  type CvLanguage,
} from './configManager';
import { logger, getLogger, disposeLogger, LogLevel } from './logger';
import { matchesAnyPattern } from './filePatternMatcher';

let client: LanguageClient | undefined;
let previewProvider: PreviewProvider | undefined;
let statusBarManager: StatusBarManager | undefined;
let configManager: ConfigurationManager | undefined;

/**
 * Per-document language override storage
 * Key: document URI string, Value: language override
 */
const documentLanguageOverrides: Map<string, 'en' | 'ja'> = new Map();

/**
 * Check if md2cv features should be enabled for the given document
 * Based on file pattern matching from configuration
 */
function shouldEnableMd2cvFeatures(document: vscode.TextDocument): boolean {
  if (!document || document.languageId !== 'markdown') {
    return false;
  }

  const patterns = configManager?.getCvFilePatterns() ?? [];

  // If no patterns configured, disable for all files (safe default)
  if (patterns.length === 0) {
    return false;
  }

  return matchesAnyPattern(document, patterns);
}

/**
 * Update the context key for Japanese CV detection
 * This enables/disables the format change command based on document language
 */
async function updateJapaneseCVContext(document: vscode.TextDocument | undefined): Promise<void> {
  if (!document || document.languageId !== 'markdown') {
    await vscode.commands.executeCommand('setContext', 'md2cv.isJapaneseCV', false);
    await vscode.commands.executeCommand('setContext', 'md2cv.isCvFile', false);
    // Hide status bar when not a markdown file, but only if preview is not active
    // When preview is focused, we want to keep showing the status bar
    if (!previewProvider?.isVisible()) {
      statusBarManager?.hide();
    }
    return;
  }

  // Check if this file matches CV patterns
  const isCvFile = shouldEnableMd2cvFeatures(document);
  await vscode.commands.executeCommand('setContext', 'md2cv.isCvFile', isCvFile);

  if (!isCvFile) {
    await vscode.commands.executeCommand('setContext', 'md2cv.isJapaneseCV', false);
    if (!previewProvider?.isVisible()) {
      statusBarManager?.hide();
    }
    return;
  }

  const language = detectDocumentLanguage(document);
  const isJapanese = language === 'ja';
  await vscode.commands.executeCommand('setContext', 'md2cv.isJapaneseCV', isJapanese);

  // Update status bar visibility and Japanese CV state
  if (statusBarManager) {
    statusBarManager.setIsJapaneseCV(isJapanese);
    statusBarManager.updateLanguage(language);
    statusBarManager.show();
  }
}

/**
 * Activate the md2cv extension
 * Sets up the Language Server client, Preview Provider, and registers commands
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Initialize logger first
  const log = getLogger();
  context.subscriptions.push(log);

  // Set log level based on debug mode
  if (context.extensionMode === vscode.ExtensionMode.Development) {
    log.setLogLevel(LogLevel.DEBUG);
  }

  logger.info('md2cv extension activating...');

  // Initialize Configuration Manager first
  configManager = getConfigurationManager();
  context.subscriptions.push(configManager);

  // Initialize Status Bar Manager (before Preview Provider to use in callback)
  statusBarManager = new StatusBarManager();
  context.subscriptions.push(statusBarManager);

  // Initialize Preview Provider
  previewProvider = new PreviewProvider(context.extensionUri);
  context.subscriptions.push(previewProvider);

  // Set up callback for when preview becomes active
  previewProvider.onPreviewActive(() => {
    // Show status bar when preview is focused
    const document = previewProvider?.getCurrentDocument();
    if (document && statusBarManager) {
      const language = detectDocumentLanguage(document);
      const isJapanese = language === 'ja';
      statusBarManager.setIsJapaneseCV(isJapanese);
      statusBarManager.updateLanguage(language);
      statusBarManager.show();
    }
  });

  // Language Server setup
  const serverModule = context.asAbsolutePath(path.join('dist', 'server', 'server.js'));

  // Server options for run and debug modes
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', '--inspect=6009'],
      },
    },
  };

  // Client options - configure document selector and synchronization
  const clientOptions: LanguageClientOptions = {
    // Register for markdown files that match CV patterns
    documentSelector: [
      {
        scheme: 'file',
        language: 'markdown',
        // Note: VS Code Language Client doesn't support dynamic pattern filtering
        // We'll handle filtering in the server based on configuration
      },
    ],
    synchronize: {
      // Watch for changes to markdown files
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.md'),
      // Synchronize md2cv configuration section to the server
      configurationSection: 'md2cv',
    },
    // Output channel for logging
    outputChannel: vscode.window.createOutputChannel('md2cv Language Server'),
  };

  // Create the language client
  client = new LanguageClient(
    'md2cvLanguageServer',
    'md2cv Language Server',
    serverOptions,
    clientOptions
  );

  // Start the client and add to subscriptions for proper disposal
  try {
    await client.start();
    logger.info('md2cv Language Server started successfully');
  } catch (error) {
    logger.error('Failed to start md2cv Language Server', error);
    vscode.window.showErrorMessage(vscode.l10n.t('Failed to start md2cv Language Server'));
    return;
  }

  // Add client to subscriptions for proper disposal
  context.subscriptions.push(client);

  // Register commands
  registerCommands(context);

  // Register document change listeners for real-time preview updates
  registerDocumentListeners(context);

  // Load initial configuration
  loadConfiguration();

  logger.info('md2cv extension activated successfully');
}

/**
 * Extract language field from frontmatter
 * Returns 'en', 'ja', or null if not specified
 */
function extractFrontmatterLanguage(content: string): 'en' | 'ja' | null {
  // Match YAML frontmatter block
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) {
    return null;
  }

  // Look for language field in frontmatter
  const languageMatch = frontmatterMatch[1].match(/^language:\s*['"]?(en|ja)['"]?\s*$/m);
  if (languageMatch) {
    return languageMatch[1] as 'en' | 'ja';
  }

  return null;
}

/**
 * Detect if the current document is a Japanese CV
 * Priority order:
 * 1. Per-document override (set via switchLanguage command)
 * 2. Frontmatter `language` field
 * 3. `md2cv.defaultLanguage` setting (if not 'auto')
 * 4. Auto-detect from content
 *
 * Returns 'ja' for Japanese, 'en' for English, or null if parsing fails
 */
function detectDocumentLanguage(document: vscode.TextDocument): 'en' | 'ja' | null {
  // 1. Check per-document override first
  const override = documentLanguageOverrides.get(document.uri.toString());
  if (override) {
    return override;
  }

  const content = document.getText();

  // 2. Check frontmatter `language` field
  const frontmatterLanguage = extractFrontmatterLanguage(content);
  if (frontmatterLanguage) {
    return frontmatterLanguage;
  }

  // 3. Check defaultLanguage setting (if not 'auto')
  const defaultLanguage = configManager?.getDefaultLanguage() ?? 'auto';
  if (defaultLanguage !== 'auto') {
    return defaultLanguage;
  }

  // 4. Auto-detect from content
  try {
    const parseResult = parseMarkdown(content);

    if (!parseResult.ok) {
      return null;
    }

    const parsedCV = parseResult.value;
    const cvInput = {
      metadata: parsedCV.metadata,
      sections: parsedCV.sections,
    };

    return detectLanguage(cvInput);
  } catch {
    return null;
  }
}

/**
 * Register all extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    // Open Preview command
    vscode.commands.registerCommand('md2cv.openPreview', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        previewProvider?.show(editor.document);
      } else {
        vscode.window.showWarningMessage(vscode.l10n.t('Please open a markdown file to preview'));
      }
    }),

    // Export PDF command
    vscode.commands.registerCommand('md2cv.exportPdf', async () => {
      const editor = vscode.window.activeTextEditor;

      // Get document from active editor or preview provider
      let document: vscode.TextDocument | undefined;

      if (editor && editor.document.languageId === 'markdown') {
        document = editor.document;
      } else if (previewProvider?.isVisible()) {
        document = previewProvider.getCurrentDocument();
      }

      // Check if a markdown document is available
      if (!document) {
        vscode.window.showWarningMessage(
          vscode.l10n.t('Please open a markdown file to export PDF')
        );
        return;
      }

      // Get current settings from preview provider or configuration manager
      const format = previewProvider?.getFormat() ?? configManager?.getDefaultFormat() ?? 'cv';
      const paperSize =
        previewProvider?.getPaperSize() ?? configManager?.getDefaultPaperSize() ?? 'a4';

      const exportOptions: PdfExportOptions = {
        format,
        paperSize,
      };

      // Show progress indicator
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: vscode.l10n.t('Exporting PDF...'),
          cancellable: false,
        },
        async () => {
          const result = await exportToPdf(document!, exportOptions);

          if (result.success) {
            await showExportCompletionNotification(result.outputPaths);
          } else {
            showExportErrorNotification(result.error ?? vscode.l10n.t('Unknown error'));
          }
        }
      );
    }),

    // Change Format command
    vscode.commands.registerCommand('md2cv.changeFormat', async () => {
      const editor = vscode.window.activeTextEditor;

      // Get document from active editor or preview provider
      let document: vscode.TextDocument | undefined;

      if (editor && editor.document.languageId === 'markdown') {
        document = editor.document;
      } else if (previewProvider?.isVisible()) {
        document = previewProvider.getCurrentDocument();
      }

      // Check if a markdown document is available
      if (!document) {
        vscode.window.showWarningMessage(
          vscode.l10n.t('Please open a markdown file to change format')
        );
        return;
      }

      // Detect document language
      const language = detectDocumentLanguage(document);

      // For English CVs, show message that format switching is not available
      if (language === 'en') {
        vscode.window.showInformationMessage(
          vscode.l10n.t(
            'Format switching is only available for Japanese CVs. English CVs use the standard CV format.'
          )
        );
        return;
      }

      // For Japanese CVs, show format selection
      const formats: { label: string; description: string; value: OutputFormat }[] = [
        {
          label: vscode.l10n.t('CV (職務経歴書)'),
          description: vscode.l10n.t('Japanese work history format'),
          value: 'cv',
        },
        {
          label: vscode.l10n.t('Rirekisho (履歴書)'),
          description: vscode.l10n.t('Japanese resume format'),
          value: 'rirekisho',
        },
        {
          label: vscode.l10n.t('Both (両方)'),
          description: vscode.l10n.t('Display both formats'),
          value: 'both',
        },
      ];

      const selected = await vscode.window.showQuickPick(
        formats.map((f) => ({ label: f.label, description: f.description, value: f.value })),
        {
          placeHolder: vscode.l10n.t('Select document format for Japanese CV'),
          title: vscode.l10n.t('Document Format'),
        }
      );

      if (selected && previewProvider) {
        const format = formats.find((f) => f.label === selected.label);
        if (format) {
          previewProvider.setFormat(format.value);
          // Update status bar
          statusBarManager?.updateFormat(format.value);
          // Refresh preview with new format
          if (document) {
            previewProvider.updatePreview(document);
          }
          vscode.window.showInformationMessage(
            vscode.l10n.t('Document format changed to: {0}', format.label)
          );
        }
      }
    }),

    // Change Paper Size command
    vscode.commands.registerCommand('md2cv.changePaperSize', async () => {
      // Get current paper size from configuration manager
      const currentPaperSize =
        previewProvider?.getPaperSize() ?? configManager?.getDefaultPaperSize() ?? 'a4';

      // Paper size options with descriptions
      const sizes: { label: string; description: string; detail: string; value: PaperSize }[] = [
        {
          label: 'A3',
          description: '297 × 420 mm',
          detail: vscode.l10n.t('Large format, suitable for detailed CVs'),
          value: 'a3',
        },
        {
          label: 'A4',
          description: '210 × 297 mm',
          detail: vscode.l10n.t('Standard international paper size'),
          value: 'a4',
        },
        {
          label: 'B4',
          description: '257 × 364 mm',
          detail: vscode.l10n.t('Japanese standard, larger than A4'),
          value: 'b4',
        },
        {
          label: 'B5',
          description: '182 × 257 mm',
          detail: vscode.l10n.t('Japanese standard, smaller than A4'),
          value: 'b5',
        },
        {
          label: 'Letter',
          description: '215.9 × 279.4 mm',
          detail: vscode.l10n.t('US standard paper size'),
          value: 'letter',
        },
      ];

      // Mark current selection
      const items = sizes.map((s) => ({
        label: s.value === currentPaperSize ? `$(check) ${s.label}` : s.label,
        description: s.description,
        detail: s.detail,
        value: s.value,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: vscode.l10n.t('Select paper size'),
        title: vscode.l10n.t('Paper Size'),
      });

      if (selected) {
        const size = sizes.find((s) => s.value === selected.value);
        if (size) {
          // Update preview provider
          if (previewProvider) {
            previewProvider.setPaperSize(size.value);
          }

          // Update status bar
          statusBarManager?.updatePaperSize(size.value);

          // Save to configuration using ConfigurationManager
          if (configManager) {
            await configManager.updateWorkspace('defaultPaperSize', size.value);
          }

          // Refresh preview with new paper size
          // Get document from active editor or preview provider
          let document: vscode.TextDocument | undefined;
          const editor = vscode.window.activeTextEditor;
          if (editor && editor.document.languageId === 'markdown') {
            document = editor.document;
          } else if (previewProvider?.isVisible()) {
            document = previewProvider.getCurrentDocument();
          }

          if (document && previewProvider) {
            previewProvider.updatePreview(document);
          }

          // Show confirmation message
          vscode.window.showInformationMessage(
            vscode.l10n.t('Paper size changed to: {0}', size.label)
          );
        }
      }
    }),

    // Set Paper Size command (called from preview webview)
    vscode.commands.registerCommand('md2cv.setPaperSize', async (paperSize: PaperSize) => {
      if (!paperSize) return;

      logger.debug('setPaperSize command called', { paperSize });

      // Update preview provider
      if (previewProvider) {
        previewProvider.setPaperSize(paperSize);
      }

      // Update status bar
      statusBarManager?.updatePaperSize(paperSize);

      // Save to configuration using ConfigurationManager
      if (configManager) {
        await configManager.updateWorkspace('defaultPaperSize', paperSize);
      }
    }),

    // Generate Template command
    vscode.commands.registerCommand('md2cv.generateTemplate', async () => {
      await generateTemplateCommand();
    }),

    // Toggle Sync Scroll command
    // Requirements: 13.3
    vscode.commands.registerCommand('md2cv.toggleSyncScroll', async () => {
      if (!previewProvider) {
        return;
      }

      const currentState = previewProvider.isSyncScrollEnabled();
      const newState = !currentState;

      // Update preview provider
      previewProvider.setSyncScrollEnabled(newState);

      // Save to configuration
      if (configManager) {
        await configManager.updateWorkspace('enableSyncScroll', newState);
      }

      // Show confirmation message
      const message = newState
        ? vscode.l10n.t('Sync scroll enabled')
        : vscode.l10n.t('Sync scroll disabled');
      vscode.window.showInformationMessage(message);
    }),

    // Switch Language command
    vscode.commands.registerCommand('md2cv.switchLanguage', async () => {
      const editor = vscode.window.activeTextEditor;

      // Get document from active editor or preview provider
      let document: vscode.TextDocument | undefined;

      if (editor && editor.document.languageId === 'markdown') {
        document = editor.document;
      } else if (previewProvider?.isVisible()) {
        document = previewProvider.getCurrentDocument();
      }

      // Check if a markdown document is available
      if (!document) {
        vscode.window.showWarningMessage(
          vscode.l10n.t('Please open a markdown file to switch language')
        );
        return;
      }

      const documentUri = document.uri.toString();
      const currentOverride = documentLanguageOverrides.get(documentUri);
      const currentLanguage = detectDocumentLanguage(document);

      // Language options
      const options: { label: string; description: string; value: CvLanguage }[] = [
        {
          label: vscode.l10n.t('Auto-detect'),
          description: vscode.l10n.t('Detect language from document content'),
          value: 'auto',
        },
        {
          label: vscode.l10n.t('English'),
          description: vscode.l10n.t('English CV format'),
          value: 'en',
        },
        {
          label: vscode.l10n.t('Japanese (日本語)'),
          description: vscode.l10n.t('Japanese CV format (履歴書/職務経歴書)'),
          value: 'ja',
        },
      ];

      // Mark current selection
      const items = options.map((opt) => {
        const isCurrent =
          (opt.value === 'auto' && !currentOverride) ||
          (opt.value !== 'auto' && currentOverride === opt.value);
        return {
          label: isCurrent ? `$(check) ${opt.label}` : opt.label,
          description: opt.description,
          value: opt.value,
        };
      });

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: vscode.l10n.t(
          'Select CV language (current: {0})',
          currentLanguage ?? 'unknown'
        ),
        title: vscode.l10n.t('CV Language'),
      });

      if (selected) {
        if (selected.value === 'auto') {
          // Remove override, use auto-detection
          documentLanguageOverrides.delete(documentUri);
        } else {
          // Set per-document override
          documentLanguageOverrides.set(documentUri, selected.value as 'en' | 'ja');
        }

        // Update context and status bar
        await updateJapaneseCVContext(document);

        // Refresh preview if visible
        if (previewProvider?.isVisible()) {
          previewProvider.updatePreview(document);
        }

        // Show confirmation
        const newLanguage = detectDocumentLanguage(document);
        vscode.window.showInformationMessage(
          vscode.l10n.t('CV language set to: {0}', newLanguage === 'ja' ? 'Japanese' : 'English')
        );
      }
    })
  );
}

/**
 * Register document change listeners for real-time preview updates
 */
function registerDocumentListeners(context: vscode.ExtensionContext): void {
  // Listen for document changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === 'markdown' && previewProvider?.isVisible()) {
        previewProvider.updatePreview(event.document);
      }
      // Update Japanese CV context when document content changes
      if (event.document === vscode.window.activeTextEditor?.document) {
        updateJapaneseCVContext(event.document);
      }
    })
  );

  // Listen for active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      // Update Japanese CV context for the new active editor
      updateJapaneseCVContext(editor?.document);

      if (editor && editor.document.languageId === 'markdown' && previewProvider?.isVisible()) {
        previewProvider.updatePreview(editor.document);
      }
    })
  );

  // Listen for editor scroll events (sync scroll: editor → preview)
  // Requirements: 13.1, 13.4
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      if (
        event.textEditor.document.languageId === 'markdown' &&
        previewProvider?.isVisible() &&
        previewProvider.isSyncScrollEnabled()
      ) {
        previewProvider.handleEditorScroll(event.visibleRanges, event.textEditor.document);
      }
    })
  );

  // Listen for configuration changes using ConfigurationManager
  // This provides more granular control over which settings changed
  if (configManager) {
    // Listen for all configuration changes
    context.subscriptions.push(
      configManager.onDidChangeConfiguration('*', (event: ConfigChangeEvent) => {
        handleConfigurationChange(event);
      })
    );
  }

  // Set initial context for the current active editor
  updateJapaneseCVContext(vscode.window.activeTextEditor?.document);
}

/**
 * Handle configuration change events from ConfigurationManager
 * Applies changes immediately to the appropriate components
 *
 * Requirements: 12.4 (immediate application of settings)
 */
function handleConfigurationChange(event: ConfigChangeEvent): void {
  const { key, newValue } = event;

  switch (key) {
    case ConfigKeys.DEFAULT_FORMAT:
      if (previewProvider) {
        previewProvider.setFormat(newValue as OutputFormat);
      }
      if (statusBarManager) {
        statusBarManager.updateFormat(newValue as OutputFormat);
      }
      break;

    case ConfigKeys.DEFAULT_PAPER_SIZE:
      if (previewProvider) {
        previewProvider.setPaperSize(newValue as PaperSize);
      }
      if (statusBarManager) {
        statusBarManager.updatePaperSize(newValue as PaperSize);
      }
      break;

    case ConfigKeys.PREVIEW_UPDATE_DELAY:
      // Preview update delay is read dynamically, no action needed
      break;

    case ConfigKeys.ENABLE_SYNC_SCROLL:
      // Update sync scroll enabled state in preview provider
      if (previewProvider && typeof newValue === 'boolean') {
        previewProvider.setSyncScrollEnabled(newValue);
      }
      break;

    case ConfigKeys.TEMPLATE_LANGUAGE:
    case ConfigKeys.INCLUDE_TEMPLATE_COMMENTS:
      // Template settings are read when generating templates, no action needed
      break;

    case ConfigKeys.DEFAULT_LANGUAGE:
      // Re-evaluate language for current document when default language changes
      {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'markdown') {
          updateJapaneseCVContext(editor.document);
        }
      }
      break;

    case ConfigKeys.CV_FILE_PATTERNS:
      // Re-evaluate all open markdown documents when patterns change
      {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'markdown') {
          updateJapaneseCVContext(editor.document);
        }
      }
      break;
  }

  // Update preview if visible and a relevant setting changed
  const previewRelevantKeys: string[] = [ConfigKeys.DEFAULT_FORMAT, ConfigKeys.DEFAULT_PAPER_SIZE];

  if (previewRelevantKeys.includes(key)) {
    // Get document from active editor or preview provider
    let document: vscode.TextDocument | undefined;
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'markdown') {
      document = editor.document;
    } else if (previewProvider?.isVisible()) {
      document = previewProvider.getCurrentDocument();
    }

    if (document && previewProvider?.isVisible()) {
      previewProvider.updatePreview(document);
    }
  }
}

/**
 * Load configuration and apply to preview provider and status bar
 * Uses the ConfigurationManager for centralized configuration access
 */
function loadConfiguration(): void {
  if (!configManager) {
    return;
  }

  // Load default format
  const defaultFormat = configManager.getDefaultFormat();

  // Load default paper size
  const defaultPaperSize = configManager.getDefaultPaperSize();

  if (previewProvider) {
    previewProvider.setFormat(defaultFormat);
    previewProvider.setPaperSize(defaultPaperSize);

    // Load sync scroll setting
    const syncScrollEnabled = configManager.isSyncScrollEnabled();
    previewProvider.setSyncScrollEnabled(syncScrollEnabled);
  }

  // Update status bar with loaded configuration
  if (statusBarManager) {
    statusBarManager.updateFormat(defaultFormat);
    statusBarManager.updatePaperSize(defaultPaperSize);
  }
}

/**
 * Deactivate the extension
 * Stops the Language Server client and disposes of the Configuration Manager
 */
export function deactivate(): Thenable<void> | undefined {
  logger.info('md2cv extension deactivating...');

  // Dispose of the configuration manager singleton
  disposeConfigurationManager();

  // Dispose of the logger singleton
  disposeLogger();

  if (!client) {
    return undefined;
  }
  return client.stop();
}
