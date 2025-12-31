/**
 * Code Actions Provider Tests
 */

import { describe, it, expect } from 'vitest';
import { DiagnosticSeverity, CodeActionKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getCodeActions } from '../server/codeActions.js';
import { ErrorCategory, type ValidationDiagnostic } from '../server/validator.js';
import { parseDocument } from '../server/parser.js';

describe('Code Actions Provider', () => {
  function createTextDocument(content: string): TextDocument {
    return TextDocument.create('file:///test.md', 'markdown', 1, content);
  }

  describe('getCodeActions', () => {
    it('should return empty array when no diagnostics', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---
`;
      const document = createTextDocument(content);
      const result = parseDocument(content);

      const actions = getCodeActions(document, [], result.document);

      expect(actions).toEqual([]);
    });

    it('should return empty array when diagnostics have no quick fix', () => {
      const content = `---
name: Test User
---
`;
      const document = createTextDocument(content);
      const result = parseDocument(content);

      const diagnostic: ValidationDiagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: { start: { line: 0, character: 0 }, end: { line: 2, character: 3 } },
        message: 'Some warning',
        source: 'md2cv',
        category: ErrorCategory.FRONTMATTER_MISSING_FIELD,
        quickFixAvailable: false,
      };

      const actions = getCodeActions(document, [diagnostic], result.document);

      expect(actions).toEqual([]);
    });

    it('should create action for missing frontmatter', () => {
      const content = `# Summary

Test summary.
`;
      const document = createTextDocument(content);
      const result = parseDocument(content);

      const diagnostic: ValidationDiagnostic = {
        severity: DiagnosticSeverity.Error,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        message: 'Missing frontmatter',
        source: 'md2cv',
        category: ErrorCategory.FRONTMATTER_MISSING,
        quickFixAvailable: true,
        quickFixData: { action: 'addFrontmatter' },
      };

      const actions = getCodeActions(document, [diagnostic], result.document);

      expect(actions.length).toBe(1);
      expect(actions[0].title).toBe('Add frontmatter block');
      expect(actions[0].kind).toBe(CodeActionKind.QuickFix);
    });

    it('should create action for missing required field', () => {
      const content = `---
name: Test User
---
`;
      const document = createTextDocument(content);
      const result = parseDocument(content);

      const diagnostic: ValidationDiagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: { start: { line: 0, character: 0 }, end: { line: 2, character: 3 } },
        message: 'Missing required field: email_address',
        source: 'md2cv',
        category: ErrorCategory.FRONTMATTER_MISSING_FIELD,
        quickFixAvailable: true,
        quickFixData: {
          action: 'addField',
          fieldName: 'email_address',
          fieldDef: { frontmatterKeys: ['email_address'], envVars: ['MD2CV_EMAIL_ADDRESS'] },
        },
      };

      const actions = getCodeActions(document, [diagnostic], result.document);

      expect(actions.length).toBe(1);
      expect(actions[0].title).toContain('email_address');
    });

    it('should create action for invalid code block type', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

\`\`\`resume:experiance
- company: Test Corp
\`\`\`
`;
      const document = createTextDocument(content);
      const result = parseDocument(content);

      const diagnostic: ValidationDiagnostic = {
        severity: DiagnosticSeverity.Error,
        range: { start: { line: 8, character: 0 }, end: { line: 8, character: 20 } },
        message: 'Invalid code block type: experiance',
        source: 'md2cv',
        category: ErrorCategory.CODEBLOCK_INVALID_TYPE,
        quickFixAvailable: true,
        quickFixData: {
          action: 'fixCodeBlockType',
          currentType: 'experiance',
          suggestions: ['experience'],
        },
      };

      const actions = getCodeActions(document, [diagnostic], result.document);

      expect(actions.length).toBe(1);
      expect(actions[0].title).toContain('experience');
    });

    it('should create action for unknown field name with suggestions', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
emial_address: typo@example.com
---
`;
      const document = createTextDocument(content);
      const result = parseDocument(content);

      const diagnostic: ValidationDiagnostic = {
        severity: DiagnosticSeverity.Warning,
        range: { start: { line: 4, character: 0 }, end: { line: 4, character: 13 } },
        message: 'Unknown field: emial_address. Did you mean: email_address?',
        source: 'md2cv',
        category: ErrorCategory.FRONTMATTER_UNKNOWN_FIELD,
        quickFixAvailable: true,
        quickFixData: {
          action: 'fixFieldName',
          currentKey: 'emial_address',
          suggestions: ['email_address'],
        },
      };

      const actions = getCodeActions(document, [diagnostic], result.document);

      expect(actions.length).toBe(1);
      expect(actions[0].title).toContain('email_address');
    });

    it('should create action for missing section', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Summary

Test summary.
`;
      const document = createTextDocument(content);
      const result = parseDocument(content);

      const diagnostic: ValidationDiagnostic = {
        severity: DiagnosticSeverity.Error,
        range: { start: { line: 8, character: 0 }, end: { line: 8, character: 0 } },
        message: 'Missing required section: experience',
        source: 'md2cv',
        category: ErrorCategory.SECTION_MISSING,
        quickFixAvailable: true,
        quickFixData: {
          action: 'addSection',
          sectionId: 'experience',
          sectionDef: { id: 'experience', tags: ['Experience', 'Work Experience'] },
        },
      };

      const actions = getCodeActions(document, [diagnostic], result.document);

      expect(actions.length).toBe(1);
      expect(actions[0].title).toContain('Experience');
    });
  });
});
