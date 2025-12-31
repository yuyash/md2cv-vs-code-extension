/**
 * Validator Module
 * Provides document validation using md2cv's validation functions
 * Generates LSP Diagnostics for errors and warnings
 */

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';

// Import from md2cv subpath exports
import { METADATA_FIELDS, getRequiredFields, type MetadataFieldDef } from 'md2cv/types';
import {
  SECTION_DEFINITIONS,
  findSectionByTag,
  getRequiredSectionsForFormat,
  isSectionValidForFormat,
  getTagsForLanguage,
  type SectionDef,
  type CvLanguage,
} from 'md2cv/types/sections';
import type { OutputFormat } from 'md2cv/types/config';

import type {
  ParsedDocumentWithPositions,
  LocatedFrontmatter,
  LocatedFrontmatterField,
  LocatedSection,
  LocatedCodeBlock,
  Range,
} from './parser.js';

/**
 * Re-export md2cv validation utilities
 */
export {
  METADATA_FIELDS,
  getRequiredFields,
  SECTION_DEFINITIONS,
  findSectionByTag,
  getRequiredSectionsForFormat,
  isSectionValidForFormat,
  getTagsForLanguage,
  type MetadataFieldDef,
  type SectionDef,
  type OutputFormat,
  type CvLanguage,
};

/**
 * Error category for diagnostics
 */
export enum ErrorCategory {
  FRONTMATTER_MISSING = 'frontmatter.missing',
  FRONTMATTER_MISSING_FIELD = 'frontmatter.missingField',
  FRONTMATTER_INVALID_FORMAT = 'frontmatter.invalidFormat',
  FRONTMATTER_UNKNOWN_FIELD = 'frontmatter.unknownField',
  YAML_SYNTAX_ERROR = 'yaml.syntaxError',
  YAML_SCHEMA_ERROR = 'yaml.schemaError',
  DATE_FORMAT_ERROR = 'date.formatError',
  SECTION_UNKNOWN = 'section.unknown',
  SECTION_MISSING = 'section.missing',
  SECTION_INVALID_FOR_FORMAT = 'section.invalidForFormat',
  CODEBLOCK_INVALID_TYPE = 'codeblock.invalidType',
}

/**
 * Validation diagnostic with additional metadata
 */
export interface ValidationDiagnostic extends Diagnostic {
  readonly category: ErrorCategory;
  readonly quickFixAvailable?: boolean;
  readonly quickFixData?: Record<string, unknown>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  readonly diagnostics: ValidationDiagnostic[];
  readonly hasErrors: boolean;
  readonly hasWarnings: boolean;
}

/**
 * Validation options
 */
export interface ValidationOptions {
  readonly format: OutputFormat;
  readonly language: 'en' | 'ja' | 'auto';
  readonly validateFrontmatter: boolean;
  readonly validateSections: boolean;
  readonly validateCodeBlocks: boolean;
}

/**
 * Default validation options
 */
export const DEFAULT_VALIDATION_OPTIONS: ValidationOptions = {
  format: 'cv',
  language: 'auto',
  validateFrontmatter: true,
  validateSections: true,
  validateCodeBlocks: true,
};

/**
 * Convert md2cv Range to LSP Range
 */
function toLspRange(range: Range): {
  start: { line: number; character: number };
  end: { line: number; character: number };
} {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}

/**
 * Create a validation diagnostic
 */
function createDiagnostic(
  message: string,
  range: Range,
  severity: DiagnosticSeverity,
  category: ErrorCategory,
  quickFixAvailable: boolean = false,
  quickFixData?: Record<string, unknown>
): ValidationDiagnostic {
  return {
    severity,
    range: toLspRange(range),
    message,
    source: 'md2cv',
    category,
    quickFixAvailable,
    quickFixData,
  };
}

/**
 * Validate frontmatter required fields
 * Uses METADATA_FIELDS and getRequiredFields() from md2cv
 */
export function validateFrontmatterFields(
  frontmatter: LocatedFrontmatter | null,
  _documentRange: Range
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  // Frontmatter is optional - required fields can be set via environment variables
  if (!frontmatter) {
    return diagnostics;
  }

  // Get required fields from md2cv
  const requiredFields = getRequiredFields();
  const presentFields = new Map<string, LocatedFrontmatterField>();

  // Build map of present fields
  for (const field of frontmatter.fields) {
    presentFields.set(field.key, field);
  }

  // Check for missing required fields (as warnings, since env vars can provide them)
  for (const fieldName of requiredFields) {
    const fieldDef = METADATA_FIELDS[fieldName];
    if (!fieldDef) continue;

    // Check if any of the valid frontmatter keys are present
    let found = false;
    for (const key of fieldDef.frontmatterKeys) {
      const field = presentFields.get(key);
      if (field && field.value && field.value.trim()) {
        found = true;
        break;
      }
    }

    if (!found) {
      // Field is missing - create diagnostic at end of frontmatter (as warning)
      const range = frontmatter.range;
      const envVars = fieldDef.envVars.join(' or ');
      diagnostics.push(
        createDiagnostic(
          `Missing required field: ${fieldName}. Set via frontmatter or environment variable (${envVars}).`,
          range,
          DiagnosticSeverity.Warning,
          ErrorCategory.FRONTMATTER_MISSING_FIELD,
          true,
          { action: 'addField', fieldName, fieldDef }
        )
      );
    }
  }

  return diagnostics;
}

