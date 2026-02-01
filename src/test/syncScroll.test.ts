import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractSectionPositions,
  findSectionAtLine,
  calculatePositionInSection,
  calculateScrollPercentage,
  findLineForSection,
  SyncScrollManager,
  type SectionPosition,
} from '../client/syncScroll';

// Mock vscode module
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue: unknown) => {
        if (key === 'enableSyncScroll') return true;
        return defaultValue;
      }),
    })),
  },
}));

// Mock md2cv parser
vi.mock('md2cv/parser/lsp', () => ({
  parseMarkdownWithPositions: vi.fn((content: string) => {
    // Simple mock implementation
    if (content.includes('error')) {
      return { ok: false, error: 'Parse error' };
    }

    const sections: Array<{
      id: string;
      title: string;
      range: { start: { line: number }; end: { line: number } };
    }> = [];

    // Parse sections from content
    const lines = content.split('\n');
    let currentSection: { id: string; title: string; startLine: number } | null = null;

    lines.forEach((line, index) => {
      const match = line.match(/^##\s+(.+)/);
      if (match) {
        if (currentSection) {
          sections.push({
            id: currentSection.id,
            title: currentSection.title,
            range: {
              start: { line: currentSection.startLine },
              end: { line: index - 1 },
            },
          });
        }
        const title = match[1];
        currentSection = {
          id: title.toLowerCase().replace(/\s+/g, '-'),
          title,
          startLine: index,
        };
      }
    });

    if (currentSection) {
      sections.push({
        id: currentSection.id,
        title: currentSection.title,
        range: {
          start: { line: currentSection.startLine },
          end: { line: lines.length - 1 },
        },
      });
    }

    return {
      ok: true,
      value: {
        frontmatter: content.startsWith('---')
          ? {
              range: { start: { line: 0 }, end: { line: 2 } },
            }
          : null,
        sections,
      },
    };
  }),
}));

describe('syncScroll', () => {
  describe('extractSectionPositions', () => {
    it('should extract sections from markdown content', () => {
      const content = `## Summary
This is a summary.

## Experience
Work experience here.

## Education
Education details.`;

      const positions = extractSectionPositions(content);

      expect(positions).toHaveLength(3);
      expect(positions[0].id).toBe('summary');
      expect(positions[0].title).toBe('Summary');
      expect(positions[1].id).toBe('experience');
      expect(positions[2].id).toBe('education');
    });

    it('should include frontmatter as a section', () => {
      const content = `---
name: John Doe
---

## Summary
Content here.`;

      const positions = extractSectionPositions(content);

      expect(positions[0].id).toBe('frontmatter');
      expect(positions[0].title).toBe('Frontmatter');
    });

    it('should return empty array on parse error', () => {
      const content = 'error content';
      const positions = extractSectionPositions(content);
      expect(positions).toEqual([]);
    });

    it('should handle empty content', () => {
      const positions = extractSectionPositions('');
      expect(positions).toEqual([]);
    });
  });

  describe('findSectionAtLine', () => {
    const sections: SectionPosition[] = [
      { id: 'summary', title: 'Summary', startLine: 0, endLine: 5 },
      { id: 'experience', title: 'Experience', startLine: 6, endLine: 15 },
      { id: 'education', title: 'Education', startLine: 16, endLine: 20 },
    ];

    it('should find section containing the line', () => {
      const section = findSectionAtLine(sections, 3);
      expect(section?.id).toBe('summary');
    });

    it('should find section at exact start line', () => {
      const section = findSectionAtLine(sections, 6);
      expect(section?.id).toBe('experience');
    });

    it('should find section at exact end line', () => {
      const section = findSectionAtLine(sections, 15);
      expect(section?.id).toBe('experience');
    });

    it('should return closest section before line if no exact match', () => {
      // Line 25 is after all sections, should return last section
      const section = findSectionAtLine(sections, 25);
      expect(section?.id).toBe('education');
    });

    it('should return null for line before all sections', () => {
      const sectionsStartingLater: SectionPosition[] = [
        { id: 'summary', title: 'Summary', startLine: 10, endLine: 15 },
      ];
      const section = findSectionAtLine(sectionsStartingLater, 5);
      expect(section).toBeNull();
    });

    it('should handle empty sections array', () => {
      const section = findSectionAtLine([], 5);
      expect(section).toBeNull();
    });
  });

  describe('calculatePositionInSection', () => {
    const section: SectionPosition = {
      id: 'test',
      title: 'Test',
      startLine: 10,
      endLine: 20,
    };

    it('should return 0 at section start', () => {
      const position = calculatePositionInSection(section, 10);
      expect(position).toBe(0);
    });

    it('should return 1 at section end', () => {
      const position = calculatePositionInSection(section, 20);
      expect(position).toBe(1);
    });

    it('should return 0.5 at section middle', () => {
      const position = calculatePositionInSection(section, 15);
      expect(position).toBe(0.5);
    });

    it('should clamp to 0 for lines before section', () => {
      const position = calculatePositionInSection(section, 5);
      expect(position).toBe(0);
    });

    it('should clamp to 1 for lines after section', () => {
      const position = calculatePositionInSection(section, 25);
      expect(position).toBe(1);
    });

    it('should handle zero-length section', () => {
      const zeroSection: SectionPosition = {
        id: 'zero',
        title: 'Zero',
        startLine: 10,
        endLine: 10,
      };
      const position = calculatePositionInSection(zeroSection, 10);
      expect(position).toBe(0);
    });
  });

  describe('calculateScrollPercentage', () => {
    it('should return 0 at first line', () => {
      const percentage = calculateScrollPercentage(0, 100);
      expect(percentage).toBe(0);
    });

    it('should return 1 at last line', () => {
      const percentage = calculateScrollPercentage(99, 100);
      expect(percentage).toBe(1);
    });

    it('should return 0.5 at middle', () => {
      const percentage = calculateScrollPercentage(50, 101);
      expect(percentage).toBe(0.5);
    });

    it('should handle single line document', () => {
      const percentage = calculateScrollPercentage(0, 1);
      expect(percentage).toBe(0);
    });

    it('should clamp negative lines to 0', () => {
      const percentage = calculateScrollPercentage(-5, 100);
      expect(percentage).toBe(0);
    });

    it('should clamp lines beyond total to 1', () => {
      const percentage = calculateScrollPercentage(150, 100);
      expect(percentage).toBe(1);
    });
  });

  describe('findLineForSection', () => {
    const sections: SectionPosition[] = [
      { id: 'summary', title: 'Summary', startLine: 0, endLine: 5 },
      { id: 'experience', title: 'Experience', startLine: 6, endLine: 15 },
    ];

    it('should find line for existing section', () => {
      const line = findLineForSection(sections, 'experience');
      expect(line).toBe(6);
    });

    it('should return null for non-existent section', () => {
      const line = findLineForSection(sections, 'nonexistent');
      expect(line).toBeNull();
    });

    it('should handle empty sections array', () => {
      const line = findLineForSection([], 'summary');
      expect(line).toBeNull();
    });
  });

  describe('SyncScrollManager', () => {
    let manager: SyncScrollManager;

    beforeEach(() => {
      manager = new SyncScrollManager();
    });

    afterEach(() => {
      manager.dispose();
    });

    it('should be enabled by default', () => {
      expect(manager.isEnabled()).toBe(true);
    });

    it('should allow enabling/disabling', () => {
      manager.setEnabled(false);
      expect(manager.isEnabled()).toBe(false);

      manager.setEnabled(true);
      expect(manager.isEnabled()).toBe(true);
    });

    it('should update section positions', () => {
      const content = `## Summary
Content here.

## Experience
More content.`;

      manager.updateSectionPositions(content);
      const positions = manager.getSectionPositions();

      expect(positions).toHaveLength(2);
      expect(positions[0].id).toBe('summary');
      expect(positions[1].id).toBe('experience');
    });

    it('should return copy of section positions', () => {
      const content = `## Summary
Content.`;

      manager.updateSectionPositions(content);
      const positions1 = manager.getSectionPositions();
      const positions2 = manager.getSectionPositions();

      expect(positions1).not.toBe(positions2);
      expect(positions1).toEqual(positions2);
    });

    it('should set scroll to preview callback', () => {
      const callback = vi.fn();
      manager.onScrollToPreview(callback);

      // The callback is stored internally
      expect(callback).not.toHaveBeenCalled();
    });

    it('should set scroll to editor callback', () => {
      const callback = vi.fn();
      manager.onScrollToEditor(callback);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle webview scroll with section', () => {
      const callback = vi.fn();
      manager.onScrollToEditor(callback);

      const content = `## Summary
Content here.`;
      manager.updateSectionPositions(content);

      manager.handleWebviewScroll({
        type: 'scroll',
        sectionId: 'summary',
      });

      expect(callback).toHaveBeenCalledWith(0);
    });

    it('should not handle webview scroll when disabled', () => {
      const callback = vi.fn();
      manager.onScrollToEditor(callback);
      manager.setEnabled(false);

      manager.handleWebviewScroll({
        type: 'scroll',
        sectionId: 'summary',
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should not handle webview scroll without callback', () => {
      // No callback set, should not throw
      manager.handleWebviewScroll({
        type: 'scroll',
        sectionId: 'summary',
      });
    });

    it('should handle webview scroll with position only', () => {
      const callback = vi.fn();
      manager.onScrollToEditor(callback);

      const content = `## Summary
Content here.

## Experience
More content.`;
      manager.updateSectionPositions(content);

      manager.handleWebviewScroll({
        type: 'scroll',
        position: 0.5,
      });

      // Position-based scrolling should work when sections are available
      expect(callback).toHaveBeenCalled();
    });

    it('should handle webview scroll with positionInSection', () => {
      const callback = vi.fn();
      manager.onScrollToEditor(callback);

      const content = `## Summary
Line 1
Line 2
Line 3
Line 4

## Experience
More content.`;
      manager.updateSectionPositions(content);

      manager.handleWebviewScroll({
        type: 'scroll',
        sectionId: 'summary',
        positionInSection: 0.5,
      });

      // Should scroll to middle of section
      expect(callback).toHaveBeenCalled();
      const calledLine = callback.mock.calls[0][0];
      expect(calledLine).toBeGreaterThanOrEqual(0);
    });

    it('should fall back to percentage scrolling when section not found', () => {
      const callback = vi.fn();
      manager.onScrollToEditor(callback);

      const content = `## Summary
Content here.

## Experience
More content.`;
      manager.updateSectionPositions(content);

      manager.handleWebviewScroll({
        type: 'scroll',
        sectionId: 'nonexistent',
        position: 0.5,
      });

      // Should fall back to percentage-based scrolling
      expect(callback).toHaveBeenCalled();
    });

    it('should dispose cleanly', () => {
      manager.dispose();
      // Should not throw
    });
  });
});
