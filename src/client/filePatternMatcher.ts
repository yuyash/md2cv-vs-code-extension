import * as vscode from 'vscode';

/**
 * Check if a document matches any of the given glob patterns
 * @param document The document to check
 * @param patterns Array of glob patterns (e.g., `['** /cv*.md', '** /resume*.md']`)
 * @returns True if the document matches any pattern
 */
export function matchesAnyPattern(document: vscode.TextDocument, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  const documentUri = document.uri;

  // Check each pattern
  for (const pattern of patterns) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);

    if (workspaceFolder) {
      const relativePattern = new vscode.RelativePattern(workspaceFolder, pattern);

      // Use VS Code's built-in matching
      if (vscode.languages.match({ pattern: relativePattern, scheme: 'file' }, document) > 0) {
        return true;
      }
    } else {
      // Fallback to simple pattern matching if no workspace folder
      if (vscode.languages.match({ pattern: pattern, scheme: 'file' }, document) > 0) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a file path matches any of the given glob patterns
 * This is a simpler version that works with file paths directly
 * @param filePath The file path to check
 * @param patterns Array of glob patterns
 * @returns True if the path matches any pattern
 */
export function matchesAnyPatternPath(filePath: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  // Simple pattern matching using minimatch-style logic
  for (const pattern of patterns) {
    if (matchPattern(filePath, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Simple glob pattern matching
 * Supports: *, **, ?, [abc], {a,b,c}
 */
function matchPattern(path: string, pattern: string): boolean {
  // Normalize path separators
  const normalizedPath = path.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Convert glob pattern to regex
  const regexPattern = globToRegex(normalizedPattern);
  return regexPattern.test(normalizedPath);
}

/**
 * Convert a glob pattern to a regular expression
 */
function globToRegex(pattern: string): RegExp {
  let regex = '';
  let inGroup = false;
  let _inClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];

    switch (char) {
      case '/':
        regex += '\\/';
        break;
      case '*':
        if (pattern[i + 1] === '*') {
          // ** matches any number of directories
          regex += '.*';
          i++; // Skip next *
          if (pattern[i + 1] === '/') {
            i++; // Skip /
            regex += '\\/';
          }
        } else {
          // * matches anything except /
          regex += '[^/]*';
        }
        break;
      case '?':
        regex += '[^/]';
        break;
      case '[':
        _inClass = true;
        regex += '[';
        break;
      case ']':
        _inClass = false;
        regex += ']';
        break;
      case '{':
        inGroup = true;
        regex += '(';
        break;
      case '}':
        inGroup = false;
        regex += ')';
        break;
      case ',':
        if (inGroup) {
          regex += '|';
        } else {
          regex += ',';
        }
        break;
      case '.':
      case '(':
      case ')':
      case '+':
      case '|':
      case '^':
      case '$':
        // Escape regex special characters
        regex += '\\' + char;
        break;
      default:
        regex += char;
    }
  }

  return new RegExp('^' + regex + '$', 'i');
}
