/**
 * Completion Provider Module
 * Provides IntelliSense completion items for md2cv markdown files
 */

import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  Position,
} from 'vscode-languageserver/node';

import {
  CODE_BLOCK_TYPES,
  getCodeBlockTypeDescription,
  getCodeBlockTypeDescriptionJa,
  SECTION_DEFINITIONS,
  getSectionUsageDescription,
  type CodeBlockType,
} from './sectionDefinitions.js';
import { METADATA_FIELDS, getTagsForLanguage, type CvLanguage } from './validator.js';
import type { ParsedDocumentWithPositions, LocatedCodeBlock, LocatedSection } from './parser.js';
import {
  findCodeBlockAtPosition,
  findContainingSectionAtPosition,
  isInFrontmatter,
} from './parser.js';

/**
 * Completion context information
 */
export interface CompletionContext {
  readonly position: Position;
  readonly document: ParsedDocumentWithPositions;
  readonly lineText: string;
  readonly linePrefix: string;
  readonly isInCodeBlock: boolean;
  readonly codeBlock: LocatedCodeBlock | null;
  readonly isInFrontmatter: boolean;
  readonly yamlPath: string[];
  readonly indentLevel: number;
  readonly language: CvLanguage;
  readonly currentSection: LocatedSection | null;
}

/**
 * Build completion context from document and position
 */
export function buildCompletionContext(
  document: ParsedDocumentWithPositions,
  position: Position,
  documentText: string,
  language: CvLanguage = 'en'
): CompletionContext {
  const lines = documentText.split('\n');
  const lineText = lines[position.line] ?? '';
  const linePrefix = lineText.substring(0, position.character);

  const codeBlock = findCodeBlockAtPosition(document, position);
  const inFrontmatter = isInFrontmatter(document, position);
  const currentSection = findContainingSectionAtPosition(document, position);

  // Calculate indent level (number of spaces / 2)
  const leadingSpaces = lineText.match(/^(\s*)/)?.[1]?.length ?? 0;
  const indentLevel = Math.floor(leadingSpaces / 2);

  // Calculate YAML path based on position within code block
  const yamlPath = codeBlock ? calculateYamlPath(codeBlock, position, documentText) : [];

  return {
    position,
    document,
    lineText,
    linePrefix,
    isInCodeBlock: codeBlock !== null,
    codeBlock,
    isInFrontmatter: inFrontmatter,
    yamlPath,
    indentLevel,
    language,
    currentSection,
  };
}

/**
 * Calculate the YAML path at the current position within a code block
 */
function calculateYamlPath(
  codeBlock: LocatedCodeBlock,
  position: Position,
  documentText: string
): string[] {
  const lines = documentText.split('\n');

  // Start from the code block content start (after the opening ```)
  const contentStartLine = codeBlock.range.start.line + 1;
  const contentEndLine = Math.min(position.line, codeBlock.range.end.line - 1);

  // Track indent levels and their corresponding keys
  const indentStack: Array<{ indent: number; key: string }> = [];

  for (let lineNum = contentStartLine; lineNum <= contentEndLine; lineNum++) {
    const line = lines[lineNum];
    if (!line || line.trim() === '' || line.trim().startsWith('#')) continue;

    // Calculate indent
    const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length ?? 0;

    // Check if this is a key line (contains ':')
    const keyMatch = line.match(/^(\s*)(-\s*)?(\w+):/);
    if (keyMatch) {
      const indent = leadingSpaces;
      const key = keyMatch[3];

      // Pop items from stack that have >= indent
      while (indentStack.length > 0 && indentStack[indentStack.length - 1].indent >= indent) {
        indentStack.pop();
      }

      // Push current key
      indentStack.push({ indent, key });
    }

    // Check for array item without key (just '- ')
    const arrayMatch = line.match(/^(\s*)-\s*$/);
    if (arrayMatch) {
      const indent = leadingSpaces;
      // Pop items from stack that have >= indent
      while (indentStack.length > 0 && indentStack[indentStack.length - 1].indent >= indent) {
        indentStack.pop();
      }
    }
  }

  return indentStack.map((item) => item.key);
}

/**
 * Get completion items for code block types (resume:xxx)
 * Triggered when user types "resume:" or is at the start of a code fence
 * If sectionId is provided, only returns the matching code block type
 */
