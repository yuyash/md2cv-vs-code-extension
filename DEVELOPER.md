# Developer Guide

This guide covers development setup, building, testing, and debugging the md2cv VS Code extension.

## Prerequisites

- Node.js 18.0.0 or higher
- npm
- VS Code 1.102.0 or higher

## Initial Setup

### 1. Install Dependencies

```bash
cd md2cv-vs-extension
npm install
```

### 2. Link Local md2cv Package (Optional)

If you're developing both the extension and the core `md2cv` package simultaneously, you can link the local package:

```bash
# Build and link the md2cv package
cd ../md2cv
npm run build
npm link

# Link it in the extension
cd ../md2cv-vs-extension
npm link md2cv
```

#### Verify the Link

Check if the link is active:

```bash
npm ls md2cv
```

You should see output like:

```
md2cv-vscode@1.0.0 /path/to/md2cv-vs-extension
└── md2cv@1.4.1 -> ./../../../md2cv
```

Or check the symlink directly:

```bash
ls -la node_modules/md2cv
```

#### Unlink (if needed)

```bash
npm unlink md2cv
npm install
```

## Building

### Production Build

```bash
npm run build
```

This builds both the client and server components:

- Client: `dist/client/extension.js`
- Server: `dist/server/server.js`

### Development Build (Watch Mode)

```bash
npm run watch
```

This runs both client and server builds in watch mode, automatically rebuilding on file changes.

### Individual Builds

```bash
# Build client only
npm run build:client

# Build server only
npm run build:server

# Watch client only
npm run watch:client

# Watch server only
npm run watch:server
```

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### End-to-End Tests

```bash
npm run test:e2e
```

This will:

1. Build the extension
2. Build the E2E test suite
3. Copy test fixtures
4. Launch VS Code and run the tests

## Debugging

### Debug the Extension

1. Open the `md2cv-vs-extension` folder in VS Code
2. Press `F5` or go to Run > Start Debugging
3. A new VS Code window (Extension Development Host) will open with the extension loaded
4. Set breakpoints in your TypeScript source files
5. Test the extension in the new window

### Debug Configuration

The extension uses the `.vscode/launch.json` configuration. The default configuration:

```json
{
  "name": "Run Extension",
  "type": "extensionHost",
  "request": "launch",
  "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
  "outFiles": ["${workspaceFolder}/dist/**/*.js"],
  "preLaunchTask": "npm: watch"
}
```

### Debug Tests

Use the "Extension Tests" configuration in `.vscode/launch.json` to debug tests.

## Code Quality

### Linting

```bash
# Check for linting errors
npm run lint

# Auto-fix linting errors
npm run lint:fix
```

### Formatting

```bash
# Check formatting
npm run format:check

# Auto-format code
npm run format
```

### Type Checking

```bash
npm run typecheck
```

### Run All Checks

```bash
npm run check
```

This runs: typecheck, lint, format:check, and tests.

## Project Structure

```
md2cv-vs-extension/
├── src/
│   ├── client/          # Extension client code
│   │   ├── extension.ts # Main extension entry point
│   │   └── ...
│   ├── server/          # Language server code
│   │   ├── server.ts    # LSP server entry point
│   │   └── ...
│   └── test/            # Test files
│       ├── e2e/         # End-to-end tests
│       └── ...
├── dist/                # Compiled output
├── images/              # Extension icons and images
├── l10n/                # Localization files
├── package.json         # Extension manifest
└── tsconfig.json        # TypeScript configuration
```

## Key Files

- `src/client/extension.ts` - Extension activation and command registration
- `src/client/configManager.ts` - Configuration management with type-safe access
- `src/client/filePatternMatcher.ts` - File pattern matching for CV file detection
- `src/server/server.ts` - Language Server Protocol implementation
- `package.json` - Extension manifest with commands, configurations, and keybindings
- `package.nls.json` - English localization strings
- `package.nls.ja.json` - Japanese localization strings

## Configuration

The extension provides several configuration options in VS Code settings:

### File Pattern Matching

By default, md2cv features (LSP, diagnostics, IntelliSense) are only enabled for files matching these patterns:

- `**/cv*.md`
- `**/resume*.md`
- `**/rirekisho*.md`
- `**/shokumukeirekisho*.md`

You can customize this in `.vscode/settings.json`:

```json
{
  "md2cv.cvFilePatterns": ["**/my-cv*.md", "**/resumes/**/*.md"]
}
```

To enable for all markdown files:

```json
{
  "md2cv.cvFilePatterns": ["**/*.md"]
}
```

To disable completely:

```json
{
  "md2cv.cvFilePatterns": []
}
```

### Other Settings

- `md2cv.defaultFormat` - Default CV format (cv, rirekisho, shokumukeirekisho, both)
- `md2cv.defaultPaperSize` - Default paper size (a3, a4, b4, b5, letter)
- `md2cv.defaultLanguage` - Default CV language (auto, en, ja)
- `md2cv.enableSyncScroll` - Enable synchronized scrolling
- `md2cv.previewUpdateDelay` - Preview update delay in milliseconds

## Publishing

### Package the Extension

```bash
npm run package
```

This creates a `.vsix` file that can be installed manually or published to the marketplace.

### Before Publishing

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Run all checks: `npm run check`
4. Build: `npm run build`
5. Test the packaged extension:
   ```bash
   code --install-extension md2cv-vscode-*.vsix
   ```

## Common Issues

### Extension Not Loading

- Ensure you've run `npm run build` before debugging
- Check the Output panel (View > Output) and select "md2cv" from the dropdown
- Check the Developer Tools console (Help > Toggle Developer Tools)

### Changes Not Reflected

- If using watch mode, ensure it's still running
- Reload the Extension Development Host window (Cmd+R / Ctrl+R)
- Restart the debugging session

### Link Issues

If the local `md2cv` package link isn't working:

```bash
# Unlink and reinstall
npm unlink md2cv
npm install

# Re-link
cd ../md2cv
npm link
cd ../md2cv-vs-extension
npm link md2cv

# Rebuild
npm run build
```

## Git Hooks

The project uses Husky for Git hooks:

- **pre-commit**: Runs lint-staged to format and lint staged files
- **pre-push**: Runs type checking and tests

To skip hooks (not recommended):

```bash
git commit --no-verify
```

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [md2cv Core Package](https://github.com/yuyash/md2cv)
- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
