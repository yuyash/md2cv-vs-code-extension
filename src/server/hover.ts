/**
 * Hover Provider Module
 * Provides hover information for md2cv markdown files
 * Supports both English and Japanese descriptions
 */

import { Hover, MarkupKind, Position } from 'vscode-languageserver/node';

import {
  CODE_BLOCK_TYPES,
  getCodeBlockTypeDescription,
  getCodeBlockTypeDescriptionJa,
  findSectionByTag,
  getSectionUsageDescription,
  type CodeBlockType,
  type SectionDef,
} from './sectionDefinitions.js';
import { METADATA_FIELDS } from './validator.js';
import type { ParsedDocumentWithPositions, LocatedCodeBlock } from './parser.js';
import {
  findCodeBlockAtPosition,
  findSectionAtPosition,
  isInFrontmatter,
  findFrontmatterFieldAtPosition,
} from './parser.js';
import { getCurrentLocale, type SupportedLocale } from '../i18n/index.js';

/**
 * Field hover information with bilingual support
 */
interface FieldHoverInfo {
  readonly name: string;
  readonly description: string;
  readonly descriptionJa: string;
  readonly example?: string;
  readonly exampleJa?: string;
  readonly required?: boolean;
  readonly envVars?: readonly string[];
}

/**
 * Frontmatter field hover definitions
 */
const FRONTMATTER_FIELD_HOVER: Record<string, FieldHoverInfo> = {
  name: {
    name: 'name',
    description: 'Full name of the person',
    descriptionJa: '氏名（フルネーム）',
    example: 'John Doe',
    exampleJa: '山田 太郎',
    required: true,
    envVars: ['MD2CV_NAME'],
  },
  name_ja: {
    name: 'name_ja',
    description: 'Japanese name in kanji',
    descriptionJa: '氏名（漢字）',
    example: '山田 太郎',
    exampleJa: '山田 太郎',
    envVars: ['MD2CV_NAME_JA'],
  },
  name_furigana: {
    name: 'name_furigana',
    description: 'Name reading in hiragana (furigana)',
    descriptionJa: '氏名のふりがな',
    example: 'やまだ たろう',
    exampleJa: 'やまだ たろう',
    envVars: ['MD2CV_NAME_FURIGANA'],
  },
  email_address: {
    name: 'email_address',
    description: 'Primary email address',
    descriptionJa: 'メールアドレス（主）',
    example: 'john.doe@example.com',
    exampleJa: 'taro.yamada@example.com',
    required: true,
    envVars: ['MD2CV_EMAIL_ADDRESS'],
  },
  email_address2: {
    name: 'email_address2',
    description: 'Secondary email address',
    descriptionJa: 'メールアドレス（副）',
    example: 'john.doe.alt@example.com',
    exampleJa: 'taro.yamada.alt@example.com',
    envVars: ['MD2CV_EMAIL_ADDRESS2'],
  },
  phone_number: {
    name: 'phone_number',
    description: 'Primary phone number',
    descriptionJa: '電話番号（主）',
    example: '+1-555-123-4567',
    exampleJa: '090-1234-5678',
    required: true,
    envVars: ['MD2CV_PHONE_NUMBER'],
  },
  phone_number2: {
    name: 'phone_number2',
    description: 'Secondary phone number',
    descriptionJa: '電話番号（副）',
    example: '+1-555-987-6543',
    exampleJa: '03-1234-5678',
    envVars: ['MD2CV_PHONE_NUMBER2'],
  },
  post_code: {
    name: 'post_code',
    description: 'Primary postal/ZIP code',
    descriptionJa: '郵便番号（主）',
    example: '12345',
    exampleJa: '123-4567',
    envVars: ['MD2CV_POST_CODE'],
  },
  home_address: {
    name: 'home_address',
    description: 'Primary home address',
    descriptionJa: '住所（主）',
    example: '123 Main Street, City, State',
    exampleJa: '東京都渋谷区〇〇1-2-3',
    envVars: ['MD2CV_HOME_ADDRESS'],
  },
  home_address_furigana: {
    name: 'home_address_furigana',
    description: 'Home address reading in hiragana',
    descriptionJa: '住所のふりがな',
    example: 'とうきょうとしぶやく〇〇1-2-3',
    exampleJa: 'とうきょうとしぶやく〇〇1-2-3',
    envVars: ['MD2CV_HOME_ADDRESS_FURIGANA'],
  },
  post_code2: {
    name: 'post_code2',
    description: 'Secondary postal/ZIP code (contact address)',
    descriptionJa: '郵便番号（連絡先）',
    example: '67890',
    exampleJa: '987-6543',
    envVars: ['MD2CV_POST_CODE2'],
  },
  home_address2: {
    name: 'home_address2',
    description: 'Secondary/contact address',
    descriptionJa: '連絡先住所',
    example: '456 Other Street, City, State',
    exampleJa: '大阪府大阪市〇〇4-5-6',
    envVars: ['MD2CV_HOME_ADDRESS2'],
  },
  home_address2_furigana: {
    name: 'home_address2_furigana',
    description: 'Secondary address reading in hiragana',
    descriptionJa: '連絡先住所のふりがな',
    example: 'おおさかふおおさかし〇〇4-5-6',
    exampleJa: 'おおさかふおおさかし〇〇4-5-6',
    envVars: ['MD2CV_HOME_ADDRESS2_FURIGANA'],
  },
  gender: {
    name: 'gender',
    description: 'Gender (male/female/other)',
    descriptionJa: '性別（男/女/その他）',
    example: 'male',
    exampleJa: '男',
    envVars: ['MD2CV_GENDER'],
  },
  dob: {
    name: 'dob',
    description: 'Date of birth in YYYY-MM-DD format',
    descriptionJa: '生年月日（YYYY-MM-DD形式）',
    example: '1990-01-15',
    exampleJa: '1990-01-15',
    envVars: ['MD2CV_DOB'],
  },
  date_of_birth: {
    name: 'date_of_birth',
    description: 'Date of birth in YYYY-MM-DD format (alias for dob)',
    descriptionJa: '生年月日（YYYY-MM-DD形式、dobの別名）',
    example: '1990-01-15',
    exampleJa: '1990-01-15',
    envVars: ['MD2CV_DOB'],
  },
  linkedin: {
    name: 'linkedin',
    description: 'LinkedIn profile URL',
    descriptionJa: 'LinkedInプロフィールURL',
    example: 'https://linkedin.com/in/johndoe',
    exampleJa: 'https://linkedin.com/in/taroyamada',
    envVars: ['MD2CV_LINKEDIN'],
  },
};