export function getCodeBlockTypeCompletions(sectionId?: string): CompletionItem[] {
  // Filter to only the matching code block type if we're in a section
  const types =
    sectionId && CODE_BLOCK_TYPES.includes(sectionId as CodeBlockType)
      ? [sectionId as CodeBlockType]
      : CODE_BLOCK_TYPES;

  return types.map((type) => {
    const description = getCodeBlockTypeDescription(type);
    const descriptionJa = getCodeBlockTypeDescriptionJa(type);

    return {
      label: type,
      kind: CompletionItemKind.Enum,
      detail: description,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `**${type}**\n\n${description}\n\n日本語: ${descriptionJa}`,
      },
      insertText: type,
      sortText: `0_${type}`, // Ensure these appear first
    };
  });
}

/**
 * Get completion items for code block with full snippet
 * Triggered when user types "```resume:" or similar
 * If sectionId is provided, only returns the matching code block snippet
 */
export function getCodeBlockSnippetCompletions(sectionId?: string): CompletionItem[] {
  // Filter to only the matching code block type if we're in a section
  const types =
    sectionId && CODE_BLOCK_TYPES.includes(sectionId as CodeBlockType)
      ? [sectionId as CodeBlockType]
      : CODE_BLOCK_TYPES;

  return types.map((type) => {
    const description = getCodeBlockTypeDescription(type);
    const snippet = getCodeBlockSnippet(type);

    return {
      label: `resume:${type}`,
      kind: CompletionItemKind.Snippet,
      detail: description,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `**resume:${type}**\n\n${description}\n\nInserts a complete ${type} code block template.`,
      },
      insertText: snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: `0_${type}`,
    };
  });
}

/**
 * Get snippet template for a code block type
 */
function getCodeBlockSnippet(type: CodeBlockType): string {
  const snippets: Record<CodeBlockType, string> = {
    experience: `resume:experience
- company: \${1:Company Name}
  location: \${2:Location}
  roles:
    - title: \${3:Job Title}
      start: \${4:YYYY-MM}
      end: \${5:present}
      summary:
        - \${6:Summary point}
      highlights:
        - \${7:Key achievement}
\`\`\`
`,
    education: `resume:education
- school: \${1:School Name}
  degree: \${2:Degree}
  location: \${3:Location}
  start: \${4:YYYY-MM}
  end: \${5:YYYY-MM}
  details:
    - \${6:Additional details}
\`\`\`
`,
    skills: `resume:skills
categories:
  - category: \${1:Category Name}
    items:
      - \${2:Skill 1}
      - \${3:Skill 2}
\`\`\`
`,
    certifications: `resume:certifications
- name: \${1:Certification Name}
  issuer: \${2:Issuing Organization}
  date: \${3:YYYY-MM}
  url: \${4:https://}
\`\`\`
`,
    languages: `resume:languages
- language: \${1:Language}
  level: \${2:Proficiency Level}
\`\`\`
`,
    competencies: `resume:competencies
- header: \${1:Competency Title}
  description: \${2:Description of your competency}
\`\`\`
`,
  };

  return snippets[type];
}

/**
 * Field definition for completion
 */
interface FieldCompletionDef {
  readonly label: string;
  readonly detail: string;
  readonly detailJa: string;
  readonly kind: CompletionItemKind;
  readonly insertText?: string;
  readonly insertTextFormat?: InsertTextFormat;
  readonly required?: boolean;
  readonly parentPath?: string[];
}

/**
 * Field definitions by code block type
 */
