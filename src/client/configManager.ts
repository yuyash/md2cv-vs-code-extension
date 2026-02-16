import * as vscode from 'vscode';
import type { OutputFormat, PaperSize } from 'md2cv';
import { logger } from './logger';

/**
 * Configuration section name for md2cv extension
 */
const CONFIG_SECTION = 'md2cv';

/**
 * Configuration keys for md2cv extension
 */
export const ConfigKeys = {
  DEFAULT_FORMAT: 'defaultFormat',
  DEFAULT_PAPER_SIZE: 'defaultPaperSize',
  PREVIEW_UPDATE_DELAY: 'previewUpdateDelay',
  ENABLE_SYNC_SCROLL: 'enableSyncScroll',
  TEMPLATE_LANGUAGE: 'templateLanguage',
  INCLUDE_TEMPLATE_COMMENTS: 'includeTemplateComments',
  DEFAULT_LANGUAGE: 'defaultLanguage',
  CV_FILE_PATTERNS: 'cvFilePatterns',
} as const;

/**
 * Type for configuration keys
 */
export type ConfigKey = (typeof ConfigKeys)[keyof typeof ConfigKeys];

/**
 * CV language type
 */
export type CvLanguage = 'auto' | 'en' | 'ja';

/**
 * md2cv extension configuration interface
 * Matches the schema defined in package.json contributes.configuration
 */
export interface Md2cvConfig {
  /** Default document format for preview and export */
  defaultFormat: OutputFormat;
  /** Default paper size for PDF export */
  defaultPaperSize: PaperSize;
  /** Delay in milliseconds before updating preview after editing */
  previewUpdateDelay: number;
  /** Enable synchronized scrolling between editor and preview */
  enableSyncScroll: boolean;
  /** Default language for generated templates */
  templateLanguage: 'en' | 'ja';
  /** Include explanatory comments in generated templates */
  includeTemplateComments: boolean;
  /** Default CV language (auto-detect, English, or Japanese) */
  defaultLanguage: CvLanguage;
  /** File patterns to enable md2cv features (glob patterns) */
  cvFilePatterns: string[];
}

/**
 * Default configuration values
 * These match the defaults defined in package.json
 */
export const DEFAULT_CONFIG: Readonly<Md2cvConfig> = {
  defaultFormat: 'cv',
  defaultPaperSize: 'a4',
  previewUpdateDelay: 300,
  enableSyncScroll: true,
  templateLanguage: 'en',
  includeTemplateComments: true,
  defaultLanguage: 'auto',
  cvFilePatterns: [
    '**/cv*.md',
    '**/resume*.md',
    '**/rirekisho*.md',
    '**/shokumukeirekisho*.md',
    '**/cover_letter*.md',
    '**/coverletter*.md',
  ],
};

/**
 * Configuration change event data
 */
export interface ConfigChangeEvent {
  /** The key that changed */
  key: ConfigKey;
  /** The new value */
  newValue: unknown;
  /** The previous value */
  oldValue: unknown;
  /** Whether the change affects workspace configuration */
  affectsWorkspace: boolean;
}

/**
 * Configuration change listener type
 */
export type ConfigChangeListener = (event: ConfigChangeEvent) => void;

/**
 * Configuration Manager for md2cv extension
 *
 * Provides centralized access to extension configuration with:
 * - Type-safe configuration access
 * - Configuration change monitoring
 * - Support for both workspace and user settings
 * - Automatic default value handling
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */
export class ConfigurationManager implements vscode.Disposable {
  private _disposables: vscode.Disposable[] = [];
  private _listeners: Map<ConfigKey | '*', Set<ConfigChangeListener>> = new Map();
  private _cachedConfig: Md2cvConfig;

