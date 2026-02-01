import { describe, it, expect, vi } from 'vitest';
import { extractCvContent, generatePageConfig } from '../preview/previewProvider';

// Mock vscode module
vi.mock('vscode', () => ({
  l10n: {
    t: (key: string) => key,
  },
  window: {
    createWebviewPanel: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  ViewColumn: {
    Beside: 2,
  },
  commands: {
    executeCommand: vi.fn(),
  },
  Position: class {
    constructor(
      public line: number,
      public character: number
    ) {}
  },
  Range: class {
    constructor(
      public start: { line: number },
      public end: { line: number }
    ) {}
  },
  TextEditorRevealType: {
    AtTop: 1,
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue: unknown) => defaultValue),
    })),
  },
}));

// Mock md2cv
vi.mock('md2cv', () => ({
  parseMarkdown: vi.fn(() => ({
    ok: true,
    value: {
      metadata: { name: 'Test' },
      sections: [],
    },
  })),
  generateEnHtml: vi.fn(() => '<html><body>EN CV</body></html>'),
  generateJaHtml: vi.fn(() => '<html><body>JA CV</body></html>'),
  generateRirekishoHTML: vi.fn(() => '<html><body>Rirekisho</body></html>'),
  detectLanguage: vi.fn(() => 'en'),
  readPhotoAsDataUri: vi.fn(() => 'data:image/png;base64,test'),
  escapeHtml: vi.fn((s: string) => s),
  PAGE_SIZES: {
    a4: { width: 210, height: 297 },
    a3: { width: 297, height: 420 },
    b4: { width: 257, height: 364 },
    b5: { width: 182, height: 257 },
    letter: { width: 215.9, height: 279.4 },
  },
  PAGE_SIZES_LANDSCAPE: {
    a4: { width: 297, height: 210 },
    a3: { width: 420, height: 297 },
    b4: { width: 364, height: 257 },
    b5: { width: 257, height: 182 },
    letter: { width: 279.4, height: 215.9 },
  },
}));

// Mock logger
vi.mock('../client/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock envLoader
vi.mock('../client/envLoader', () => ({
  withEnvFromFile: vi.fn((path: string, fn: () => string) => fn()),
}));

// Mock cvOptions
vi.mock('../client/cvOptions', () => ({
  getMarginSettings: vi.fn(() => ({
    top: 30,
    right: 30,
    bottom: 30,
    left: 30,
  })),
}));

// Mock syncScroll
vi.mock('../client/syncScroll', () => ({
  SyncScrollManager: vi.fn().mockImplementation(() => ({
    onScrollToPreview: vi.fn(),
    onScrollToEditor: vi.fn(),
    updateSectionPositions: vi.fn(),
    handleEditorScroll: vi.fn(),
    handleWebviewScroll: vi.fn(),
    isEnabled: vi.fn(() => true),
    setEnabled: vi.fn(),
    dispose: vi.fn(),
  })),
}));

describe('previewProvider', () => {
  describe('extractCvContent', () => {
    it('should extract body content from HTML', () => {
      const html = `<!DOCTYPE html>
<html>
<head><style>.cv { color: black; }</style></head>
<body class="cv-body">
<div class="content">Hello World</div>
</body>
</html>`;

      const result = extractCvContent(html);

      expect(result.bodyContent).toContain('Hello World');
      expect(result.bodyClass).toBe('cv-body');
    });

    it('should extract styles from HTML', () => {
      const html = `<!DOCTYPE html>
<html>
<head>
<style>.cv { color: black; }</style>
<style>.header { font-size: 24px; }</style>
</head>
<body>Content</body>
</html>`;

      const result = extractCvContent(html);

      expect(result.cvStyles).toContain('.cv { color: black; }');
      expect(result.cvStyles).toContain('.header { font-size: 24px; }');
    });

    it('should remove @page rules from styles', () => {
      const html = `<!DOCTYPE html>
<html>
<head>
<style>
@page { size: A4; margin: 20mm; }
.cv { color: black; }
</style>
</head>
<body>Content</body>
</html>`;

      const result = extractCvContent(html);

      expect(result.cvStyles).not.toContain('@page');
      expect(result.cvStyles).toContain('.cv { color: black; }');
    });

    it('should handle HTML without body class', () => {
      const html = `<html><body>Content</body></html>`;

      const result = extractCvContent(html);

      expect(result.bodyClass).toBe('');
      expect(result.bodyContent).toBe('Content');
    });

    it('should handle HTML without styles', () => {
      const html = `<html><body>Content</body></html>`;

      const result = extractCvContent(html);

      expect(result.cvStyles).toBe('');
    });

    it('should handle malformed HTML gracefully', () => {
      const html = 'Just plain text without HTML tags';

      const result = extractCvContent(html);

      expect(result.bodyContent).toBe(html);
      expect(result.bodyClass).toBe('');
      expect(result.cvStyles).toBe('');
    });

    it('should remove body width/padding rules', () => {
      const html = `<!DOCTYPE html>
<html>
<head>
<style>
body { width: 210mm; min-height: 297mm; padding: 20mm; margin: 0 auto; color: black; }
</style>
</head>
<body>Content</body>
</html>`;

      const result = extractCvContent(html);

      expect(result.cvStyles).not.toContain('width:');
      expect(result.cvStyles).not.toContain('min-height:');
      expect(result.cvStyles).not.toContain('padding:');
      expect(result.cvStyles).not.toContain('margin: 0 auto');
    });
  });

  describe('generatePageConfig', () => {
    it('should generate page config for A4 portrait', () => {
      const config = generatePageConfig('a4', 'cv');

      expect(config).toContain('@page');
      expect(config).toContain('size:');
      expect(config).toContain('margin:');
    });

    it('should generate page config for A4 landscape (rirekisho)', () => {
      const config = generatePageConfig('a4', 'rirekisho');

      expect(config).toContain('@page');
      // Landscape dimensions should be different
    });

    it('should generate page config for different paper sizes', () => {
      const paperSizes = ['a3', 'a4', 'b4', 'b5', 'letter'] as const;

      for (const size of paperSizes) {
        const config = generatePageConfig(size, 'cv');
        expect(config).toContain('@page');
        expect(config).toContain('size:');
      }
    });

    it('should include margin settings for CV format', () => {
      const config = generatePageConfig('a4', 'cv');

      expect(config).toContain('30mm');
    });

    it('should use zero margins for rirekisho format', () => {
      const config = generatePageConfig('a4', 'rirekisho');

      // Rirekisho handles its own margins internally
      expect(config).toContain('margin: 0');
      expect(config).not.toContain('30mm');
    });
  });
});