/**
 * Code block field hover definitions by block type
 */
interface CodeBlockFieldHover {
  readonly description: string;
  readonly descriptionJa: string;
  readonly example?: string;
  readonly required?: boolean;
}

const CODE_BLOCK_FIELD_HOVER: Record<CodeBlockType, Record<string, CodeBlockFieldHover>> = {
  experience: {
    company: {
      description: 'Company or organization name',
      descriptionJa: '会社名・組織名',
      example: 'Acme Corporation',
      required: true,
    },
    location: {
      description: 'Work location (city, country)',
      descriptionJa: '勤務地（都市、国）',
      example: 'Tokyo, Japan',
    },
    roles: {
      description: 'List of roles/positions held at this company',
      descriptionJa: 'この会社での役職リスト',
      required: true,
    },
    title: {
      description: 'Job title or position name',
      descriptionJa: '役職名・ポジション名',
      example: 'Senior Software Engineer',
      required: true,
    },
    team: {
      description: 'Team or department name',
      descriptionJa: 'チーム名・部署名',
      example: 'Platform Engineering',
    },
    start: {
      description: 'Start date in YYYY-MM format',
      descriptionJa: '開始日（YYYY-MM形式）',
      example: '2020-04',
      required: true,
    },
    end: {
      description: 'End date in YYYY-MM format or "present"',
      descriptionJa: '終了日（YYYY-MM形式）または "present"',
      example: 'present',
      required: true,
    },
    summary: {
      description: 'Brief summary points of the role',
      descriptionJa: '役職の概要（箇条書き）',
    },
    highlights: {
      description: 'Key achievements and accomplishments',
      descriptionJa: '主な実績・成果',
    },
    projects: {
      description: 'List of projects worked on',
      descriptionJa: '担当プロジェクトリスト',
    },
    name: {
      description: 'Project name',
      descriptionJa: 'プロジェクト名',
    },
    bullets: {
      description: 'Project details and contributions',
      descriptionJa: 'プロジェクトの詳細・貢献内容',
    },
  },
  education: {
    school: {
      description: 'School or university name',
      descriptionJa: '学校名・大学名',
      example: 'University of Tokyo',
      required: true,
    },
    degree: {
      description: 'Degree or qualification obtained',
      descriptionJa: '学位・資格',
      example: 'Bachelor of Science in Computer Science',
      required: true,
    },
    location: {
      description: 'School location',
      descriptionJa: '所在地',
      example: 'Tokyo, Japan',
    },
    start: {
      description: 'Start date (enrollment)',
      descriptionJa: '入学日',
      example: '2015-04',
    },
    end: {
      description: 'End date (graduation)',
      descriptionJa: '卒業日',
      example: '2019-03',
    },
    details: {
      description: 'Additional details (honors, activities, etc.)',
      descriptionJa: '詳細（成績、活動など）',
    },
  },
  skills: {
    categories: {
      description: 'Skill categories (for categorized format)',
      descriptionJa: 'スキルカテゴリ（カテゴリ形式用）',
    },
    category: {
      description: 'Category name',
      descriptionJa: 'カテゴリ名',
      example: 'Programming Languages',
    },
    items: {
      description: 'List of skills in this category',
      descriptionJa: 'このカテゴリのスキルリスト',
    },
    columns: {
      description: 'Number of columns for grid layout',
      descriptionJa: 'グリッドレイアウトの列数',
      example: '3',
    },
  },
  certifications: {
    name: {
      description: 'Certification name',
      descriptionJa: '資格名',
      example: 'AWS Solutions Architect',
      required: true,
    },
    issuer: {
      description: 'Issuing organization',
      descriptionJa: '発行機関',
      example: 'Amazon Web Services',
      required: true,
    },
    date: {
      description: 'Date obtained (YYYY-MM format)',
      descriptionJa: '取得日（YYYY-MM形式）',
      example: '2023-06',
    },
    url: {
      description: 'Verification URL',
      descriptionJa: '確認URL',
      example: 'https://www.credly.com/...',
    },
  },
  languages: {
    language: {
      description: 'Language name',
      descriptionJa: '言語名',
      example: 'Japanese',
      required: true,
    },
    level: {
      description: 'Proficiency level',
      descriptionJa: '習熟度',
      example: 'Native / Business Level / Conversational',
      required: true,
    },
  },
  competencies: {
    header: {
      description: 'Competency title/header',
      descriptionJa: '見出し・タイトル',
      example: 'Technical Leadership',
      required: true,
    },
    description: {
      description: 'Detailed description of the competency',
      descriptionJa: '詳細な説明',
      required: true,
    },
  },
};

