import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure mocks are available when vi.mock is hoisted
const { mockGet, mockUpdate, mockOnDidChangeConfiguration } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
  mockOnDidChangeConfiguration: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: mockGet,
      update: mockUpdate,
    })),
    onDidChangeConfiguration: mockOnDidChangeConfiguration,
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  Disposable: class {
    dispose() {}
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

import {
  ConfigurationManager,
  getConfigurationManager,
  disposeConfigurationManager,
  ConfigKeys,
  DEFAULT_CONFIG,
} from '../client/configManager';

describe('configManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disposeConfigurationManager();

    // Setup default mock returns
    mockGet.mockImplementation((_key: string, defaultValue: unknown) => {
      return defaultValue;
    });
    mockOnDidChangeConfiguration.mockReturnValue({ dispose: vi.fn() });
  });

  afterEach(() => {
    disposeConfigurationManager();
  });

  describe('ConfigKeys', () => {
    it('should have all expected keys', () => {
      expect(ConfigKeys.DEFAULT_FORMAT).toBe('defaultFormat');
      expect(ConfigKeys.DEFAULT_PAPER_SIZE).toBe('defaultPaperSize');
      expect(ConfigKeys.PREVIEW_UPDATE_DELAY).toBe('previewUpdateDelay');
      expect(ConfigKeys.ENABLE_SYNC_SCROLL).toBe('enableSyncScroll');
      expect(ConfigKeys.TEMPLATE_LANGUAGE).toBe('templateLanguage');
      expect(ConfigKeys.INCLUDE_TEMPLATE_COMMENTS).toBe('includeTemplateComments');
      expect(ConfigKeys.DEFAULT_LANGUAGE).toBe('defaultLanguage');
      expect(ConfigKeys.CV_FILE_PATTERNS).toBe('cvFilePatterns');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_CONFIG.defaultFormat).toBe('cv');
      expect(DEFAULT_CONFIG.defaultPaperSize).toBe('a4');
      expect(DEFAULT_CONFIG.previewUpdateDelay).toBe(300);
      expect(DEFAULT_CONFIG.enableSyncScroll).toBe(true);
      expect(DEFAULT_CONFIG.templateLanguage).toBe('en');
      expect(DEFAULT_CONFIG.includeTemplateComments).toBe(true);
      expect(DEFAULT_CONFIG.defaultLanguage).toBe('auto');
      expect(DEFAULT_CONFIG.cvFilePatterns).toEqual([
        '**/cv*.md',
        '**/resume*.md',
        '**/rirekisho*.md',
        '**/shokumukeirekisho*.md',
      ]);
    });
  });

  describe('getConfigurationManager', () => {
    it('should return singleton instance', () => {
      const manager1 = getConfigurationManager();
      const manager2 = getConfigurationManager();

      expect(manager1).toBe(manager2);
    });

    it('should create new instance after dispose', () => {
      const manager1 = getConfigurationManager();
      disposeConfigurationManager();
      const manager2 = getConfigurationManager();

      expect(manager1).not.toBe(manager2);
    });
  });

  describe('ConfigurationManager', () => {
    let manager: ConfigurationManager;

    beforeEach(() => {
      manager = getConfigurationManager();
    });

    describe('getConfig', () => {
      it('should return full configuration object', () => {
        const config = manager.getConfig();

        expect(config).toHaveProperty('defaultFormat');
        expect(config).toHaveProperty('defaultPaperSize');
        expect(config).toHaveProperty('previewUpdateDelay');
        expect(config).toHaveProperty('enableSyncScroll');
      });

      it('should return a copy of the config', () => {
        const config1 = manager.getConfig();
        const config2 = manager.getConfig();

        expect(config1).not.toBe(config2);
        expect(config1).toEqual(config2);
      });
    });

    describe('get', () => {
      it('should return specific config value', () => {
        mockGet.mockImplementation((key: string, defaultValue: unknown) => {
          if (key === 'defaultFormat') return 'rirekisho';
          return defaultValue;
        });

        // Need to create new manager to pick up new mock
        disposeConfigurationManager();
        manager = getConfigurationManager();

        expect(manager.get('defaultFormat')).toBe('rirekisho');
      });
    });

    describe('getDefaultFormat', () => {
      it('should return default format', () => {
        const format = manager.getDefaultFormat();
        expect(['cv', 'rirekisho', 'shokumukeirekisho', 'both']).toContain(format);
      });
    });

    describe('getDefaultPaperSize', () => {
      it('should return default paper size', () => {
        const size = manager.getDefaultPaperSize();
        expect(['a3', 'a4', 'b4', 'b5', 'letter']).toContain(size);
      });
    });

    describe('getPreviewUpdateDelay', () => {
      it('should return preview update delay', () => {
        const delay = manager.getPreviewUpdateDelay();
        expect(typeof delay).toBe('number');
        expect(delay).toBe(300); // Default value
      });

      it('should return configured delay value', () => {
        mockGet.mockImplementation((key: string, defaultValue: unknown) => {
          if (key === 'previewUpdateDelay') return 500;
          return defaultValue;
        });

        disposeConfigurationManager();
        manager = getConfigurationManager();

        const delay = manager.getPreviewUpdateDelay();
        expect(delay).toBe(500);
      });

      it('should return value even if below schema minimum (schema validation is UI-level)', () => {
        // Note: VS Code schema validation happens at the settings UI level,
        // not in the code. The code returns whatever value is configured.
        mockGet.mockImplementation((key: string, defaultValue: unknown) => {
          if (key === 'previewUpdateDelay') return 50;
          return defaultValue;
        });

        disposeConfigurationManager();
        manager = getConfigurationManager();

        const delay = manager.getPreviewUpdateDelay();
        expect(delay).toBe(50);
      });
    });

    describe('isSyncScrollEnabled', () => {
      it('should return sync scroll enabled state', () => {
        const enabled = manager.isSyncScrollEnabled();
        expect(typeof enabled).toBe('boolean');
      });
    });

    describe('getTemplateLanguage', () => {
      it('should return template language', () => {
        const lang = manager.getTemplateLanguage();
        expect(['en', 'ja']).toContain(lang);
      });
    });

    describe('shouldIncludeTemplateComments', () => {
      it('should return include template comments setting', () => {
        const include = manager.shouldIncludeTemplateComments();
        expect(typeof include).toBe('boolean');
      });
    });

    describe('getDefaultLanguage', () => {
      it('should return default language', () => {
        const lang = manager.getDefaultLanguage();
        expect(['auto', 'en', 'ja']).toContain(lang);
      });
    });

    describe('getCvFilePatterns', () => {
      it('should return CV file patterns', () => {
        const patterns = manager.getCvFilePatterns();
        expect(Array.isArray(patterns)).toBe(true);
      });
    });

    describe('onDidChangeConfiguration', () => {
      it('should register listener for specific key', () => {
        const listener = vi.fn();
        const disposable = manager.onDidChangeConfiguration('defaultFormat', listener);

        expect(disposable).toBeDefined();
        expect(typeof disposable.dispose).toBe('function');
      });

      it('should register wildcard listener', () => {
        const listener = vi.fn();
        const disposable = manager.onDidChangeConfiguration('*', listener);

        expect(disposable).toBeDefined();
      });
    });

    describe('updateWorkspace', () => {
      it('should update workspace configuration', async () => {
        mockUpdate.mockResolvedValue(undefined);

        await manager.updateWorkspace('defaultFormat', 'rirekisho');

        expect(mockUpdate).toHaveBeenCalled();
      });
    });

    describe('updateGlobal', () => {
      it('should update global configuration', async () => {
        mockUpdate.mockResolvedValue(undefined);

        await manager.updateGlobal('defaultFormat', 'rirekisho');

        expect(mockUpdate).toHaveBeenCalled();
      });
    });

    describe('dispose', () => {
      it('should dispose cleanly', () => {
        manager.dispose();
        // Should not throw
      });
    });
  });
});
