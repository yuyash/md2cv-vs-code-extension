/**
 * Definition and Reference Provider Module
 * Provides definition jump and reference search for md2cv markdown files
 */

import { Location, Position, Range } from 'vscode-languageserver/node';

import type { ParsedDocumentWithPositions, LocatedCodeBlock, LocatedSection } from './parser.js';
import {
  findCodeBlockAtPosition,
  isInFrontmatter,
  findFrontmatterFieldAtPosition,
  isPositionInRange,
} from './parser.js';
import {
  findSectionByTag,
  isValidCodeBlockType,
  type CodeBlockType,
} from './sectionDefinitions.js';

/**
 * Definition target types
 */
export type DefinitionTargetType = 'section' | 'codeBlock' | 'frontmatterField';

/**
 * Definition target information
 */
export interface DefinitionTarget {
  readonly type: DefinitionTargetType;
  readonly id: string;
  readonly range: Range;
}

/**
 * Reference information
 */
export interface ReferenceInfo {
  readonly type: DefinitionTargetType;
  readonly id: string;
  readonly range: Range;
  readonly isDefinition: boolean;
}

/**
 * Extract the word at a given position from a line
 */
function getWordAtPosition(line: string, character: number): string | null {
  if (character < 0 || character >= line.length) return null;

  // Find word boundaries
  let start = character;
  let end = character;

  // Move start backwards to find word start
  while (start > 0 && /[\w_-]/.test(line[start - 1])) {
    start--;
  }

  // Move end forwards to find word end
  while (end < line.length && /[\w_-]/.test(line[end])) {
    end++;
  }

  if (start === end) return null;

  return line.substring(start, end);
}

/**
 * Check if position is on a code block type declaration (```resume:xxx)
 */