/**
 * Section hover information
 */
interface SectionHoverInfo {
  readonly description: string;
  readonly descriptionJa: string;
  readonly supportedFormats: string;
  readonly supportedFormatsJa: string;
}

/**
 * Get section hover information from section definition
 */
function getSectionHoverInfo(sectionDef: SectionDef): SectionHoverInfo {
  const usageDesc = getSectionUsageDescription(sectionDef.usage);

  const descriptions: Record<string, { en: string; ja: string }> = {
    summary: {
      en: 'Professional summary or objective statement',
      ja: '職務要約・自己PR',
    },
    experience: {
      en: 'Work experience and employment history',
      ja: '職歴・職務経歴',
    },
    education: {
      en: 'Educational background and qualifications',
      ja: '学歴',
    },
    skills: {
      en: 'Technical and professional skills',
      ja: 'スキル・技術',
    },
    certifications: {
      en: 'Professional certifications and licenses',
      ja: '資格・免許',
    },
    languages: {
      en: 'Language proficiency',
      ja: '語学力',
    },
    competencies: {
      en: 'Core competencies and key strengths',
      ja: '自己PR・強み',
    },
    motivation: {
      en: 'Motivation letter or statement (rirekisho)',
      ja: '志望動機（履歴書用）',
    },
    notes: {
      en: 'Additional notes or special requests (rirekisho)',
      ja: '本人希望記入欄（履歴書用）',
    },
  };

  const desc = descriptions[sectionDef.id] ?? { en: sectionDef.id, ja: sectionDef.id };

  return {
    description: desc.en,
    descriptionJa: desc.ja,
    supportedFormats: usageDesc,
    supportedFormatsJa:
      usageDesc === 'CV only'
        ? 'CVのみ'
        : usageDesc === 'Rirekisho only'
          ? '履歴書のみ'
          : 'CV・履歴書両方',
  };
}

