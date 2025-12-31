// i18n utilities for md2cv VS Code extension
// Uses VS Code's built-in l10n API for runtime messages
// Static strings are defined in package.nls.json files

export const supportedLocales = ['en', 'ja'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export function getCurrentLocale(): SupportedLocale {
  // VS Code's env.language returns the current display language
  // We map it to our supported locales
  const vscodeLocale = typeof process !== 'undefined' ? process.env.VSCODE_NLS_CONFIG : undefined;

  if (vscodeLocale) {
    try {
      const config = JSON.parse(vscodeLocale);
      const locale = config.locale?.toLowerCase() || 'en';
      if (locale.startsWith('ja')) {
        return 'ja';
      }
    } catch {
      // Fallback to English
    }
  }

  return 'en';
}
