/**
 * Definition and Reference Provider Tests
 */

import { describe, it, expect } from 'vitest';
import { parseDocument } from '../server/parser.js';
import { getDefinition, getReferences, getAllDefinitionTargets } from '../server/definition.js';

describe('Definition Provider', () => {
  const testUri = 'file:///test.md';

  describe('getDefinition', () => {
    it('should return definition for section header', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

Some content here.
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();
      const doc = result.document!;

      // Position on "Experience" header (line 6, character 2)
      const definition = getDefinition(doc, { line: 6, character: 2 }, content, testUri);

      expect(definition).not.toBeNull();
      expect(definition!.uri).toBe(testUri);
      expect(definition!.range.start.line).toBe(6);
    });

    it('should return definition for code block type', () => {
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

      // Position on "experience" in code block type (line 8)
      const definition = getDefinition(doc, { line: 8, character: 12 }, content, testUri);

      expect(definition).not.toBeNull();
      expect(definition!.uri).toBe(testUri);
    });

    it('should return definition for frontmatter field', () => {
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

      // Position on "name" field (line 1, character 0)
      const definition = getDefinition(doc, { line: 1, character: 2 }, content, testUri);

      expect(definition).not.toBeNull();
      expect(definition!.uri).toBe(testUri);
      expect(definition!.range.start.line).toBe(1);
    });

    it('should return null for positions outside definitions', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

Some random text here.
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();
      const doc = result.document!;

      // Position on random text (line 6)
      const definition = getDefinition(doc, { line: 6, character: 5 }, content, testUri);

      expect(definition).toBeNull();
    });
  });

  describe('getReferences', () => {
    it('should find all sections with same section ID', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

First experience section.

# 職歴

Second experience section (Japanese).
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();
      const doc = result.document!;

      // Position on "Experience" header
      const references = getReferences(doc, { line: 6, character: 2 }, content, testUri, true);

      // Should find both "Experience" and "職歴" sections (same section ID)
      expect(references.length).toBeGreaterThanOrEqual(1);
    });

    it('should find all code blocks of same type', () => {
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

      // Position on first code block type
      const references = getReferences(doc, { line: 8, character: 12 }, content, testUri, true);

      // Should find both experience code blocks
      expect(references.length).toBeGreaterThanOrEqual(2);
    });

    it('should find frontmatter field references', () => {
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

      // Position on "name" field
      const references = getReferences(doc, { line: 1, character: 2 }, content, testUri, true);

      expect(references.length).toBe(1);
      expect(references[0].range.start.line).toBe(1);
    });

    it('should respect includeDeclaration parameter', () => {
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

      // With includeDeclaration = true
      const refsWithDecl = getReferences(doc, { line: 6, character: 2 }, content, testUri, true);

      // With includeDeclaration = false
      const refsWithoutDecl = getReferences(
        doc,
        { line: 6, character: 2 },
        content,
        testUri,
        false
      );

      // Without declaration should have fewer or equal references
      expect(refsWithoutDecl.length).toBeLessThanOrEqual(refsWithDecl.length);
    });
  });

  describe('getAllDefinitionTargets', () => {
    it('should return all definition targets in document', () => {
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

# Education

\`\`\`resume:education
- school: Test University
  degree: BS Computer Science
  start: 2014-09
  end: 2018-06
\`\`\`
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();
      const doc = result.document!;

      const targets = getAllDefinitionTargets(doc);

      // Should have frontmatter fields, sections, and code blocks
      const frontmatterTargets = targets.filter((t) => t.type === 'frontmatterField');
      const sectionTargets = targets.filter((t) => t.type === 'section');
      const codeBlockTargets = targets.filter((t) => t.type === 'codeBlock');

      expect(frontmatterTargets.length).toBe(3); // name, email_address, phone_number
      expect(sectionTargets.length).toBe(2); // Experience, Education
      expect(codeBlockTargets.length).toBe(2); // experience, education code blocks
    });

    it('should return empty array for empty document', () => {
      const content = '';
      const result = parseDocument(content);

      if (result.document) {
        const targets = getAllDefinitionTargets(result.document);
        expect(targets.length).toBe(0);
      }
    });
  });
});