/**
 * Format hover content with bilingual support
 */
function formatHoverContent(
  title: string,
  descriptionEn: string,
  descriptionJa: string,
  additionalInfo?: string,
  locale: SupportedLocale = 'en'
): string {
  const description = locale === 'ja' ? descriptionJa : descriptionEn;
  const altDescription = locale === 'ja' ? descriptionEn : descriptionJa;

  let content = `**${title}**\n\n${description}`;

  if (altDescription !== description) {
    content += `\n\n*${locale === 'ja' ? 'English' : '日本語'}:* ${altDescription}`;
  }

  if (additionalInfo) {
    content += `\n\n${additionalInfo}`;
  }

  return content;
}

/**
 * Get hover information for a frontmatter field
 */
export function getFrontmatterFieldHover(
  fieldKey: string,
  locale: SupportedLocale = 'en'
): Hover | null {
  // Normalize field key (handle alternative keys)
  let normalizedKey = fieldKey;

  // Check METADATA_FIELDS for alternative keys
  for (const [fieldName, fieldDef] of Object.entries(METADATA_FIELDS)) {
    if (fieldDef.frontmatterKeys.includes(fieldKey)) {
      normalizedKey = fieldName;
      break;
    }
  }

  const hoverInfo = FRONTMATTER_FIELD_HOVER[normalizedKey] ?? FRONTMATTER_FIELD_HOVER[fieldKey];
  if (!hoverInfo) return null;

  const example = locale === 'ja' ? hoverInfo.exampleJa : hoverInfo.example;
  let additionalInfo = '';

  if (example) {
    additionalInfo += `**${locale === 'ja' ? '例' : 'Example'}:** \`${example}\``;
  }

  if (hoverInfo.required) {
    additionalInfo += additionalInfo ? '\n\n' : '';
    additionalInfo += locale === 'ja' ? '⚠️ *必須フィールド*' : '⚠️ *Required field*';
  }

  if (hoverInfo.envVars && hoverInfo.envVars.length > 0) {
    additionalInfo += additionalInfo ? '\n\n' : '';
    additionalInfo += `**${locale === 'ja' ? '環境変数' : 'Environment variable'}:** \`${hoverInfo.envVars.join('`, `')}\``;
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: formatHoverContent(
        fieldKey,
        hoverInfo.description,
        hoverInfo.descriptionJa,
        additionalInfo,
        locale
      ),
    },
  };
}

/**
 * Get hover information for a code block type
 */
export function getCodeBlockTypeHover(
  blockType: CodeBlockType,
  locale: SupportedLocale = 'en'
): Hover {
  const descriptionEn = getCodeBlockTypeDescription(blockType);
  const descriptionJa = getCodeBlockTypeDescriptionJa(blockType);

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: formatHoverContent(
        `resume:${blockType}`,
        descriptionEn,
        descriptionJa,
        undefined,
        locale
      ),
    },
  };
}

/**
 * Get hover information for a field within a code block
 */
export function getCodeBlockFieldHover(
  blockType: CodeBlockType,
  fieldName: string,
  locale: SupportedLocale = 'en'
): Hover | null {
  const blockFields = CODE_BLOCK_FIELD_HOVER[blockType];
  if (!blockFields) return null;

  const fieldInfo = blockFields[fieldName];
  if (!fieldInfo) return null;

  let additionalInfo = '';

  if (fieldInfo.example) {
    additionalInfo += `**${locale === 'ja' ? '例' : 'Example'}:** \`${fieldInfo.example}\``;
  }

  if (fieldInfo.required) {
    additionalInfo += additionalInfo ? '\n\n' : '';
    additionalInfo += locale === 'ja' ? '⚠️ *必須フィールド*' : '⚠️ *Required field*';
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: formatHoverContent(
        fieldName,
        fieldInfo.description,
        fieldInfo.descriptionJa,
        additionalInfo,
        locale
      ),
    },
  };
}

/**
 * Get hover information for a section header
 */
