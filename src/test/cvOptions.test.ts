/**
 * Unit tests for cvOptions module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_MARGINS, getMarginSettings } from '../client/cvOptions';

// Mock vscode module
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(),
  },
}));

import * as vscode from 'vscode';

describe('cvOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DEFAULT_MARGINS', () => {
    it('should have 25mm margins on all sides', () => {
      expect(DEFAULT_MARGINS).toEqual({
        top: 25,
        right: 25,
        bottom: 25,
        left: 25,
      });
    });
  });

  describe('getMarginSettings', () => {
    it('should return DEFAULT_MARGINS when no config is set', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
      } as unknown as vscode.WorkspaceConfiguration);

      const result = getMarginSettings();
      expect(result).toEqual(DEFAULT_MARGINS);
    });

    it('should return DEFAULT_MARGINS when config is null', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn().mockReturnValue(null),
      } as unknown as vscode.WorkspaceConfiguration);

      const result = getMarginSettings();
      expect(result).toEqual(DEFAULT_MARGINS);
    });

    it('should apply single number to all sides', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn().mockReturnValue(20),
      } as unknown as vscode.WorkspaceConfiguration);

      const result = getMarginSettings();
      expect(result).toEqual({
        top: 20,
        right: 20,
        bottom: 20,
        left: 20,
      });
    });

    it('should apply single number 0 to all sides', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn().mockReturnValue(0),
      } as unknown as vscode.WorkspaceConfiguration);

      const result = getMarginSettings();
      expect(result).toEqual({
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      });
    });

    it('should use object values when all sides are specified', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn().mockReturnValue({
          top: 10,
          right: 15,
          bottom: 20,
          left: 25,
        }),
      } as unknown as vscode.WorkspaceConfiguration);

      const result = getMarginSettings();
      expect(result).toEqual({
        top: 10,
        right: 15,
        bottom: 20,
        left: 25,
      });
    });

    it('should merge partial object with defaults', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn().mockReturnValue({
          top: 10,
          bottom: 20,
        }),
      } as unknown as vscode.WorkspaceConfiguration);

      const result = getMarginSettings();
      expect(result).toEqual({
        top: 10,
        right: 25, // default
        bottom: 20,
        left: 25, // default
      });
    });

    it('should handle object with only one side specified', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn().mockReturnValue({
          left: 50,
        }),
      } as unknown as vscode.WorkspaceConfiguration);

      const result = getMarginSettings();
      expect(result).toEqual({
        top: 25,
        right: 25,
        bottom: 25,
        left: 50,
      });
    });

    it('should call getConfiguration with md2cv namespace', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
      } as unknown as vscode.WorkspaceConfiguration);

      getMarginSettings();
      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('md2cv');
    });

    it('should call get with marginMm key', () => {
      const getMock = vi.fn().mockReturnValue(undefined);
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: getMock,
      } as unknown as vscode.WorkspaceConfiguration);

      getMarginSettings();
      expect(getMock).toHaveBeenCalledWith('marginMm');
    });
  });
});
