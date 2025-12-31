/**
 * Completion Provider Tests
 */

import { describe, it, expect } from 'vitest';
import {
  buildCompletionContext,
  getCodeBlockTypeCompletions,
  getCodeBlockSnippetCompletions,
  getCodeBlockFieldCompletions,
  getFrontmatterCompletions,
  getSectionHeadingCompletions,
  getSnippetPrefixCompletions,
  getCompletions,
} from '../server/completion.js';
import { parseDocument } from '../server/parser.js';

describe('Completion Provider', () => {
  describe('buildCompletionContext', () => {
    it('should build context for position in frontmatter', () => {
      const content = `---
name: Test User
email_address: test@example.com
---

# Summary
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const context = buildCompletionContext(
        result.document!,
        { line: 1, character: 0 },
        content,
        'en'
      );

      expect(context.isInFrontmatter).toBe(true);
      expect(context.isInCodeBlock).toBe(false);
    });

    it('should build context for position in code block', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

\`\`\`resume:experience
- company: Test Corp
\`\`\`
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const context = buildCompletionContext(
        result.document!,
        { line: 10, character: 2 },
        content,
        'en'
      );

      expect(context.isInCodeBlock).toBe(true);
      expect(context.codeBlock).not.toBeNull();
      expect(context.codeBlock?.type).toBe('experience');
    });

    it('should detect section context', () => {
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

      const context = buildCompletionContext(
        result.document!,
        { line: 8, character: 0 },
        content,
        'en'
      );

      expect(context.currentSection).not.toBeNull();
      expect(context.currentSection?.id).toBe('experience');
    });
  });

  describe('getCodeBlockTypeCompletions', () => {
    it('should return all code block types when no section specified', () => {
      const completions = getCodeBlockTypeCompletions();

      expect(completions.length).toBeGreaterThan(0);
      const labels = completions.map((c) => c.label);
      expect(labels).toContain('experience');
      expect(labels).toContain('education');
      expect(labels).toContain('skills');
    });

    it('should filter to matching section when sectionId provided', () => {
      const completions = getCodeBlockTypeCompletions('experience');

      expect(completions.length).toBe(1);
      expect(completions[0].label).toBe('experience');
    });
  });

  describe('getCodeBlockSnippetCompletions', () => {
    it('should return snippet completions with resume: prefix', () => {
      const completions = getCodeBlockSnippetCompletions();

      expect(completions.length).toBeGreaterThan(0);
      const labels = completions.map((c) => c.label);
      expect(labels).toContain('resume:experience');
      expect(labels).toContain('resume:education');
    });

    it('should filter to matching section when sectionId provided', () => {
      const completions = getCodeBlockSnippetCompletions('skills');

      expect(completions.length).toBe(1);
      expect(completions[0].label).toBe('resume:skills');
    });
  });

  describe('getCodeBlockFieldCompletions', () => {
    it('should return experience fields', () => {
      const completions = getCodeBlockFieldCompletions('experience');

      expect(completions.length).toBeGreaterThan(0);
      const labels = completions.map((c) => c.label);
      expect(labels).toContain('company');
      expect(labels).toContain('roles');
    });

    it('should return education fields', () => {
      const completions = getCodeBlockFieldCompletions('education');

      expect(completions.length).toBeGreaterThan(0);
      const labels = completions.map((c) => c.label);
      expect(labels).toContain('school');
      expect(labels).toContain('degree');
    });

    it('should return empty array for unknown block type', () => {
      const completions = getCodeBlockFieldCompletions('unknown');
      expect(completions).toEqual([]);
    });
  });

  describe('getFrontmatterCompletions', () => {
    it('should return frontmatter field completions', () => {
      const completions = getFrontmatterCompletions();

      expect(completions.length).toBeGreaterThan(0);
      const labels = completions.map((c) => c.label);
      expect(labels).toContain('name');
      expect(labels).toContain('email_address');
      expect(labels).toContain('phone_number');
    });

    it('should mark required fields', () => {
      const completions = getFrontmatterCompletions();
      const nameCompletion = completions.find((c) => c.label === 'name');

      expect(nameCompletion).toBeDefined();
      expect(nameCompletion?.detail).toContain('required');
    });
  });

  describe('getSectionHeadingCompletions', () => {
    it('should return section headings for English', () => {
      const completions = getSectionHeadingCompletions('en');

      expect(completions.length).toBeGreaterThan(0);
      const labels = completions.map((c) => c.label);
      expect(labels).toContain('Summary');
      expect(labels).toContain('Experience');
    });

    it('should return section headings for Japanese', () => {
      const completions = getSectionHeadingCompletions('ja');

      expect(completions.length).toBeGreaterThan(0);
      const labels = completions.map((c) => c.label);
      expect(labels).toContain('職歴');
      expect(labels).toContain('学歴');
    });

    it('should exclude existing sections', () => {
      const existingSections = new Set(['experience', 'education']);
      const completions = getSectionHeadingCompletions('en', existingSections);

      const labels = completions.map((c) => c.label);
      expect(labels).not.toContain('Experience');
      expect(labels).not.toContain('Education');
    });
  });

  describe('getSnippetPrefixCompletions', () => {
    it('should return md2cv- prefixed snippets', () => {
      const completions = getSnippetPrefixCompletions();

      expect(completions.length).toBeGreaterThan(0);
      const labels = completions.map((c) => c.label);
      expect(labels).toContain('md2cv-experience');
      expect(labels).toContain('md2cv-education');
    });
  });

  describe('getCompletions', () => {
    it('should return section headings when typing # ', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# S
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const context = buildCompletionContext(
        result.document!,
        { line: 6, character: 3 },
        content,
        'en'
      );

      const completions = getCompletions(context);
      expect(completions.length).toBeGreaterThan(0);
    });

    it('should return frontmatter completions in frontmatter', () => {
      const content = `---
name: Test User

---
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const context = buildCompletionContext(
        result.document!,
        { line: 2, character: 0 },
        content,
        'en'
      );

      const completions = getCompletions(context);
      const labels = completions.map((c) => c.label);
      expect(labels).toContain('email_address');
    });

    it('should return code block field completions inside code block', () => {
      const content = `---
name: Test User
email_address: test@example.com
phone_number: 123-456-7890
---

# Experience

\`\`\`resume:experience
- 
\`\`\`
`;
      const result = parseDocument(content);
      expect(result.document).not.toBeNull();

      const context = buildCompletionContext(
        result.document!,
        { line: 9, character: 2 },
        content,
        'en'
      );

      const completions = getCompletions(context);
      const labels = completions.map((c) => c.label);
      expect(labels).toContain('company');
    });
  });
});