export function getSectionHover(
  sectionDef: SectionDef,
  sectionTitle: string,
  locale: SupportedLocale = 'en'
): Hover {
  const hoverInfo = getSectionHoverInfo(sectionDef);

  const formatLabel = locale === 'ja' ? 'サポート形式' : 'Supported formats';
  const formats = locale === 'ja' ? hoverInfo.supportedFormatsJa : hoverInfo.supportedFormats;
  const additionalInfo = `**${formatLabel}:** ${formats}\n\n**Section ID:** \`${sectionDef.id}\``;

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: formatHoverContent(
        sectionTitle,
        hoverInfo.description,
        hoverInfo.descriptionJa,
        additionalInfo,
        locale
      ),
    },
  };
}

/**
 * Get hover information for frontmatter block
 */
export function getFrontmatterBlockHover(locale: SupportedLocale = 'en'): Hover {
  const descriptionEn =
    'Document metadata including personal information, contact details, and configuration.';
  const descriptionJa = 'ドキュメントのメタデータ（個人情報、連絡先、設定など）';

  const additionalInfo =
    locale === 'ja'
      ? '必須フィールド: `name`, `email_address`, `phone_number`'
      : 'Required fields: `name`, `email_address`, `phone_number`';

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: formatHoverContent(
        'Frontmatter',
        descriptionEn,
        descriptionJa,
        additionalInfo,
        locale
      ),
    },
  };
}

/**
 * Extract field name from a line of YAML content
 */
function extractFieldNameFromLine(line: string): string | null {
  // Match YAML key pattern: optional whitespace, optional dash, key followed by colon
  const match = line.match(/^\s*-?\s*(\w+)\s*:/);
  return match ? match[1] : null;
}

/**
 * Find the field at a specific position within a code block
 */
function findFieldAtPositionInCodeBlock(
  codeBlock: LocatedCodeBlock,
  position: Position,
  documentText: string
): string | null {
  const lines = documentText.split('\n');
  const line = lines[position.line];
  if (!line) return null;

  // Check if we're on a line with a field
  const fieldName = extractFieldNameFromLine(line);
  if (!fieldName) return null;

  // Check if the cursor is on or near the field name
  const fieldMatch = line.match(/^\s*-?\s*(\w+)\s*:/);
  if (fieldMatch) {
    const fieldStart = line.indexOf(fieldMatch[1]);
    const fieldEnd = fieldStart + fieldMatch[1].length;

    // If cursor is within the field name area
    if (position.character >= fieldStart && position.character <= fieldEnd + 1) {
      return fieldName;
    }
  }

  return null;
}

/**
 * Main hover handler
 * Returns hover information based on the position in the document
 */
export function getHoverInfo(
  document: ParsedDocumentWithPositions,
  position: Position,
  documentText: string
): Hover | null {
  const locale = getCurrentLocale();

  // Check if we're in a code block
  const codeBlock = findCodeBlockAtPosition(document, position);
  if (codeBlock) {
    // Check if we're on the code fence line (```resume:xxx)
    if (position.line === codeBlock.range.start.line) {
      const blockType = codeBlock.type as CodeBlockType;
      if (CODE_BLOCK_TYPES.includes(blockType)) {
        return getCodeBlockTypeHover(blockType, locale);
      }
    }

    // Check if we're on a field within the code block
    const fieldName = findFieldAtPositionInCodeBlock(codeBlock, position, documentText);
    if (fieldName) {
      const blockType = codeBlock.type as CodeBlockType;
      const fieldHover = getCodeBlockFieldHover(blockType, fieldName, locale);
      if (fieldHover) return fieldHover;
    }

    // Default: show code block type info
    const blockType = codeBlock.type as CodeBlockType;
    if (CODE_BLOCK_TYPES.includes(blockType)) {
      return getCodeBlockTypeHover(blockType, locale);
    }
  }

  // Check if we're in frontmatter
  if (isInFrontmatter(document, position)) {
    // Check if we're on a specific field
    const field = findFrontmatterFieldAtPosition(document, position);
    if (field) {
      const fieldHover = getFrontmatterFieldHover(field.key, locale);
      if (fieldHover) return fieldHover;
    }

    // Default: show frontmatter block info
    return getFrontmatterBlockHover(locale);
  }

  // Check if we're in a section header
  const section = findSectionAtPosition(document, position);
  if (section) {
    // Check if we're on the title line
    if (position.line === section.titleRange.start.line) {
      const sectionDef = findSectionByTag(section.title);
      if (sectionDef) {
        return getSectionHover(sectionDef, section.title, locale);
      }
    }
  }

  return null;
}