const CODE_BLOCK_FIELDS: Record<CodeBlockType, FieldCompletionDef[]> = {
  experience: [
    {
      label: 'company',
      detail: 'Company name',
      detailJa: '会社名',
      kind: CompletionItemKind.Property,
      required: true,
    },
    {
      label: 'location',
      detail: 'Location',
      detailJa: '勤務地',
      kind: CompletionItemKind.Property,
    },
    {
      label: 'roles',
      detail: 'List of roles at this company',
      detailJa: '役職リスト',
      kind: CompletionItemKind.Property,
      required: true,
    },
    {
      label: 'title',
      detail: 'Job title',
      detailJa: '役職名',
      kind: CompletionItemKind.Property,
      required: true,
      parentPath: ['roles'],
    },
    {
      label: 'team',
      detail: 'Team name',
      detailJa: 'チーム名',
      kind: CompletionItemKind.Property,
      parentPath: ['roles'],
    },
    {
      label: 'start',
      detail: 'Start date (YYYY-MM)',
      detailJa: '開始日 (YYYY-MM)',
      kind: CompletionItemKind.Property,
      required: true,
      parentPath: ['roles'],
    },
    {
      label: 'end',
      detail: 'End date (YYYY-MM or "present")',
      detailJa: '終了日 (YYYY-MM または "present")',
      kind: CompletionItemKind.Property,
      required: true,
      parentPath: ['roles'],
    },
    {
      label: 'summary',
      detail: 'Role summary points',
      detailJa: '役職の概要',
      kind: CompletionItemKind.Property,
      parentPath: ['roles'],
    },
    {
      label: 'highlights',
      detail: 'Key achievements',
      detailJa: '主な実績',
      kind: CompletionItemKind.Property,
      parentPath: ['roles'],
    },
    {
      label: 'projects',
      detail: 'Project list',
      detailJa: 'プロジェクトリスト',
      kind: CompletionItemKind.Property,
      parentPath: ['roles'],
    },
    {
      label: 'name',
      detail: 'Project name',
      detailJa: 'プロジェクト名',
      kind: CompletionItemKind.Property,
      parentPath: ['roles', 'projects'],
    },
    {
      label: 'bullets',
      detail: 'Project details',
      detailJa: 'プロジェクト詳細',
      kind: CompletionItemKind.Property,
      parentPath: ['roles', 'projects'],
    },
  ],
  education: [
    {
      label: 'school',
      detail: 'School/University name',
      detailJa: '学校名',
      kind: CompletionItemKind.Property,
      required: true,
    },
    {
      label: 'degree',
      detail: 'Degree obtained',
      detailJa: '学位',
      kind: CompletionItemKind.Property,
      required: true,
    },
    {
      label: 'location',
      detail: 'Location',
      detailJa: '所在地',
      kind: CompletionItemKind.Property,
    },
    { label: 'start', detail: 'Start date', detailJa: '入学日', kind: CompletionItemKind.Property },
    { label: 'end', detail: 'End date', detailJa: '卒業日', kind: CompletionItemKind.Property },
    {
      label: 'details',
      detail: 'Additional details',
      detailJa: '詳細',
      kind: CompletionItemKind.Property,
    },
  ],
  skills: [
    {
      label: 'categories',
      detail: 'Skill categories (categorized format)',
      detailJa: 'スキルカテゴリ',
      kind: CompletionItemKind.Property,
    },
    {
      label: 'category',
      detail: 'Category name',
      detailJa: 'カテゴリ名',
      kind: CompletionItemKind.Property,
      parentPath: ['categories'],
    },
    {
      label: 'items',
      detail: 'Skill items in this category',
      detailJa: 'スキル項目',
      kind: CompletionItemKind.Property,
      parentPath: ['categories'],
    },
    {
      label: 'columns',
      detail: 'Number of columns (grid format)',
      detailJa: '列数',
      kind: CompletionItemKind.Property,
    },
  ],
  certifications: [
    {
      label: 'name',
      detail: 'Certification name',
      detailJa: '資格名',
      kind: CompletionItemKind.Property,
      required: true,
    },
    {
      label: 'issuer',
      detail: 'Issuing organization',
      detailJa: '発行機関',
      kind: CompletionItemKind.Property,
      required: true,
    },
    {
      label: 'date',
      detail: 'Date obtained',
      detailJa: '取得日',
      kind: CompletionItemKind.Property,
    },
    {
      label: 'url',
      detail: 'Verification URL',
      detailJa: '確認URL',
      kind: CompletionItemKind.Property,
    },
  ],
  languages: [
    {
      label: 'language',
      detail: 'Language name',
      detailJa: '言語名',
      kind: CompletionItemKind.Property,
      required: true,
    },
    {
      label: 'level',
      detail: 'Proficiency level',
      detailJa: '習熟度',
      kind: CompletionItemKind.Property,
      required: true,
    },
  ],
  competencies: [
    {
      label: 'header',
      detail: 'Competency header/title',
      detailJa: '見出し',
      kind: CompletionItemKind.Property,
      required: true,
    },
    {
      label: 'description',
      detail: 'Competency description',
      detailJa: '説明',
      kind: CompletionItemKind.Property,
      required: true,
    },
  ],
};

