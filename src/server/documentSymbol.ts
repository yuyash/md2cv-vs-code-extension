/**
 * Document Symbol Provider Module
 * Provides outline symbols for md2cv markdown files
 * Supports Frontmatter, Sections, and Code Blocks
 */

import { DocumentSymbol, SymbolKind } from 'vscode-languageserver/node';

import type {
  ParsedDocumentWithPositions,
  LocatedFrontmatter,
  LocatedSection,
  LocatedCodeBlock,
} from './parser.js';

/**
 * Symbol kind mapping for different document elements
 */
export const SYMBOL_KINDS = {
  frontmatter: SymbolKind.Object,
  frontmatterField: SymbolKind.Property,
  section: SymbolKind.Class,
  codeBlock: SymbolKind.Struct,
} as const;

/**
 * Ensure selectionRange is contained within range
 * VS Code requires selectionRange to be within the full range
 */
function clampSelectionRange(
  range: { start: { line: number; character: number }; end: { line: number; character: number } },
  selectionRange: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  }
): { start: { line: number; character: number }; end: { line: number; character: number } } {
  const clampedStart = {
    line: Math.max(range.start.line, Math.min(selectionRange.start.line, range.end.line)),
    character:
      selectionRange.start.line === range.start.line
        ? Math.max(range.start.character, selectionRange.start.character)
        : selectionRange.start.line === range.end.line
          ? Math.min(range.end.character, selectionRange.start.character)
          : selectionRange.start.character,
  };

  const clampedEnd = {
    line: Math.max(range.start.line, Math.min(selectionRange.end.line, range.end.line)),
    character:
      selectionRange.end.line === range.end.line
        ? Math.min(range.end.character, selectionRange.end.character)
        : selectionRange.end.line === range.start.line
          ? Math.max(range.start.character, selectionRange.end.character)
          : selectionRange.end.character,
  };

  // Ensure end is not before start
  if (
    clampedEnd.line < clampedStart.line ||
    (clampedEnd.line === clampedStart.line && clampedEnd.character < clampedStart.character)
  ) {
    return { start: clampedStart, end: clampedStart };
  }

  return { start: clampedStart, end: clampedEnd };
}

/**
 * Create a DocumentSymbol for frontmatter
 */
function createFrontmatterSymbol(frontmatter: LocatedFrontmatter): DocumentSymbol {
  const children: DocumentSymbol[] = frontmatter.fields.map((field) => {
    const fieldRange = {
      start: {
        line: field.range.start.line,
        character: field.range.start.character,
      },
      end: {
        line: field.range.end.line,
        character: field.range.end.character,
      },
    };
    const keySelectionRange = {
      start: {
        line: field.keyRange.start.line,
        character: field.keyRange.start.character,
      },
      end: {
        line: field.keyRange.end.line,
        character: field.keyRange.end.character,
      },
    };

    return {
      name: field.key,
      kind: SYMBOL_KINDS.frontmatterField,
      range: fieldRange,
      selectionRange: clampSelectionRange(fieldRange, keySelectionRange),
    };
  });

  const frontmatterRange = {
    start: {
      line: frontmatter.range.start.line,
      character: frontmatter.range.start.character,
    },
    end: {
      line: frontmatter.range.end.line,
      character: frontmatter.range.end.character,
    },
  };

  const frontmatterSelectionRange = {
    start: {
      line: frontmatter.range.start.line,
      character: frontmatter.range.start.character,
    },
    end: {
      line: frontmatter.range.start.line,
      character: frontmatter.range.start.character + 3, // "---"
    },
  };

  return {
    name: 'Frontmatter',
    kind: SYMBOL_KINDS.frontmatter,
    range: frontmatterRange,
    selectionRange: clampSelectionRange(frontmatterRange, frontmatterSelectionRange),
    children,
  };
}

/**
 * Create a DocumentSymbol for a code block
 */
function createCodeBlockSymbol(block: LocatedCodeBlock): DocumentSymbol {
  const blockRange = {
    start: {
      line: block.range.start.line,
      character: block.range.start.character,
    },
    end: {
      line: block.range.end.line,
      character: block.range.end.character,
    },
  };

  const blockSelectionRange = {
    start: {
      line: block.range.start.line,
      character: block.range.start.character,
    },
    end: {
      line: block.range.start.line,
      character: block.range.start.character + block.lang.length + 3, // "```" + lang
    },
  };

  return {
    name: `resume:${block.type}`,
    kind: SYMBOL_KINDS.codeBlock,
    range: blockRange,
    selectionRange: clampSelectionRange(blockRange, blockSelectionRange),
  };
}

/**
 * Create a DocumentSymbol for a section
 */
function createSectionSymbol(section: LocatedSection): DocumentSymbol {
  const children: DocumentSymbol[] = section.codeBlocks.map(createCodeBlockSymbol);

  const sectionRange = {
    start: {
      line: section.range.start.line,
      character: section.range.start.character,
    },
    end: {
      line: section.range.end.line,
      character: section.range.end.character,
    },
  };

  const sectionSelectionRange = {
    start: {
      line: section.titleRange.start.line,
      character: section.titleRange.start.character,
    },
    end: {
      line: section.titleRange.end.line,
      character: section.titleRange.end.character,
    },
  };

  return {
    name: section.title,
    kind: SYMBOL_KINDS.section,
    range: sectionRange,
    selectionRange: clampSelectionRange(sectionRange, sectionSelectionRange),
    children: children.length > 0 ? children : undefined,
  };
}

/**
 * Generate document symbols for outline view
 * Returns symbols for Frontmatter, Sections, and Code Blocks
 *
 * @param document - The parsed document with position information
 * @returns Array of DocumentSymbol for the outline view
 */
export function getDocumentSymbols(document: ParsedDocumentWithPositions): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  // Add frontmatter symbol if present
  if (document.frontmatter) {
    symbols.push(createFrontmatterSymbol(document.frontmatter));
  }

  // Add section symbols
  for (const section of document.sections) {
    symbols.push(createSectionSymbol(section));
  }

  return symbols;
}

/**
 * Get the symbol kind for a given element type
 */
export function getSymbolKind(elementType: keyof typeof SYMBOL_KINDS): SymbolKind {
  return SYMBOL_KINDS[elementType];
}
