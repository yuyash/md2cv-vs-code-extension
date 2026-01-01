/**
 * md2cv Language Server
 * Provides IntelliSense, validation, and other language features for md2cv markdown files
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionItem,
  Diagnostic,
  DiagnosticSeverity,
  TextDocumentPositionParams,
  DocumentSymbol,
  DocumentRangeFormattingParams,
  TextEdit,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { documentCache } from './documentCache.js';
import { type ParseError } from './parser.js';
import {
  validateDocument as runValidation,
  toStandardDiagnostics,
  type ValidationOptions,
  type OutputFormat,
  type ValidationDiagnostic,
  type CvLanguage,
} from './validator.js';
import { getCodeActions } from './codeActions.js';
import { buildCompletionContext, getCompletions, resolveCompletionItem } from './completion.js';
import { getHoverInfo } from './hover.js';
import { formatCodeBlockAtPosition, type YamlFormatOptions } from './formatter.js';
import { getDefinition, getReferences } from './definition.js';
import { getDocumentSymbols } from './documentSymbol.js';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

/**
 * Store validation diagnostics per document for code actions
 */
const documentDiagnostics: Map<string, ValidationDiagnostic[]> = new Map();

/**
 * Current validation options (can be updated via configuration)
 */
let validationOptions: Partial<ValidationOptions> = {
  format: 'cv' as OutputFormat,
  language: 'auto',
  validateFrontmatter: true,
  validateSections: true,
  validateCodeBlocks: true,
};

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: [':', '-', ' ', '`'],
      },
      hoverProvider: true,
      codeActionProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      documentSymbolProvider: true,
      documentRangeFormattingProvider: true,
    },
  };
});

connection.onInitialized(() => {
  connection.console.log('md2cv Language Server initialized');
});

/**
 * Handle configuration changes from client
 */
connection.onDidChangeConfiguration((params) => {
  const settings = params.settings?.md2cv;
  if (settings) {
    if (settings.defaultLanguage !== undefined) {
      validationOptions = { ...validationOptions, language: settings.defaultLanguage };
    }
    if (settings.defaultFormat !== undefined) {
      validationOptions = { ...validationOptions, format: settings.defaultFormat };
    }
    // Re-validate all open documents
    documents.all().forEach((doc) => validateDocument(doc));
  }
});

/**
 * Convert ParseError to LSP Diagnostic
 */
function parseErrorToDiagnostic(error: ParseError): Diagnostic {
  return {
    severity: DiagnosticSeverity.Error,
    range: {
      start: { line: error.line, character: error.column },
      end: { line: error.line, character: error.column + 1 },
    },
    message: error.message,
    source: 'md2cv',
  };
}

/**
 * Detect language from document content
 * Checks frontmatter language field first, then auto-detects from content
 * Returns concrete language ('en' or 'ja'), never 'auto'
 */