/**
 * Validate date format (YYYY-MM-DD or YYYY-MM)
 */
function isValidDateFormat(value: string): boolean {
  // YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(value);
    return !isNaN(date.getTime());
  }
  // YYYY-MM format
  if (/^\d{4}-\d{2}$/.test(value)) {
    const date = new Date(`${value}-01`);
    return !isNaN(date.getTime());
  }
  return false;
}

/**
 * Validate frontmatter field formats
 */
export function validateFrontmatterFormats(
  frontmatter: LocatedFrontmatter | null
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  if (!frontmatter) return diagnostics;

  for (const field of frontmatter.fields) {
    // Validate date of birth format
    if ((field.key === 'dob' || field.key === 'date_of_birth') && field.value) {
      if (!isValidDateFormat(field.value)) {
        diagnostics.push(
          createDiagnostic(
            `Invalid date format for ${field.key}. Expected YYYY-MM-DD format.`,
            field.valueRange ?? field.range,
            DiagnosticSeverity.Warning,
            ErrorCategory.DATE_FORMAT_ERROR,
            true,
            { action: 'fixDateFormat', fieldKey: field.key, currentValue: field.value }
          )
        );
      }
    }
  }

  return diagnostics;
}

/**
 * Get all valid frontmatter field keys from METADATA_FIELDS
 */
