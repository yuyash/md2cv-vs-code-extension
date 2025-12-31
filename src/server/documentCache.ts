/**
 * Document Cache Module
 * Manages parsed document cache for efficient re-parsing on document changes
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';

import {
  parseDocument,
  type ParsedDocumentWithPositions,
  type ParseError,
  type ParseResult,
} from './parser.js';

/**
 * Cached document entry
 */
interface CachedDocument {
  readonly version: number;
  readonly result: ParseResult;
}

/**
 * Document cache for managing parsed documents
 */
export class DocumentCache {
  private readonly cache: Map<string, CachedDocument> = new Map();

  /**
   * Get or parse a document
   * Returns cached result if version matches, otherwise re-parses
   */
  getOrParse(document: TextDocument): ParseResult {
    const uri = document.uri;
    const version = document.version;
    const cached = this.cache.get(uri);

    // Return cached result if version matches
    if (cached && cached.version === version) {
      return cached.result;
    }

    // Parse and cache
    const result = parseDocument(document.getText());
    this.cache.set(uri, { version, result });
    return result;
  }

  /**
   * Get cached document if available
   */
  getCached(uri: string): ParsedDocumentWithPositions | null {
    const cached = this.cache.get(uri);
    return cached?.result.document ?? null;
  }

  /**
   * Get cached errors if available
   */
  getCachedErrors(uri: string): readonly ParseError[] {
    const cached = this.cache.get(uri);
    return cached?.result.errors ?? [];
  }

  /**
   * Invalidate cache for a document
   */
  invalidate(uri: string): void {
    this.cache.delete(uri);
  }

  /**
   * Clear all cached documents
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Check if a document is cached
   */
  has(uri: string): boolean {
    return this.cache.has(uri);
  }

  /**
   * Get the number of cached documents
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * Singleton instance of the document cache
 */
export const documentCache = new DocumentCache();
