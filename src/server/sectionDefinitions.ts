/**
 * Section Definitions Module
 * Provides section ID resolution and tag matching using md2cv's section definitions
 */

// Import from md2cv subpath exports to avoid CLI dependencies
import {
  SECTION_DEFINITIONS,
  findSectionByTag,
  getRequiredSectionsForFormat,
  getValidTagsForFormat,
  isSectionValidForFormat,
  type SectionDef,
  type SectionUsage,
} from 'md2cv/types/sections';
import type { OutputFormat } from 'md2cv/types/config';

/**
 * Re-export types and functions from md2cv
 */
export {
  SECTION_DEFINITIONS,
  findSectionByTag,
  getRequiredSectionsForFormat,
  getValidTagsForFormat,
  isSectionValidForFormat,
  type SectionDef,
  type SectionUsage,
  type OutputFormat,
};

/**
 * Get section definition by ID
 */
export function getSectionById(id: string): SectionDef | undefined {
  return SECTION_DEFINITIONS.find((def) => def.id === id);
}

/**
 * Get all section IDs
 */
export function getAllSectionIds(): string[] {
  return SECTION_DEFINITIONS.map((def) => def.id);
}

/**
 * Get all valid section tags (all languages)
 */
export function getAllSectionTags(): string[] {
  const tags: string[] = [];
  for (const def of SECTION_DEFINITIONS) {
    tags.push(...def.tags);
  }
  return tags;
}

/**
 * Get section tags for a specific section ID
 */
export function getTagsForSection(sectionId: string): readonly string[] {
  const def = getSectionById(sectionId);
  return def?.tags ?? [];
}

/**
 * Check if a tag is a valid section tag
 */
export function isValidSectionTag(tag: string): boolean {
  return findSectionByTag(tag) !== undefined;
}

/**
 * Get the primary (first) tag for a section ID
 * Useful for display purposes
 */
export function getPrimaryTagForSection(
  sectionId: string,
  preferJapanese: boolean = false
): string | undefined {
  const def = getSectionById(sectionId);
  if (!def) return undefined;

  if (preferJapanese) {
    // Find first Japanese tag (contains Japanese characters)
    const japaneseTag = def.tags.find((tag) =>
      /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(tag)
    );
    if (japaneseTag) return japaneseTag;
  }

  // Return first English tag (no Japanese characters)
  const englishTag = def.tags.find((tag) => !/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(tag));
  return englishTag ?? def.tags[0];
}

/**
 * Get section usage description
 */
export function getSectionUsageDescription(usage: SectionUsage): string {
  switch (usage) {
    case 'cv':
      return 'CV only';
    case 'rirekisho':
      return 'Rirekisho only';
    case 'both':
      return 'CV and Rirekisho';
  }
}

/**
 * Code block types supported by md2cv
 */
export const CODE_BLOCK_TYPES = [
  'experience',
  'education',
  'skills',
  'certifications',
  'languages',
  'competencies',
] as const;

export type CodeBlockType = (typeof CODE_BLOCK_TYPES)[number];

/**
 * Check if a string is a valid code block type
 */
export function isValidCodeBlockType(type: string): type is CodeBlockType {
  return CODE_BLOCK_TYPES.includes(type as CodeBlockType);
}

/**
 * Get description for a code block type
 */
export function getCodeBlockTypeDescription(type: CodeBlockType): string {
  const descriptions: Record<CodeBlockType, string> = {
    experience: 'Work experience and employment history',
    education: 'Educational background and qualifications',
    skills: 'Technical and professional skills',
    certifications: 'Professional certifications and licenses',
    languages: 'Language proficiency',
    competencies: 'Core competencies and key highlights',
  };
  return descriptions[type];
}

/**
 * Get Japanese description for a code block type
 */
export function getCodeBlockTypeDescriptionJa(type: CodeBlockType): string {
  const descriptions: Record<CodeBlockType, string> = {
    experience: '職歴・職務経歴',
    education: '学歴',
    skills: 'スキル・技術',
    certifications: '資格・免許',
    languages: '語学力',
    competencies: '自己PR・強み',
  };
  return descriptions[type];
}