function detectDocumentLanguage(
  content: string,
  defaultLanguage: 'en' | 'ja' | 'auto'
): CvLanguage {
  // Check frontmatter for language field
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (frontmatterMatch) {
    const languageMatch = frontmatterMatch[1].match(/^language:\s*['"]?(en|ja)['"]?\s*$/m);
    if (languageMatch) {
      return languageMatch[1] as CvLanguage;
    }
  }

  // If defaultLanguage is set to a specific language, use it
  if (defaultLanguage !== 'auto') {
    return defaultLanguage;
  }

  // Auto-detect from content: check for Japanese characters
  // Check section headings (## lines) for Japanese characters
  const headingMatches = content.match(/^##\s+(.+)$/gm);
  if (headingMatches) {
    for (const heading of headingMatches) {
      if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(heading)) {
        return 'ja';
      }
    }
  }

  // Check frontmatter for name_ja field
  if (frontmatterMatch) {
    if (/^name_ja:/m.test(frontmatterMatch[1])) {
      return 'ja';
    }
  }

  // Default to English
  return 'en';
}

/**
 * Validate document and send diagnostics
 */
async function validateDocument(document: TextDocument): Promise<void> {
  const result = documentCache.getOrParse(document);
  const diagnostics: Diagnostic[] = [];
  const validationDiags: ValidationDiagnostic[] = [];

  // Add parse errors as diagnostics
  for (const error of result.errors) {
    diagnostics.push(parseErrorToDiagnostic(error));
  }

  // If document parsed successfully, run validation
  if (result.document) {
    // Detect language from document content
    const documentLanguage = detectDocumentLanguage(
      document.getText(),
      validationOptions.language ?? 'auto'
    );

    const validationResult = runValidation(result.document, {
      ...validationOptions,
      language: documentLanguage,
    });
    // Store validation diagnostics for code actions
    validationDiags.push(...validationResult.diagnostics);
    diagnostics.push(...toStandardDiagnostics(validationResult));
  }

  // Store validation diagnostics for code actions
  documentDiagnostics.set(document.uri, validationDiags);

  // Send diagnostics to client
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

/**
 * Update validation options (called from configuration changes)
 */
export function updateValidationOptions(options: Partial<ValidationOptions>): void {
  validationOptions = { ...validationOptions, ...options };
  // Re-validate all open documents
  documents.all().forEach((doc) => validateDocument(doc));
}

// Document change handlers
documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

documents.onDidClose((event) => {
  documentCache.invalidate(event.document.uri);
  documentDiagnostics.delete(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

// Completion handler
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const result = documentCache.getOrParse(document);
  if (!result.document) return [];

  // Detect language for completion context
  const documentLanguage = detectDocumentLanguage(
    document.getText(),
    validationOptions.language ?? 'auto'
  );

  const context = buildCompletionContext(
    result.document,
    params.position,
    document.getText(),
    documentLanguage
  );

  return getCompletions(context);
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return resolveCompletionItem(item);
});

// Hover handler
connection.onHover((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const result = documentCache.getOrParse(document);
  if (!result.document) return null;

  return getHoverInfo(result.document, params.position, document.getText());
});

// Code action handler (Quick Fix)
connection.onCodeAction((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const result = documentCache.getOrParse(document);
  const storedDiagnostics = documentDiagnostics.get(document.uri) ?? [];

  // Match incoming diagnostics with stored validation diagnostics
  const matchedDiagnostics: ValidationDiagnostic[] = [];
  for (const incomingDiag of params.context.diagnostics) {
    // Find matching stored diagnostic by range and message
    const matched = storedDiagnostics.find(
      (stored) =>
        stored.range.start.line === incomingDiag.range.start.line &&
        stored.range.start.character === incomingDiag.range.start.character &&
        stored.message === incomingDiag.message
    );
    if (matched) {
      matchedDiagnostics.push(matched);
    }
  }

  return getCodeActions(document, matchedDiagnostics, result.document);
});

// Definition handler
connection.onDefinition((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const result = documentCache.getOrParse(document);
  if (!result.document) return null;

  return getDefinition(
    result.document,
    params.position,
    document.getText(),
    params.textDocument.uri
  );
});

// References handler
connection.onReferences((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const result = documentCache.getOrParse(document);
  if (!result.document) return [];

  return getReferences(
    result.document,
    params.position,
    document.getText(),
    params.textDocument.uri,
    params.context.includeDeclaration
  );
});

// Document symbol handler for outline view
connection.onDocumentSymbol((params): DocumentSymbol[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const result = documentCache.getOrParse(document);
  if (!result.document) return [];

  return getDocumentSymbols(result.document);
});

/**
 * Current YAML formatting options
 */
let yamlFormatOptions: YamlFormatOptions = {
  indent: 2,
  lineWidth: 80,
  singleQuote: false,
};

/**
 * Update YAML formatting options
 */
export function updateYamlFormatOptions(options: Partial<YamlFormatOptions>): void {
  yamlFormatOptions = { ...yamlFormatOptions, ...options };
}

// Document range formatting handler (for code block formatting)
connection.onDocumentRangeFormatting((params: DocumentRangeFormattingParams): TextEdit[] | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const result = documentCache.getOrParse(document);
  if (!result.document) return null;

  // Use the start line of the selection to find the code block
  const formatResult = formatCodeBlockAtPosition(
    document,
    result.document,
    params.range.start.line,
    yamlFormatOptions
  );

  if (!formatResult) {
    // Not in a code block, return null (no formatting)
    return null;
  }

  if (!formatResult.success) {
    // YAML syntax error - notify the user
    connection.window.showErrorMessage(`Cannot format: ${formatResult.error}`);
    return null;
  }

  return formatResult.edit ? [formatResult.edit] : null;
});

documents.listen(connection);
connection.listen();
