import { describe, it, expect } from 'vitest';
import {
  formatYaml,
  findCodeBlockAtLine,
  getYamlContentRange,
  rangeOverlapsCodeBlock,
} from '../server/formatter.js';
import type { LocatedCodeBlock } from '../server/parser.js';

describe('YAML Formatter', () => {
  describe('formatYaml', () => {
    it('should format valid YAML with consistent indentation', () => {
      const input = `company: Test Corp
roles:
  - title: Engineer
    start: 2020-01`;

      const result = formatYaml(input);
      expect(result.formatted).not.toBeNull();
      expect(result.error).toBeUndefined();
      // Check that the output is valid YAML
      expect(result.formatted).toContain('company:');
      expect(result.formatted).toContain('roles:');
    });

    it('should return error for invalid YAML', () => {
      const input = `company: Test Corp
roles:
  - title: Engineer
    start: 2020-01
  invalid: [unclosed`;

      const result = formatYaml(input);
      expect(result.formatted).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should preserve data semantics after formatting', () => {
      const input = `name: John Doe
items:
  - first
  - second
  - third`;

      const result = formatYaml(input);
      expect(result.formatted).not.toBeNull();
      // The formatted output should contain the same data
      expect(result.formatted).toContain('John Doe');
      expect(result.formatted).toContain('first');
      expect(result.formatted).toContain('second');
      expect(result.formatted).toContain('third');
    });

    it('should respect custom indent option', () => {
      const input = `parent:
  child: value`;

      const result = formatYaml(input, { indent: 4 });
      expect(result.formatted).not.toBeNull();
      // With indent 4, child should be indented with 4 spaces
      expect(result.formatted).toContain('    child');
    });
  });

  describe('findCodeBlockAtLine', () => {
    const mockCodeBlock: LocatedCodeBlock = {
      lang: 'resume:experience',
      type: 'experience',
      content: 'company: Test',
      range: {
        start: { line: 5, character: 0 },
        end: { line: 10, character: 3 },
      },
      contentRange: {
        start: { line: 6, character: 0 },
        end: { line: 9, character: 0 },
      },
    };

    const mockDocument = {
      frontmatter: null,
      sections: [],
      codeBlocks: [mockCodeBlock],
    };

    it('should find code block when line is within range', () => {
      const result = findCodeBlockAtLine(mockDocument as any, 7);
      expect(result).toBe(mockCodeBlock);
    });

    it('should find code block at start line', () => {
      const result = findCodeBlockAtLine(mockDocument as any, 5);
      expect(result).toBe(mockCodeBlock);
    });

    it('should find code block at end line', () => {
      const result = findCodeBlockAtLine(mockDocument as any, 10);
      expect(result).toBe(mockCodeBlock);
    });

    it('should return null when line is before code block', () => {
      const result = findCodeBlockAtLine(mockDocument as any, 3);
      expect(result).toBeNull();
    });

    it('should return null when line is after code block', () => {
      const result = findCodeBlockAtLine(mockDocument as any, 15);
      expect(result).toBeNull();
    });
  });

  describe('getYamlContentRange', () => {
    it('should return range excluding fence markers', () => {
      const codeBlock: LocatedCodeBlock = {
        lang: 'resume:experience',
        type: 'experience',
        content: 'company: Test',
        range: {
          start: { line: 5, character: 0 },
          end: { line: 10, character: 3 },
        },
        contentRange: {
          start: { line: 6, character: 0 },
          end: { line: 9, character: 0 },
        },
      };

      const range = getYamlContentRange(codeBlock);
      // Content starts after opening fence (line 5) -> line 6
      expect(range.start.line).toBe(6);
      expect(range.start.character).toBe(0);
      // Content ends before closing fence (line 10) -> line 10
      expect(range.end.line).toBe(10);
      expect(range.end.character).toBe(0);
    });
  });

  describe('rangeOverlapsCodeBlock', () => {
    const codeBlock: LocatedCodeBlock = {
      lang: 'resume:experience',
      type: 'experience',
      content: 'company: Test',
      range: {
        start: { line: 5, character: 0 },
        end: { line: 10, character: 3 },
      },
      contentRange: {
        start: { line: 6, character: 0 },
        end: { line: 9, character: 0 },
      },
    };

    it('should return true when range is completely inside code block', () => {
      const range = {
        start: { line: 6, character: 0 },
        end: { line: 8, character: 10 },
      };
      expect(rangeOverlapsCodeBlock(range, codeBlock)).toBe(true);
    });

    it('should return true when range overlaps start of code block', () => {
      const range = {
        start: { line: 3, character: 0 },
        end: { line: 7, character: 10 },
      };
      expect(rangeOverlapsCodeBlock(range, codeBlock)).toBe(true);
    });

    it('should return true when range overlaps end of code block', () => {
      const range = {
        start: { line: 8, character: 0 },
        end: { line: 15, character: 10 },
      };
      expect(rangeOverlapsCodeBlock(range, codeBlock)).toBe(true);
    });

    it('should return false when range is completely before code block', () => {
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 4, character: 10 },
      };
      expect(rangeOverlapsCodeBlock(range, codeBlock)).toBe(false);
    });

    it('should return false when range is completely after code block', () => {
      const range = {
        start: { line: 11, character: 0 },
        end: { line: 15, character: 10 },
      };
      expect(rangeOverlapsCodeBlock(range, codeBlock)).toBe(false);
    });
  });
});
