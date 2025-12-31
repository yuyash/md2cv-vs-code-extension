/**
 * Document Parser Module
 * Integrates md2cv's LSP parser with the Language Server
 */

// Import from md2cv subpath exports to avoid CLI dependencies
import {
  parseMarkdownWithPositions,
  type LocatedCodeBlock,
  type LocatedFrontmatter,
  type LocatedFrontmatterField,
  type LocatedSection,
  type ParsedDocumentWithPositions,
} from 'md2cv/parser/lsp';
import type { ParseError, Position, Range } from 'md2cv/types';

/**
 * Re-export types from md2cv for use in other server modules
 */
export type {
  LocatedCodeBlock,
  LocatedFrontmatter,
  LocatedFrontmatterField,
  LocatedSection,
  ParsedDocumentWithPositions,
  ParseError,
  Position,
  Range,
};

/**
 * Parse result with error handling
 */
export interface ParseResult {
  readonly document: ParsedDocumentWithPositions | null;
  readonly errors: readonly ParseError[];
}

/**
 * Parse a markdown document using md2cv's LSP parser
 * @param content The markdown content to parse
 * @returns ParseResult with the parsed document or errors
 */
export function parseDocument(content: string): ParseResult {
  const result = parseMarkdownWithPositions(content);

  if (result.ok) {
    return {
      document: result.value,
      errors: [],
    };
  }

  return {
    document: null,
    errors: result.error,
  };
}

/**
 * Check if a position is within a range
 */
export function isPositionInRange(position: Position, range: Range): boolean {
  // Before range start
  if (position.line < range.start.line) return false;
  if (position.line === range.start.line && position.character < range.start.character)
    return false;

  // After range end
  if (position.line > range.end.line) return false;
  if (position.line === range.end.line && position.character > range.end.character) return false;

  return true;
}

/**
 * Find the code block at a given position
 */
export function findCodeBlockAtPosition(
  document: ParsedDocumentWithPositions,
  position: Position
): LocatedCodeBlock | null {
  for (const codeBlock of document.codeBlocks) {
    if (isPositionInRange(position, codeBlock.range)) {
      return codeBlock;
    }
  }
  return null;
}

/**
 * Find the section at a given position
 */
export function findSectionAtPosition(
  document: ParsedDocumentWithPositions,
  position: Position
): LocatedSection | null {
  for (const section of document.sections) {
    if (isPositionInRange(position, section.range)) {
      return section;
    }
  }
  return null;
}

/**
 * Find the section that contains the given position
 * Uses a different approach: finds the last section header that starts before the position
 * This is more reliable when section end ranges are not accurate
 */
export function findContainingSectionAtPosition(
  document: ParsedDocumentWithPositions,
  position: Position
): LocatedSection | null {
  let containingSection: LocatedSection | null = null;

  for (const section of document.sections) {
    // Check if this section starts before or at the current position
    if (section.titleRange.start.line <= position.line) {
      // This section could contain the position
      // Keep track of the last one (sections are in order)
      containingSection = section;
    } else {
      // This section starts after the position, stop looking
      break;
    }
  }

  return containingSection;
}

/**
 * Check if a position is within the frontmatter
 */
export function isInFrontmatter(
  document: ParsedDocumentWithPositions,
  position: Position
): boolean {
  if (!document.frontmatter) return false;
  return isPositionInRange(position, document.frontmatter.range);
}

/**
 * Find the frontmatter field at a given position
 */
export function findFrontmatterFieldAtPosition(
  document: ParsedDocumentWithPositions,
  position: Position
): { key: string; value: string | undefined } | null {
  if (!document.frontmatter) return null;

  for (const field of document.frontmatter.fields) {
    if (isPositionInRange(position, field.range)) {
      return { key: field.key, value: field.value };
    }
  }
  return null;
}