function getCodeBlockTypeAtPosition(
  document: ParsedDocumentWithPositions,
  position: Position,
  documentText: string
): { type: CodeBlockType; codeBlock: LocatedCodeBlock } | null {
  const codeBlock = findCodeBlockAtPosition(document, position);
  if (!codeBlock) return null;

  // Check if we're on the opening fence line
  if (position.line !== codeBlock.range.start.line) return null;

  const lines = documentText.split('\n');
  const line = lines[position.line];
  if (!line) return null;

  // Check if the line contains resume:xxx pattern
  const match = line.match(/```resume:(\w+)/);
  if (!match) return null;

  const blockType = match[1];
  if (!isValidCodeBlockType(blockType)) return null;

  // Check if cursor is on the type part
  const typeStart = line.indexOf(match[1]);
  const typeEnd = typeStart + match[1].length;

  if (position.character >= typeStart && position.character <= typeEnd) {
    return { type: blockType as CodeBlockType, codeBlock };
  }

  return null;
}

/**
 * Check if position is on a section header
 */
function getSectionAtHeaderPosition(
  document: ParsedDocumentWithPositions,
  position: Position
): LocatedSection | null {
  for (const section of document.sections) {
    if (isPositionInRange(position, section.titleRange)) {
      return section;
    }
  }
  return null;
}

/**
 * Find all code blocks of a specific type
 */
function findCodeBlocksByType(
  document: ParsedDocumentWithPositions,
  blockType: CodeBlockType
): LocatedCodeBlock[] {
  return document.codeBlocks.filter((block) => block.type === blockType);
}

/**
 * Find all sections that match a section definition
 */
function findSectionsByDefinition(
  document: ParsedDocumentWithPositions,
  sectionId: string
): LocatedSection[] {
  return document.sections.filter((section) => {
    const sectionDef = findSectionByTag(section.title);
    return sectionDef?.id === sectionId;
  });
}

/**
 * Convert md2cv Range to LSP Range
 */
function toLspRange(range: {
  start: { line: number; character: number };
  end: { line: number; character: number };
}): Range {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}

/**
 * Get definition location for a position in the document
 *
 * Supports:
 * - Section headers: Jump to the section definition (first occurrence)
 * - Code block types: Jump to the code block definition
 * - Frontmatter fields: Jump to the field definition
 */
export function getDefinition(
  document: ParsedDocumentWithPositions,
  position: Position,
  documentText: string,
  documentUri: string
): Location | null {
  // Check if we're on a section header
  const section = getSectionAtHeaderPosition(document, position);
  if (section) {
    // For section headers, the definition is the section itself
    // This allows jumping to the section from references
    return {
      uri: documentUri,
      range: toLspRange(section.titleRange),
    };
  }

  // Check if we're on a code block type
  const codeBlockInfo = getCodeBlockTypeAtPosition(document, position, documentText);
  if (codeBlockInfo) {
    // For code block types, jump to the first code block of this type
    const blocks = findCodeBlocksByType(document, codeBlockInfo.type);
    if (blocks.length > 0) {
      const firstBlock = blocks[0];
      return {
        uri: documentUri,
        range: toLspRange(firstBlock.range),
      };
    }
  }

  // Check if we're in frontmatter
  if (isInFrontmatter(document, position) && document.frontmatter) {
    const field = findFrontmatterFieldAtPosition(document, position);
    if (field) {
      // Find the field definition in frontmatter
      const fieldDef = document.frontmatter.fields.find((f) => f.key === field.key);
      if (fieldDef) {
        return {
          uri: documentUri,
          range: toLspRange(fieldDef.keyRange),
        };
      }
    }
  }

  // Check if we're in a code block and on a field that references a section
  const codeBlock = findCodeBlockAtPosition(document, position);
  if (codeBlock) {
    const lines = documentText.split('\n');
    const line = lines[position.line];
    if (line) {
      const word = getWordAtPosition(line, position.character);
      if (word) {
        // Check if the word matches a section ID
        const sectionDef = findSectionByTag(word);
        if (sectionDef) {
          // Find the first section with this definition
          const sections = findSectionsByDefinition(document, sectionDef.id);
          if (sections.length > 0) {
            return {
              uri: documentUri,
              range: toLspRange(sections[0].titleRange),
            };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Get all references for a position in the document
 *
 * Supports:
 * - Section headers: Find all sections with the same section ID
 * - Code block types: Find all code blocks of the same type
 * - Frontmatter fields: Find all occurrences of the field
 */
export function getReferences(
  document: ParsedDocumentWithPositions,
  position: Position,
  documentText: string,
  documentUri: string,
  includeDeclaration: boolean = true
): Location[] {
  const references: Location[] = [];

  // Check if we're on a section header
  const section = getSectionAtHeaderPosition(document, position);
  if (section) {
    const sectionDef = findSectionByTag(section.title);
    if (sectionDef) {
      // Find all sections with the same section ID
      const matchingSections = findSectionsByDefinition(document, sectionDef.id);
      for (const matchingSection of matchingSections) {
        // Skip the current section if not including declaration
        if (!includeDeclaration && matchingSection === section) continue;

        references.push({
          uri: documentUri,
          range: toLspRange(matchingSection.titleRange),
        });
      }

      // Also find code blocks that correspond to this section type
      if (isValidCodeBlockType(sectionDef.id)) {
        const blocks = findCodeBlocksByType(document, sectionDef.id as CodeBlockType);
        for (const block of blocks) {
          references.push({
            uri: documentUri,
            range: {
              start: { line: block.range.start.line, character: 0 },
              end: { line: block.range.start.line, character: block.lang.length + 3 },
            },
          });
        }
      }
    }
    return references;
  }

  // Check if we're on a code block type
  const codeBlockInfo = getCodeBlockTypeAtPosition(document, position, documentText);
  if (codeBlockInfo) {
    // Find all code blocks of the same type
    const blocks = findCodeBlocksByType(document, codeBlockInfo.type);
    for (const block of blocks) {
      // Skip the current block if not including declaration
      if (!includeDeclaration && block === codeBlockInfo.codeBlock) continue;

      references.push({
        uri: documentUri,
        range: {
          start: { line: block.range.start.line, character: 0 },
          end: { line: block.range.start.line, character: block.lang.length + 3 },
        },
      });
    }

    // Also find sections that correspond to this code block type
    const sections = findSectionsByDefinition(document, codeBlockInfo.type);
    for (const matchingSection of sections) {
      references.push({
        uri: documentUri,
        range: toLspRange(matchingSection.titleRange),
      });
    }

    return references;
  }

  // Check if we're in frontmatter
  if (isInFrontmatter(document, position) && document.frontmatter) {
    const field = findFrontmatterFieldAtPosition(document, position);
    if (field) {
      // Find all fields with the same key
      for (const f of document.frontmatter.fields) {
        if (f.key === field.key) {
          references.push({
            uri: documentUri,
            range: toLspRange(f.keyRange),
          });
        }
      }
    }
    return references;
  }

  return references;
}

/**
 * Get all definition targets in the document
 * Useful for building a symbol table
 */
export function getAllDefinitionTargets(document: ParsedDocumentWithPositions): DefinitionTarget[] {
  const targets: DefinitionTarget[] = [];

  // Add frontmatter fields
  if (document.frontmatter) {
    for (const field of document.frontmatter.fields) {
      targets.push({
        type: 'frontmatterField',
        id: field.key,
        range: toLspRange(field.keyRange),
      });
    }
  }

  // Add sections
  for (const section of document.sections) {
    const sectionDef = findSectionByTag(section.title);
    targets.push({
      type: 'section',
      id: sectionDef?.id ?? section.title,
      range: toLspRange(section.titleRange),
    });
  }

  // Add code blocks
  for (const codeBlock of document.codeBlocks) {
    targets.push({
      type: 'codeBlock',
      id: codeBlock.type,
      range: toLspRange(codeBlock.range),
    });
  }

  return targets;
}