/**
 * Get field completions for a specific code block type
 * Filters based on current YAML path
 */
export function getCodeBlockFieldCompletions(
  blockType: string,
  yamlPath: string[] = []
): CompletionItem[] {
  const fields = CODE_BLOCK_FIELDS[blockType as CodeBlockType];
  if (!fields) return [];

  // Filter fields based on YAML path
  const filteredFields = fields.filter((field) => {
    if (!field.parentPath || field.parentPath.length === 0) {
      // Top-level field - show when at root or in array item at root
      return yamlPath.length === 0 || (yamlPath.length === 1 && yamlPath[0] === blockType);
    }

    // Check if current path matches or is within the parent path
    const parentPathStr = field.parentPath.join('/');
    const currentPathStr = yamlPath.join('/');

    // Show field if we're at or within its parent path
    return (
      currentPathStr.endsWith(parentPathStr) || yamlPath.some((p) => field.parentPath?.includes(p))
    );
  });

  return filteredFields.map((field) => {
    const requiredMark = field.required ? ' (required)' : '';

    return {
      label: field.label,
      kind: field.kind,
      detail: `${field.detail}${requiredMark}`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `**${field.label}**\n\n${field.detail}\n\n日本語: ${field.detailJa}${field.required ? '\n\n*Required field*' : ''}`,
      },
      insertText: field.insertText ?? `${field.label}: `,
      insertTextFormat: field.insertTextFormat ?? InsertTextFormat.PlainText,
      sortText: field.required ? `0_${field.label}` : `1_${field.label}`,
    };
  });
}

/**
 * Get frontmatter field completions
 */
export function getFrontmatterCompletions(): CompletionItem[] {
  const completions: CompletionItem[] = [];

  for (const [fieldName, fieldDef] of Object.entries(METADATA_FIELDS)) {
    const primaryKey = fieldDef.frontmatterKeys[0];
    const requiredMark = fieldDef.required ? ' (required)' : '';
    const envVars = fieldDef.envVars.join(', ');

    completions.push({
      label: primaryKey,
      kind: CompletionItemKind.Property,
      detail: `${getFieldDescription(fieldName)}${requiredMark}`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `**${primaryKey}**\n\n${getFieldDescription(fieldName)}\n\nEnvironment variables: \`${envVars}\`${fieldDef.required ? '\n\n*Required field*' : ''}`,
      },
      insertText: `${primaryKey}: `,
      sortText: fieldDef.required ? `0_${primaryKey}` : `1_${primaryKey}`,
    });

    // Add alternative keys if they exist
    for (let i = 1; i < fieldDef.frontmatterKeys.length; i++) {
      const altKey = fieldDef.frontmatterKeys[i];
      completions.push({
        label: altKey,
        kind: CompletionItemKind.Property,
        detail: `Alternative for ${primaryKey}${requiredMark}`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `**${altKey}**\n\nAlternative key for \`${primaryKey}\`\n\n${getFieldDescription(fieldName)}`,
        },
        insertText: `${altKey}: `,
        sortText: `2_${altKey}`,
      });
    }
  }

  return completions;
}

/**
 * Get human-readable description for a metadata field
 */
function getFieldDescription(fieldName: string): string {
  const descriptions: Record<string, string> = {
    name: 'Full name',
    name_ja: 'Japanese name (漢字)',
    name_furigana: 'Name in furigana (ふりがな)',
    email_address: 'Primary email address',
    email_address2: 'Secondary email address',
    phone_number: 'Primary phone number',
    phone_number2: 'Secondary phone number',
    post_code: 'Primary postal code',
    home_address: 'Primary home address',
    home_address_furigana: 'Home address in furigana',
    post_code2: 'Secondary postal code',
    home_address2: 'Secondary home address',
    home_address2_furigana: 'Secondary address in furigana',
    gender: 'Gender (male/female/other)',
    dob: 'Date of birth (YYYY-MM-DD)',
    linkedin: 'LinkedIn profile URL',
  };

  return descriptions[fieldName] ?? fieldName;
}

/**
 * Get snippet completions with md2cv- prefix
 * These can be triggered anywhere in the document by typing "md2cv-"
 */