function getAllValidFrontmatterKeys(): string[] {
  const keys: string[] = [];
  for (const fieldDef of Object.values(METADATA_FIELDS)) {
    keys.push(...fieldDef.frontmatterKeys);
  }
  return keys;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find similar field names for suggestions
 */
function findSimilarFieldNames(
  unknownField: string,
  validFields: string[],
  maxDistance: number = 3
): string[] {
  const suggestions: Array<{ field: string; distance: number }> = [];
  const lowerUnknown = unknownField.toLowerCase();

  for (const validField of validFields) {
    const lowerValid = validField.toLowerCase();
    const distance = levenshteinDistance(lowerUnknown, lowerValid);

    if (distance <= maxDistance) {
      suggestions.push({ field: validField, distance });
    }
  }

  // Sort by distance and return field names
  return suggestions
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((s) => s.field);
}

/**
 * Validate frontmatter field names (check for unknown/misspelled fields)
 */
export function validateFrontmatterFieldNames(
  frontmatter: LocatedFrontmatter | null
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  if (!frontmatter) return diagnostics;

  const validKeys = getAllValidFrontmatterKeys();

  for (const field of frontmatter.fields) {
    // Check if the field key is valid
    if (!validKeys.includes(field.key)) {
      const suggestions = findSimilarFieldNames(field.key, validKeys);

      const message =
        suggestions.length > 0
          ? `Unknown field: ${field.key}. Did you mean: ${suggestions.join(', ')}?`
          : `Unknown field: ${field.key}. Valid fields are: ${validKeys.slice(0, 5).join(', ')}...`;

      diagnostics.push(
        createDiagnostic(
          message,
          field.keyRange,
          DiagnosticSeverity.Warning,
          ErrorCategory.FRONTMATTER_UNKNOWN_FIELD,
          suggestions.length > 0,
          suggestions.length > 0
            ? { action: 'fixFieldName', currentKey: field.key, suggestions }
            : undefined
        )
      );
    }
  }

  return diagnostics;
}

/**
 * Validate sections for the given output format
 * Uses getRequiredSectionsForFormat() and isSectionValidForFormat() from md2cv
 */
export function validateSections(
  sections: readonly LocatedSection[],
  format: OutputFormat,
  documentEndRange: Range,
  language: CvLanguage | 'auto' = 'auto'
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  // Get required sections for the format
  const requiredSectionIds = getRequiredSectionsForFormat(format);
  const presentSectionIds = sections.map((s) => s.id);

  // Check for missing required sections
  for (const requiredId of requiredSectionIds) {
    if (!presentSectionIds.includes(requiredId)) {
      const def = SECTION_DEFINITIONS.find((d) => d.id === requiredId);
      
      // Get tags filtered by language using md2cv's getTagsForLanguage
      let tags: string;
      if (language !== 'auto') {
        const filteredTags = getTagsForLanguage(requiredId, language);
        tags = filteredTags.length > 0 
          ? filteredTags.slice(0, 3).join(', ')
          : def?.tags.slice(0, 3).join(', ') ?? requiredId;
      } else {
        tags = def?.tags.slice(0, 3).join(', ') ?? requiredId;
      }
      
      diagnostics.push(
        createDiagnostic(
          `Missing required section for ${format}: ${requiredId}. Use one of: ${tags}`,
          documentEndRange,
          DiagnosticSeverity.Error,
          ErrorCategory.SECTION_MISSING,
          true,
          { action: 'addSection', sectionId: requiredId, sectionDef: def }
        )
      );
    }
  }

  // Check if sections are valid for the format
  for (const section of sections) {
    if (!isSectionValidForFormat(section.id, format)) {
      // For rirekisho-only sections (motivation, notes) in CV format,
      // skip diagnostic - hover will show "rirekisho only" info instead
      const isRirekishoOnlySection = section.id === 'motivation' || section.id === 'notes';
      if (isRirekishoOnlySection && format === 'cv') {
        continue;
      }
      
      diagnostics.push(
        createDiagnostic(
          `Section "${section.title}" (${section.id}) is not valid for ${format} format.`,
          section.titleRange,
          DiagnosticSeverity.Warning,
          ErrorCategory.SECTION_INVALID_FOR_FORMAT,
          false
        )
      );
    }
  }

  return diagnostics;
}

/**
 * Valid code block types
 */
const VALID_CODE_BLOCK_TYPES = [
  'experience',
  'education',
  'skills',
  'certifications',
  'languages',
  'competencies',
] as const;

/**
 * Validate code blocks
 */
export function validateCodeBlocks(
  codeBlocks: readonly LocatedCodeBlock[]
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  for (const block of codeBlocks) {
    // Check if the code block type is valid
    if (!VALID_CODE_BLOCK_TYPES.includes(block.type as (typeof VALID_CODE_BLOCK_TYPES)[number])) {
      // Find similar valid types for suggestion
      const suggestions = VALID_CODE_BLOCK_TYPES.filter(
        (t) => t.startsWith(block.type.charAt(0)) || block.type.includes(t.substring(0, 3))
      );

      diagnostics.push(
        createDiagnostic(
          `Invalid code block type: ${block.type}. Valid types are: ${VALID_CODE_BLOCK_TYPES.join(', ')}`,
          block.range,
          DiagnosticSeverity.Error,
          ErrorCategory.CODEBLOCK_INVALID_TYPE,
          suggestions.length > 0,
          suggestions.length > 0
            ? { action: 'fixCodeBlockType', currentType: block.type, suggestions }
            : undefined
        )
      );
    }
  }

  return diagnostics;
}

/**
 * Validate a parsed document
 */
export function validateDocument(
  document: ParsedDocumentWithPositions,
  options: Partial<ValidationOptions> = {}
): ValidationResult {
  const opts = { ...DEFAULT_VALIDATION_OPTIONS, ...options };
  const diagnostics: ValidationDiagnostic[] = [];

  // Create a default range for document-level errors
  const lines = document.rawContent.split('\n');
  const documentRange: Range = {
    start: { line: 0, character: 0 },
    end: { line: Math.max(0, lines.length - 1), character: lines[lines.length - 1]?.length ?? 0 },
  };

  // Validate frontmatter
  if (opts.validateFrontmatter) {
    diagnostics.push(...validateFrontmatterFields(document.frontmatter, documentRange));
    diagnostics.push(...validateFrontmatterFormats(document.frontmatter));
    diagnostics.push(...validateFrontmatterFieldNames(document.frontmatter));
  }

  // Validate sections
  if (opts.validateSections) {
    diagnostics.push(...validateSections(document.sections, opts.format, documentRange, opts.language));
  }

  // Validate code blocks
  if (opts.validateCodeBlocks) {
    diagnostics.push(...validateCodeBlocks(document.codeBlocks));
  }

  return {
    diagnostics,
    hasErrors: diagnostics.some((d) => d.severity === DiagnosticSeverity.Error),
    hasWarnings: diagnostics.some((d) => d.severity === DiagnosticSeverity.Warning),
  };
}

/**
 * Convert ValidationDiagnostic to standard LSP Diagnostic
 */
export function toStandardDiagnostic(diagnostic: ValidationDiagnostic): Diagnostic {
  const {
    category: _category,
    quickFixAvailable: _quickFixAvailable,
    quickFixData: _quickFixData,
    ...standardDiagnostic
  } = diagnostic;
  return standardDiagnostic;
}

/**
 * Convert ValidationResult diagnostics to standard LSP Diagnostics
 */
export function toStandardDiagnostics(result: ValidationResult): Diagnostic[] {
  return result.diagnostics.map(toStandardDiagnostic);
}
