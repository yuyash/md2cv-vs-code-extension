/**
 * Document Symbol Provider Tests
 */

import { describe, it, expect } from 'vitest';
import { SymbolKind } from 'vscode-languageserver/node';
import { parseDocument } from '../server/parser.js';
import { getDocumentSymbols, SYMBOL_KINDS } from '../server/documentSymbol.js';

describe('Document Symbol Provider', () => {
  describe('getDocumentSymbols', () => {
    it('should return frontmatter symbol with field children', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Summary

Test summary.
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();
      const doc = result.document!;

      const symbols = getDocumentSymbols(doc);

      // Should have frontmatter and section
      expect(symbols.length).toBe(2);

      // Check frontmatter symbol
      const frontmatter = symbols[0];
      expect(frontmatter.name).toBe('Frontmatter');
      expect(frontmatter.kind).toBe(SYMBOL_KINDS.frontmatter);
      expect(frontmatter.children).toBeDefined();
      expect(frontmatter.children!.length).toBe(3);

      // Check frontmatter field children
      const fieldNames = frontmatter.children!.map((c) => c.name);
      expect(fieldNames).toContain('name');
      expect(fieldNames).toContain('email_address');
      expect(fieldNames).toContain('phone_number');

      // Check field symbol kind
      for (const field of frontmatter.children!) {
        expect(field.kind).toBe(SYMBOL_KINDS.frontmatterField);
      }
    });

    it('should return section symbols', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

Some experience content.

# Education

Some education content.
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();
      const doc = result.document!;

      const symbols = getDocumentSymbols(doc);

      // Should have frontmatter + 2 sections
      expect(symbols.length).toBe(3);

      // Check section symbols
      const experienceSection = symbols[1];
      expect(experienceSection.name).toBe('Experience');
      expect(experienceSection.kind).toBe(SYMBOL_KINDS.section);

      const educationSection = symbols[2];
      expect(educationSection.name).toBe('Education');
      expect(educationSection.kind).toBe(SYMBOL_KINDS.section);
    });

    it('should return code block symbols as section children', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

\`\`\`resume:experience
- company: Test Corp
  roles:
    - title: Engineer
      start: 2020-01
      end: present
\`\`\`
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();
      const doc = result.document!;

      const symbols = getDocumentSymbols(doc);

      // Should have frontmatter + section
      expect(symbols.length).toBe(2);

      // Check section has code block child
      const experienceSection = symbols[1];
      expect(experienceSection.name).toBe('Experience');
      expect(experienceSection.children).toBeDefined();
      expect(experienceSection.children!.length).toBe(1);

      // Check code block symbol
      const codeBlock = experienceSection.children![0];
      expect(codeBlock.name).toBe('resume:experience');
      expect(codeBlock.kind).toBe(SYMBOL_KINDS.codeBlock);
    });

    it('should handle multiple code blocks in a section', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

\`\`\`resume:experience
- company: Company A
  roles:
    - title: Engineer
      start: 2020-01
      end: present
\`\`\`

\`\`\`resume:experience
- company: Company B
  roles:
    - title: Developer
      start: 2018-01
      end: 2019-12
\`\`\`
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();
      const doc = result.document!;

      const symbols = getDocumentSymbols(doc);

      // Check section has multiple code block children
      const experienceSection = symbols[1];
      expect(experienceSection.children).toBeDefined();
      expect(experienceSection.children!.length).toBe(2);

      // Both should be experience code blocks
      for (const child of experienceSection.children!) {
        expect(child.name).toBe('resume:experience');
        expect(child.kind).toBe(SYMBOL_KINDS.codeBlock);
      }
    });

    it('should return empty array for document without frontmatter or sections', () => {
      const content = `Just some plain text without any structure.`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();
      const doc = result.document!;

      const symbols = getDocumentSymbols(doc);
      expect(symbols.length).toBe(0);
    });

    it('should have correct range for frontmatter symbol', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Summary
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();
      const doc = result.document!;

      const symbols = getDocumentSymbols(doc);
      const frontmatter = symbols[0];

      // Frontmatter should start at line 0
      expect(frontmatter.range.start.line).toBe(0);
      // Selection range should be on the opening ---
      expect(frontmatter.selectionRange.start.line).toBe(0);
    });

    it('should have correct range for section symbols', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

Some content.
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();
      const doc = result.document!;

      const symbols = getDocumentSymbols(doc);
      const section = symbols[1];

      // Section should start at line 6 (# Experience)
      expect(section.range.start.line).toBe(6);
      // Selection range should be on the title
      expect(section.selectionRange.start.line).toBe(6);
    });

    it('should have correct range for code block symbols', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

\`\`\`resume:experience
- company: Test Corp
  roles:
    - title: Engineer
      start: 2020-01
      end: present
\`\`\`
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();
      const doc = result.document!;

      const symbols = getDocumentSymbols(doc);
      const section = symbols[1];
      const codeBlock = section.children![0];

      // Code block should start at line 8 (```resume:experience)
      expect(codeBlock.range.start.line).toBe(8);
      // Selection range should be on the opening fence
      expect(codeBlock.selectionRange.start.line).toBe(8);
    });

    it('should use correct symbol kinds', () => {
      // Verify symbol kinds match expected values
      expect(SYMBOL_KINDS.frontmatter).toBe(SymbolKind.Object);
      expect(SYMBOL_KINDS.frontmatterField).toBe(SymbolKind.Property);
      expect(SYMBOL_KINDS.section).toBe(SymbolKind.Class);
      expect(SYMBOL_KINDS.codeBlock).toBe(SymbolKind.Struct);
    });

    it('should handle document with only frontmatter', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();
      const doc = result.document!;

      const symbols = getDocumentSymbols(doc);

      // Should have only frontmatter
      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe('Frontmatter');
    });

    it('should handle document with only sections (no frontmatter)', () => {
      const content = `# Summary

This is a summary.

# Experience

Some experience.
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();
      const doc = result.document!;

      const symbols = getDocumentSymbols(doc);

      // Should have only sections (no frontmatter)
      expect(symbols.length).toBe(2);
      expect(symbols[0].name).toBe('Summary');
      expect(symbols[1].name).toBe('Experience');
    });
  });
});
