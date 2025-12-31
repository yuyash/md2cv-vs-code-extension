/**
 * Code Action Provider Module
 * Provides Quick Fix actions for validation diagnostics
 */

import {
  CodeAction,
  CodeActionKind,
  Diagnostic,
  TextEdit,
  Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { ErrorCategory, type ValidationDiagnostic } from './validator.js';
import type { ParsedDocumentWithPositions } from './parser.js';

/**
 * Quick fix data stored in diagnostics
 */
interface QuickFixData {
  action: string;
  fieldName?: string;
  fieldDef?: { frontmatterKeys: string[]; envVars: string[] };
  fieldKey?: string;
  currentValue?: string;
  currentKey?: string;
  sectionId?: string;
  sectionDef?: { id: string; tags: string[] };
  currentType?: string;
  suggestions?: string[];
}

/**
 * Generate code actions (Quick Fixes) for diagnostics
 */
export function getCodeActions(
  document: TextDocument,
  diagnostics: Diagnostic[],
  parsedDocument: ParsedDocumentWithPositions | null
): CodeAction[] {
  const actions: CodeAction[] = [];

  for (const diagnostic of diagnostics) {
    const validationDiagnostic = diagnostic as ValidationDiagnostic;

    if (!validationDiagnostic.quickFixAvailable || !validationDiagnostic.quickFixData) {
      continue;
    }

    const quickFixData = validationDiagnostic.quickFixData as unknown as QuickFixData;
    const category = validationDiagnostic.category;

    switch (category) {
      case ErrorCategory.FRONTMATTER_MISSING:
        actions.push(...createAddFrontmatterActions(document, diagnostic));
        break;

      case ErrorCategory.FRONTMATTER_MISSING_FIELD:
        actions.push(...createAddFieldActions(document, diagnostic, quickFixData, parsedDocument));
        break;

      case ErrorCategory.DATE_FORMAT_ERROR:
        actions.push(...createFixDateFormatActions(document, diagnostic, quickFixData));
        break;

      case ErrorCategory.CODEBLOCK_INVALID_TYPE:
        actions.push(...createFixCodeBlockTypeActions(document, diagnostic, quickFixData));
        break;

      case ErrorCategory.SECTION_MISSING:
        actions.push(...createAddSectionActions(document, diagnostic, quickFixData));
        break;

      case ErrorCategory.FRONTMATTER_UNKNOWN_FIELD:
        actions.push(...createFixFieldNameActions(document, diagnostic, quickFixData));
        break;
    }
  }

  return actions;
}

/**
 * Create action to add frontmatter block
 */
function createAddFrontmatterActions(document: TextDocument, diagnostic: Diagnostic): CodeAction[] {
  const frontmatterTemplate = `---
name: ""
email_address: ""
phone_number: ""
---

`;

  const action: CodeAction = {
    title: 'Add frontmatter block',
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: {
      changes: {
        [document.uri]: [TextEdit.insert({ line: 0, character: 0 }, frontmatterTemplate)],
      },
    },
    isPreferred: true,
  };

  return [action];
}

/**
 * Create action to add missing required field
 */
function createAddFieldActions(
  document: TextDocument,
  diagnostic: Diagnostic,
  quickFixData: QuickFixData,
  parsedDocument: ParsedDocumentWithPositions | null
): CodeAction[] {
  if (!quickFixData.fieldName || !parsedDocument?.frontmatter) {
    return [];
  }

  const fieldName = quickFixData.fieldName;
  const fieldDef = quickFixData.fieldDef;

  // Get the preferred frontmatter key (first one in the list)
  const frontmatterKey = fieldDef?.frontmatterKeys[0] ?? fieldName;

  // Find the position to insert the new field (before the closing ---)
  const frontmatterEndLine = parsedDocument.frontmatter.range.end.line;

  // Insert before the closing ---
  const insertPosition = { line: frontmatterEndLine, character: 0 };
  const newFieldText = `${frontmatterKey}: ""\n`;

  const action: CodeAction = {
    title: `Add required field: ${frontmatterKey}`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: {
      changes: {
        [document.uri]: [TextEdit.insert(insertPosition, newFieldText)],
      },
    },
    isPreferred: true,
  };

  return [action];
}

/**
 * Create action to fix date format
 */
function createFixDateFormatActions(
  document: TextDocument,
  diagnostic: Diagnostic,
  quickFixData: QuickFixData
): CodeAction[] {
  const actions: CodeAction[] = [];
  const currentValue = quickFixData.currentValue ?? '';

  // Try to parse and fix the date
  const fixedDate = tryFixDateFormat(currentValue);

  if (fixedDate) {
    const action: CodeAction = {
      title: `Fix date format: ${fixedDate}`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      edit: {
        changes: {
          [document.uri]: [TextEdit.replace(diagnostic.range, fixedDate)],
        },
      },
      isPreferred: true,
    };
    actions.push(action);
  }

  return actions;
}

/**
 * Try to fix common date format issues
 */
function tryFixDateFormat(value: string): string | null {
  // Remove any quotes
  const cleaned = value.replace(/['"]/g, '').trim();

  // Try various date formats
  const patterns = [
    // DD/MM/YYYY or MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // YYYY/MM/DD
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
    // DD-MM-YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    // YYYYMMDD
    /^(\d{4})(\d{2})(\d{2})$/,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      // Try to construct a valid date
      let year: string, month: string, day: string;

      if (pattern === patterns[0]) {
        // DD/MM/YYYY - assume DD/MM/YYYY format
        [, day, month, year] = match;
      } else if (pattern === patterns[1]) {
        // YYYY/MM/DD
        [, year, month, day] = match;
      } else if (pattern === patterns[2]) {
        // DD-MM-YYYY
        [, day, month, year] = match;
      } else {
        // YYYYMMDD
        [, year, month, day] = match;
      }

      // Validate and format
      const numMonth = parseInt(month, 10);
      const numDay = parseInt(day, 10);

      if (numMonth >= 1 && numMonth <= 12 && numDay >= 1 && numDay <= 31) {
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }

  // Try to parse as a date string
  const date = new Date(cleaned);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Create action to fix invalid code block type
 */
function createFixCodeBlockTypeActions(
  document: TextDocument,
  diagnostic: Diagnostic,
  quickFixData: QuickFixData
): CodeAction[] {
  const actions: CodeAction[] = [];
  const suggestions = quickFixData.suggestions ?? [];
  const currentType = quickFixData.currentType ?? '';

  for (const suggestion of suggestions) {
    // Calculate the range for just the type part (after "resume:")
    const line = document.getText({
      start: { line: diagnostic.range.start.line, character: 0 },
      end: { line: diagnostic.range.start.line, character: 1000 },
    });

    const resumePrefix = '```resume:';
    const prefixIndex = line.indexOf(resumePrefix);

    if (prefixIndex !== -1) {
      const typeStart = prefixIndex + resumePrefix.length;
      const typeEnd = typeStart + currentType.length;

      const typeRange: Range = {
        start: { line: diagnostic.range.start.line, character: typeStart },
        end: { line: diagnostic.range.start.line, character: typeEnd },
      };

      const action: CodeAction = {
        title: `Change to: resume:${suggestion}`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [document.uri]: [TextEdit.replace(typeRange, suggestion)],
          },
        },
        isPreferred: suggestions.indexOf(suggestion) === 0,
      };
      actions.push(action);
    }
  }

  return actions;
}

/**
 * Create action to add missing section
 */
function createAddSectionActions(
  document: TextDocument,
  diagnostic: Diagnostic,
  quickFixData: QuickFixData
): CodeAction[] {
  const sectionId = quickFixData.sectionId;
  const sectionDef = quickFixData.sectionDef;

  if (!sectionId) {
    return [];
  }

  // Get the section title (first tag or id)
  const sectionTitle = sectionDef?.tags[0] ?? sectionId;

  // Create a template for the section
  const sectionTemplate = getSectionTemplate(sectionId, sectionTitle);

  // Insert at the end of the document
  const lastLine = document.lineCount - 1;
  const lastLineText = document.getText({
    start: { line: lastLine, character: 0 },
    end: { line: lastLine, character: 1000 },
  });

  const insertPosition = { line: lastLine, character: lastLineText.length };
  const textToInsert = lastLineText.trim() ? `\n\n${sectionTemplate}` : `\n${sectionTemplate}`;

  const action: CodeAction = {
    title: `Add section: ${sectionTitle}`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: {
      changes: {
        [document.uri]: [TextEdit.insert(insertPosition, textToInsert)],
      },
    },
    isPreferred: true,
  };

  return [action];
}

/**
 * Get a template for a section based on its ID
 */
function getSectionTemplate(sectionId: string, title: string): string {
  const templates: Record<string, string> = {
    summary: `## ${title}

Your professional summary here.
`,
    experience: `## ${title}

\`\`\`resume:experience
- company: Company Name
  location: Location
  roles:
    - title: Job Title
      start: YYYY-MM
      end: present
      summary:
        - Key responsibility or achievement
\`\`\`
`,
    education: `## ${title}

\`\`\`resume:education
- school: School Name
  degree: Degree
  location: Location
  start: YYYY
  end: YYYY
\`\`\`
`,
    skills: `## ${title}

\`\`\`resume:skills
categories:
  - category: Category Name
    items:
      - Skill 1
      - Skill 2
\`\`\`
`,
    certifications: `## ${title}

\`\`\`resume:certifications
- name: Certification Name
  issuer: Issuing Organization
  date: YYYY-MM
\`\`\`
`,
    languages: `## ${title}

\`\`\`resume:languages
- language: Language
  level: Proficiency Level
\`\`\`
`,
    competencies: `## ${title}

\`\`\`resume:competencies
- header: Competency
  description: Description of the competency
\`\`\`
`,
  };

  return templates[sectionId] ?? `## ${title}\n\nContent here.\n`;
}

/**
 * Create action to fix unknown/misspelled field name
 */
function createFixFieldNameActions(
  document: TextDocument,
  diagnostic: Diagnostic,
  quickFixData: QuickFixData
): CodeAction[] {
  const actions: CodeAction[] = [];
  const suggestions = quickFixData.suggestions ?? [];

  for (const suggestion of suggestions) {
    const action: CodeAction = {
      title: `Change to: ${suggestion}`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      edit: {
        changes: {
          [document.uri]: [TextEdit.replace(diagnostic.range, suggestion)],
        },
      },
      isPreferred: suggestions.indexOf(suggestion) === 0,
    };
    actions.push(action);
  }

  return actions;
}