  constructor() {
    // Initialize cached configuration
    this._cachedConfig = this._loadFullConfig();

    // Register configuration change listener
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(CONFIG_SECTION)) {
          this._handleConfigurationChange(event);
        }
      })
    );
  }

  /**
   * Load the full configuration from VS Code settings
   * @returns The complete md2cv configuration
   */
  private _loadFullConfig(): Md2cvConfig {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

    return {
      defaultFormat: config.get<OutputFormat>(
        ConfigKeys.DEFAULT_FORMAT,
        DEFAULT_CONFIG.defaultFormat
      ),
      defaultPaperSize: config.get<PaperSize>(
        ConfigKeys.DEFAULT_PAPER_SIZE,
        DEFAULT_CONFIG.defaultPaperSize
      ),
      previewUpdateDelay: config.get<number>(
        ConfigKeys.PREVIEW_UPDATE_DELAY,
        DEFAULT_CONFIG.previewUpdateDelay
      ),
      enableSyncScroll: config.get<boolean>(
        ConfigKeys.ENABLE_SYNC_SCROLL,
        DEFAULT_CONFIG.enableSyncScroll
      ),
      templateLanguage: config.get<'en' | 'ja'>(
        ConfigKeys.TEMPLATE_LANGUAGE,
        DEFAULT_CONFIG.templateLanguage
      ),
      includeTemplateComments: config.get<boolean>(
        ConfigKeys.INCLUDE_TEMPLATE_COMMENTS,
        DEFAULT_CONFIG.includeTemplateComments
      ),
      defaultLanguage: config.get<CvLanguage>(
        ConfigKeys.DEFAULT_LANGUAGE,
        DEFAULT_CONFIG.defaultLanguage
      ),
      cvFilePatterns: config.get<string[]>(
        ConfigKeys.CV_FILE_PATTERNS,
        DEFAULT_CONFIG.cvFilePatterns
      ),
    };
  }

  /**
   * Handle configuration change events
   * Detects which specific settings changed and notifies listeners
   */
  private _handleConfigurationChange(event: vscode.ConfigurationChangeEvent): void {
    const oldConfig = this._cachedConfig;
    const newConfig = this._loadFullConfig();
    this._cachedConfig = newConfig;

    // Check each configuration key for changes
    const keys = Object.values(ConfigKeys);
    for (const key of keys) {
      const fullKey = `${CONFIG_SECTION}.${key}`;
      if (event.affectsConfiguration(fullKey)) {
        const oldValue = oldConfig[key as keyof Md2cvConfig];
        const newValue = newConfig[key as keyof Md2cvConfig];

        // Only notify if value actually changed
        if (oldValue !== newValue) {
          const changeEvent: ConfigChangeEvent = {
            key,
            newValue,
            oldValue,
            affectsWorkspace: event.affectsConfiguration(
              fullKey,
              vscode.workspace.workspaceFolders?.[0]?.uri
            ),
          };

          this._notifyListeners(key, changeEvent);
        }
      }
    }
  }

  /**
   * Notify listeners of a configuration change
   */
  private _notifyListeners(key: ConfigKey, event: ConfigChangeEvent): void {
    // Notify specific key listeners
    const keyListeners = this._listeners.get(key);
    if (keyListeners) {
      for (const listener of keyListeners) {
        try {
          listener(event);
        } catch (error) {
          logger.error(`Error in config change listener for ${key}:`, error);
        }
      }
    }

    // Notify wildcard listeners
    const wildcardListeners = this._listeners.get('*');
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        try {
          listener(event);
        } catch (error) {
          logger.error('Error in wildcard config change listener:', error);
        }
      }
    }
  }

  /**
   * Get the full configuration object
   * @returns The complete md2cv configuration
   */
  public getConfig(): Readonly<Md2cvConfig> {
    return { ...this._cachedConfig };
  }

  /**
   * Get a specific configuration value
   * @param key The configuration key
   * @returns The configuration value
   */
  public get<K extends keyof Md2cvConfig>(key: K): Md2cvConfig[K] {
    return this._cachedConfig[key];
  }

  /**
   * Get the default document format
   */
  public getDefaultFormat(): OutputFormat {
    return this._cachedConfig.defaultFormat;
  }

  /**
   * Get the default paper size
   */
  public getDefaultPaperSize(): PaperSize {
    return this._cachedConfig.defaultPaperSize;
  }

  /**
   * Get the preview update delay in milliseconds
   */
  public getPreviewUpdateDelay(): number {
    return this._cachedConfig.previewUpdateDelay;
  }

  /**
   * Get whether sync scroll is enabled
   */
  public isSyncScrollEnabled(): boolean {
    return this._cachedConfig.enableSyncScroll;
  }

  /**
   * Get the template language
   */
  public getTemplateLanguage(): 'en' | 'ja' {
    return this._cachedConfig.templateLanguage;
  }

  /**
   * Get whether template comments should be included
   */
  public shouldIncludeTemplateComments(): boolean {
    return this._cachedConfig.includeTemplateComments;
  }

  /**
   * Get the default CV language
   */
  public getDefaultLanguage(): CvLanguage {
    return this._cachedConfig.defaultLanguage;
  }

  /**
   * Get the CV file patterns
   */
  public getCvFilePatterns(): string[] {
    return this._cachedConfig.cvFilePatterns;
  }

  /**
   * Update a configuration value
   * Supports both workspace and user (global) configuration targets
   *
   * @param key The configuration key to update
   * @param value The new value
   * @param target The configuration target (Workspace, Global, or WorkspaceFolder)
   * @returns Promise that resolves when the update is complete
   *
   * Requirements: 12.3 (workspace/user settings support)
   */
  public async update<K extends keyof Md2cvConfig>(
    key: K,
    value: Md2cvConfig[K],
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update(key, value, target);
  }

  /**
   * Update a configuration value in workspace settings
   * Falls back to global settings if no workspace is open
   * @param key The configuration key to update
   * @param value The new value
   */
  public async updateWorkspace<K extends keyof Md2cvConfig>(
    key: K,
    value: Md2cvConfig[K]
  ): Promise<void> {
    // Check if a workspace is open
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      await this.update(key, value, vscode.ConfigurationTarget.Workspace);
    } else {
      // Fall back to global settings if no workspace is open
      await this.update(key, value, vscode.ConfigurationTarget.Global);
    }
  }

  /**
   * Update a configuration value in user (global) settings
   * @param key The configuration key to update
   * @param value The new value
   */
  public async updateGlobal<K extends keyof Md2cvConfig>(
    key: K,
    value: Md2cvConfig[K]
  ): Promise<void> {
    await this.update(key, value, vscode.ConfigurationTarget.Global);
  }

  /**
   * Register a listener for configuration changes
   *
   * @param key The configuration key to listen for, or '*' for all changes
   * @param listener The callback function to invoke on changes
   * @returns A disposable to unregister the listener
   *
   * Requirements: 12.4 (configuration change monitoring)
   */
  public onDidChangeConfiguration(
    key: ConfigKey | '*',
    listener: ConfigChangeListener
  ): vscode.Disposable {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    this._listeners.get(key)!.add(listener);

    return {
      dispose: () => {
        const listeners = this._listeners.get(key);
        if (listeners) {
          listeners.delete(listener);
          if (listeners.size === 0) {
            this._listeners.delete(key);
          }
        }
      },
    };
  }

  /**
   * Check if a configuration value is set at the workspace level
   * @param key The configuration key to check
   * @returns True if the value is set at workspace level
   */
  public isSetAtWorkspaceLevel(key: keyof Md2cvConfig): boolean {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const inspection = config.inspect(key);
    return inspection?.workspaceValue !== undefined;
  }

  /**
   * Check if a configuration value is set at the user (global) level
   * @param key The configuration key to check
   * @returns True if the value is set at user level
   */
  public isSetAtUserLevel(key: keyof Md2cvConfig): boolean {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const inspection = config.inspect(key);
    return inspection?.globalValue !== undefined;
  }

  /**
   * Get the effective configuration scope for a key
   * @param key The configuration key to check
   * @returns The scope where the value is defined
   */
  public getEffectiveScope(
    key: keyof Md2cvConfig
  ): 'default' | 'user' | 'workspace' | 'workspaceFolder' {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const inspection = config.inspect(key);

    if (inspection?.workspaceFolderValue !== undefined) {
      return 'workspaceFolder';
    }
    if (inspection?.workspaceValue !== undefined) {
      return 'workspace';
    }
    if (inspection?.globalValue !== undefined) {
      return 'user';
    }
    return 'default';
  }

  /**
   * Reset a configuration value to its default
   * @param key The configuration key to reset
   * @param target The configuration target to reset (defaults to workspace)
   */
  public async reset(
    key: keyof Md2cvConfig,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update(key, undefined, target);
  }

  /**
   * Dispose of the configuration manager
   */
  public dispose(): void {
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
    this._listeners.clear();
  }
}

/**
 * Singleton instance of the configuration manager
 * Use this for global access to configuration
 */
let _instance: ConfigurationManager | undefined;

/**
 * Get the singleton configuration manager instance
 * Creates a new instance if one doesn't exist
 */
export function getConfigurationManager(): ConfigurationManager {
  if (!_instance) {
    _instance = new ConfigurationManager();
  }
  return _instance;
}

/**
 * Dispose of the singleton configuration manager instance
 * Call this during extension deactivation
 */
export function disposeConfigurationManager(): void {
  if (_instance) {
    _instance.dispose();
    _instance = undefined;
  }
}