export function getSnippetPrefixCompletions(): CompletionItem[] {
  return CODE_BLOCK_TYPES.map((type) => {
    const description = getCodeBlockTypeDescription(type);
    const descriptionJa = getCodeBlockTypeDescriptionJa(type);
    const snippet = getCodeBlockSnippet(type);

    return {
      label: `md2cv-${type}`,
      kind: CompletionItemKind.Snippet,
      detail: `Insert ${type} code block`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `**md2cv-${type}**\n\n${description}\n\n日本語: ${descriptionJa}\n\nInserts a complete \`resume:${type}\` code block template.`,
      },
      insertText: '```' + snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: `0_md2cv_${type}`,
    };
  });
}

/**
 * Get section heading completions filtered by language
 * Excludes sections that already exist in the document
 * Triggered when user types "# " at the start of a line
 */
export function getSectionHeadingCompletions(
  language: CvLanguage,
  existingSectionIds: Set<string> = new Set()
): CompletionItem[] {
  const completions: CompletionItem[] = [];

  for (const def of SECTION_DEFINITIONS) {
    // Skip sections that already exist in the document
    if (existingSectionIds.has(def.id)) continue;

    // Get tags for the specified language
    const tags = getTagsForLanguage(def.id, language);

    // If no tags for this language, skip this section
    if (tags.length === 0) continue;

    // Use the first tag as the primary suggestion
    const primaryTag = tags[0];
    const usageDesc = getSectionUsageDescription(def.usage);
    const isRequired = def.requiredFor.length > 0;
    const requiredMark = isRequired ? ' (required)' : '';

    completions.push({
      label: primaryTag,
      kind: CompletionItemKind.Text,
      detail: `${def.id} section${requiredMark}`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `**${primaryTag}**\n\nSection: ${def.id}\nUsage: ${usageDesc}\n\nAlternative names: ${tags.join(', ')}`,
      },
      insertText: primaryTag,
      sortText: isRequired ? `0_${def.id}` : `1_${def.id}`,
    });

    // Add alternative tags as separate completions
    for (let i = 1; i < tags.length; i++) {
      const altTag = tags[i];
      completions.push({
        label: altTag,
        kind: CompletionItemKind.Text,
        detail: `${def.id} section (alternative)`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `**${altTag}**\n\nAlternative name for ${def.id} section\nUsage: ${usageDesc}`,
        },
        insertText: altTag,
        sortText: `2_${def.id}_${i}`,
      });
    }
  }

  return completions;
}

/**
 * Main completion handler
 * Returns appropriate completions based on context
 */
export function getCompletions(context: CompletionContext): CompletionItem[] {
  const {
    linePrefix,
    isInCodeBlock,
    codeBlock,
    isInFrontmatter,
    yamlPath,
    language,
    document,
    currentSection,
  } = context;

  // Check if we're typing a section heading (# )
  if (linePrefix.match(/^#\s+\S*$/)) {
    // Get existing section IDs from the document
    const existingSectionIds = new Set(document.sections.map((s) => s.id));
    return getSectionHeadingCompletions(language, existingSectionIds);
  }

  // Get current section ID for filtering code block completions
  const sectionId = currentSection?.id;

  // Check if we're typing a code fence language
  if (linePrefix.match(/^```\s*resume:?$/)) {
    return getCodeBlockTypeCompletions(sectionId);
  }

  // Check if we're at the start of a line that could be a code fence
  if (linePrefix.match(/^```$/)) {
    return getCodeBlockSnippetCompletions(sectionId);
  }

  // Inside a code block - provide field completions
  if (isInCodeBlock && codeBlock) {
    return getCodeBlockFieldCompletions(codeBlock.type, yamlPath);
  }

  // Inside frontmatter - provide frontmatter field completions
  if (isInFrontmatter) {
    return getFrontmatterCompletions();
  }

  // Check if user is typing a snippet prefix (md2cv-)
  if (linePrefix.match(/md2cv-?$/i)) {
    return getSnippetPrefixCompletions();
  }

  // Default: no completions (avoid showing code block snippets everywhere)
  return [];
}

/**
 * Resolve additional details for a completion item
 */
export function resolveCompletionItem(item: CompletionItem): CompletionItem {
  // Add any additional resolution logic here if needed
  return item;
}
