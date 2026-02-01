import { describe, it, expect, vi } from 'vitest';
import type * as vscode from 'vscode';

// Mock vscode
vi.mock('vscode', () => ({
  workspace: {
    getWorkspaceFolder: vi.fn(() => ({
      uri: { fsPath: '/workspace' },
    })),
  },
  languages: {
    match: vi.fn(
      (
        selector: { pattern: string | { pattern: string } },
        document: { uri: { fsPath: string } }
      ) => {
        // Simple mock implementation
        const pattern =
          typeof selector.pattern === 'string' ? selector.pattern : selector.pattern?.pattern;

        if (!pattern) return 0;

        const path = document.uri.fsPath;

        // Simple glob matching for tests
        if (pattern.includes('**/cv*.md') && path.includes('cv')) return 1;
        if (pattern.includes('**/resume*.md') && path.includes('resume')) return 1;
        if (pattern.includes('**/*.md') && path.endsWith('.md')) return 1;

        return 0;
      }
    ),
  },
  RelativePattern: class {
    constructor(
      public base: unknown,
      public pattern: string
    ) {}
  },
  Uri: {
    file: (path: string) => ({ fsPath: path, scheme: 'file' }),
  },
}));

import { matchesAnyPattern, matchesAnyPatternPath } from '../client/filePatternMatcher';

describe('filePatternMatcher', () => {
  describe('matchesAnyPattern', () => {
    const createMockDocument = (path: string): vscode.TextDocument =>
      ({
        uri: { fsPath: path, scheme: 'file' },
        languageId: 'markdown',
      }) as unknown as vscode.TextDocument;

    it('should return false for empty patterns', () => {
      const doc = createMockDocument('/workspace/cv.md');
      expect(matchesAnyPattern(doc, [])).toBe(false);
    });

    it('should return false for null patterns', () => {
      const doc = createMockDocument('/workspace/cv.md');
      expect(matchesAnyPattern(doc, null as unknown as string[])).toBe(false);
    });

    it('should match CV files', () => {
      const doc = createMockDocument('/workspace/cv.md');
      expect(matchesAnyPattern(doc, ['**/cv*.md'])).toBe(true);
    });

    it('should match resume files', () => {
      const doc = createMockDocument('/workspace/resume.md');
      expect(matchesAnyPattern(doc, ['**/resume*.md'])).toBe(true);
    });

    it('should match any markdown file with wildcard', () => {
      const doc = createMockDocument('/workspace/test.md');
      expect(matchesAnyPattern(doc, ['**/*.md'])).toBe(true);
    });
  });

  describe('matchesAnyPatternPath', () => {
    it('should return false for empty patterns', () => {
      expect(matchesAnyPatternPath('/path/to/file.md', [])).toBe(false);
    });

    it('should return false for null patterns', () => {
      expect(matchesAnyPatternPath('/path/to/file.md', null as unknown as string[])).toBe(false);
    });

    it('should match simple wildcard pattern', () => {
      expect(matchesAnyPatternPath('/path/to/cv.md', ['**/cv*.md'])).toBe(true);
    });

    it('should match file in nested directory', () => {
      expect(matchesAnyPatternPath('/deep/nested/path/cv-2024.md', ['**/cv*.md'])).toBe(true);
    });

    it('should not match non-matching pattern', () => {
      expect(matchesAnyPatternPath('/path/to/readme.md', ['**/cv*.md'])).toBe(false);
    });

    it('should match with multiple patterns', () => {
      const patterns = ['**/cv*.md', '**/resume*.md'];
      expect(matchesAnyPatternPath('/path/resume.md', patterns)).toBe(true);
      expect(matchesAnyPatternPath('/path/cv.md', patterns)).toBe(true);
    });

    it('should handle Windows-style paths', () => {
      expect(matchesAnyPatternPath('C:\\Users\\test\\cv.md', ['**/cv*.md'])).toBe(true);
    });

    it('should match single asterisk pattern', () => {
      // Single * matches only within one directory segment
      // */cv.md matches "something/cv.md" but not "/path/cv.md" (which has leading /)
      expect(matchesAnyPatternPath('path/cv.md', ['*/cv.md'])).toBe(true);
      expect(matchesAnyPatternPath('/path/cv.md', ['*/cv.md'])).toBe(false);
    });

    it('should match question mark pattern', () => {
      expect(matchesAnyPatternPath('/path/cv1.md', ['**/cv?.md'])).toBe(true);
    });

    it('should match character class pattern', () => {
      expect(matchesAnyPatternPath('/path/cv1.md', ['**/cv[0-9].md'])).toBe(true);
    });

    it('should match brace expansion pattern', () => {
      expect(matchesAnyPatternPath('/path/cv.md', ['**/{cv,resume}.md'])).toBe(true);
      expect(matchesAnyPatternPath('/path/resume.md', ['**/{cv,resume}.md'])).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(matchesAnyPatternPath('/path/CV.MD', ['**/cv*.md'])).toBe(true);
    });
  });
});
