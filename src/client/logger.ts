/**
 * Logger for md2cv extension
 * Provides centralized logging to VS Code Output Channel
 */

import * as vscode from 'vscode';

/**
 * Log levels for filtering output
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Logger class for md2cv extension
 * Outputs to VS Code Output Channel for user visibility
 */
class Logger implements vscode.Disposable {
  private outputChannel: vscode.OutputChannel;
  private logLevel: LogLevel = LogLevel.INFO;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('md2cv');
  }

  /**
   * Set the minimum log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Get the current log level
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * Format a log message with timestamp and level
   */
  private formatMessage(level: string, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ') : '';
    return `[${timestamp}] [${level}] ${message}${formattedArgs}`;
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      this.outputChannel.appendLine(this.formatMessage('DEBUG', message, ...args));
    }
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: unknown[]): void {
    if (this.logLevel <= LogLevel.INFO) {
      this.outputChannel.appendLine(this.formatMessage('INFO', message, ...args));
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.logLevel <= LogLevel.WARN) {
      this.outputChannel.appendLine(this.formatMessage('WARN', message, ...args));
    }
  }

  /**
   * Log an error message
   */
  error(message: string, ...args: unknown[]): void {
    if (this.logLevel <= LogLevel.ERROR) {
      this.outputChannel.appendLine(this.formatMessage('ERROR', message, ...args));
    }
  }

  /**
   * Show the output channel
   */
  show(): void {
    this.outputChannel.show();
  }

  /**
   * Clear the output channel
   */
  clear(): void {
    this.outputChannel.clear();
  }

  /**
   * Dispose of the logger
   */
  dispose(): void {
    this.outputChannel.dispose();
  }
}

// Singleton instance
let _logger: Logger | undefined;

/**
 * Get the singleton logger instance
 */
export function getLogger(): Logger {
  if (!_logger) {
    _logger = new Logger();
  }
  return _logger;
}

/**
 * Dispose of the singleton logger instance
 */
export function disposeLogger(): void {
  if (_logger) {
    _logger.dispose();
    _logger = undefined;
  }
}

/**
 * Convenience exports for direct logging
 */
export const logger = {
  debug: (message: string, ...args: unknown[]) => getLogger().debug(message, ...args),
  info: (message: string, ...args: unknown[]) => getLogger().info(message, ...args),
  warn: (message: string, ...args: unknown[]) => getLogger().warn(message, ...args),
  error: (message: string, ...args: unknown[]) => getLogger().error(message, ...args),
  show: () => getLogger().show(),
  clear: () => getLogger().clear(),
  setLogLevel: (level: LogLevel) => getLogger().setLogLevel(level),
};
