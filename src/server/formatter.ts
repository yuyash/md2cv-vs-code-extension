/**
 * Block Formatter Module
 * Provides YAML formatting within md2cv code blocks
 */

import { parse, stringify, YAMLParseError } from 'yaml';
import type { TextEdit, Range as LSPRange } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { ParsedDocumentWithPositions, LocatedCodeBlock } from './parser.js';

/**
 * Formatting options for YAML content
 */
export interface YamlFormatOptions {
  /** Number of spaces for indentation (default: 2) */
  indent?: number;
  /** Line width before wrapping (default: 80) */
  lineWidth?: number;
  /** Use single quotes instead of double quotes (default: false) */
  singleQuote?: boolean;
}

/**
 * Default formatting options
 */
const DEFAULT_FORMAT_OPTIONS: Required<YamlFormatOptions> = {
  indent: 2,
  lineWidth: 80,
  singleQuote: false,
};

/**
 * Result of a format operation
 */
export interface FormatResult {
  /** Whether the format was successful */
  success: boolean;
  /** The text edit to apply (if successful) */
  edit?: TextEdit;
  /** Error message (if failed) */
  error?: string;
  /** Error range in the document (if failed) */
  errorRange?: LSPRange;
}

/**
 * Format YAML content with consistent style
 * @param yamlContent The YAML content to format
 * @param options Formatting options
 * @returns Formatted YAML string or null if parsing fails
 */
export function formatYaml(
  yamlContent: string,
  options: YamlFormatOptions = {}
): { formatted: string | null; error?: YAMLParseError } {
  const opts = { ...DEFAULT_FORMAT_OPTIONS, ...options };

  try {
    // Parse the YAML to validate and normalize
    const parsed = parse(yamlContent);

    // Stringify with consistent formatting
    const formatted = stringify(parsed, {
      indent: opts.indent,
      lineWidth: opts.lineWidth,
      singleQuote: opts.singleQuote,
      // Ensure consistent array style (block style)
      defaultKeyType: 'PLAIN',
      defaultStringType: opts.singleQuote ? 'QUOTE_SINGLE' : 'QUOTE_DOUBLE',
    });

    return { formatted };
  } catch (e) {
    if (e instanceof YAMLParseError) {
      return { formatted: null, error: e };
    }
    throw e;
  }
}

/**
 * Find the code block that contains the given position
 * @param document The parsed document
 * @param line The line number (0-based)
 * @returns The code block at the position, or null
 */
export function findCodeBlockAtLine(
  document: ParsedDocumentWithPositions,
  line: number
): LocatedCodeBlock | null {
  for (const codeBlock of document.codeBlocks) {
    if (line >= codeBlock.range.start.line && line <= codeBlock.range.end.line) {
      return codeBlock;
    }
  }
  return null;
}

/**
 * Get the YAML content range within a code block (excluding fence markers)
 * @param codeBlock The code block
 * @returns The range of the YAML content
 */
export function getYamlContentRange(codeBlock: LocatedCodeBlock): LSPRange {
  // The content starts after the opening fence line
  // and ends before the closing fence line
  return {
    start: {
      line: codeBlock.range.start.line + 1,
      character: 0,
    },
    end: {
      line: codeBlock.range.end.line,
      character: 0,
    },
  };
}

/**
 * Check if a range overlaps with a code block
 * @param range The range to check
 * @param codeBlock The code block
 * @returns True if the range overlaps with the code block
 */
export function rangeOverlapsCodeBlock(range: LSPRange, codeBlock: LocatedCodeBlock): boolean {
  // Check if the range overlaps with the code block range
  const blockStart = codeBlock.range.start.line;
  const blockEnd = codeBlock.range.end.line;

  // Range is completely before the block
  if (range.end.line < blockStart) return false;

  // Range is completely after the block
  if (range.start.line > blockEnd) return false;

  return true;
}

/**
 * Find all code blocks that overlap with a given range
 * @param document The parsed document
 * @param range The range to check
 * @returns Array of code blocks that overlap with the range
 */
export function findCodeBlocksInRange(
  document: ParsedDocumentWithPositions,
  range: LSPRange
): LocatedCodeBlock[] {
  return document.codeBlocks.filter((block) => rangeOverlapsCodeBlock(range, block));
}

/**
 * Format a code block's YAML content
 * @param textDocument The text document
 * @param codeBlock The code block to format
 * @param options Formatting options
 * @returns Format result with edit or error
 */
export function formatCodeBlock(
  textDocument: TextDocument,
  codeBlock: LocatedCodeBlock,
  options: YamlFormatOptions = {}
): FormatResult {
  // Get the YAML content from the code block
  const yamlContent = codeBlock.content;

  // Try to format the YAML
  const result = formatYaml(yamlContent, options);

  if (result.formatted === null) {
    // Format failed due to YAML syntax error
    const error = result.error;
    let errorRange: LSPRange;

    if (error && error.linePos) {
      // Calculate the error position relative to the document
      const errorLine = codeBlock.range.start.line + 1 + (error.linePos[0].line - 1);
      const errorCol = error.linePos[0].col - 1;
      errorRange = {
        start: { line: errorLine, character: errorCol },
        end: { line: errorLine, character: errorCol + 1 },
      };
    } else {
      // Use the code block range as fallback
      errorRange = {
        start: {
          line: codeBlock.range.start.line,
          character: codeBlock.range.start.character,
        },
        end: {
          line: codeBlock.range.end.line,
          character: codeBlock.range.end.character,
        },
      };
    }

    return {
      success: false,
      error: error?.message ?? 'YAML syntax error',
      errorRange,
    };
  }

  // Create the text edit for the formatted content
  const contentRange = getYamlContentRange(codeBlock);
  const edit: TextEdit = {
    range: contentRange,
    newText: result.formatted,
  };

  return {
    success: true,
    edit,
  };
}

/**
 * Format the code block at the given position
 * @param textDocument The text document
 * @param parsedDocument The parsed document
 * @param line The line number (0-based)
 * @param options Formatting options
 * @returns Format result with edit or error, or null if not in a code block
 */
export function formatCodeBlockAtPosition(
  textDocument: TextDocument,
  parsedDocument: ParsedDocumentWithPositions,
  line: number,
  options: YamlFormatOptions = {}
): FormatResult | null {
  // Find the code block at the position
  const codeBlock = findCodeBlockAtLine(parsedDocument, line);

  if (!codeBlock) {
    return null;
  }

  return formatCodeBlock(textDocument, codeBlock, options);
}
