/**
 * Template Generator Property-Based Tests
 *
 * Feature: md2cv-vscode-extension, Property 7: テンプレート生成の完全性
 * Validates: Requirements 5.2
 *
 * For any language (en/ja) and format (cv/rirekisho/both) combination,
 * the generated template:
 * - Is valid md2cv format markdown
 * - Contains all required sections for the selected format
 * - Uses the selected language's comments/labels
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateTemplate, getTemplateDefinition, filterSectionsForFormat } from 'md2cv/template';
import { parseMarkdown } from 'md2cv';
import type { TemplateLanguage, TemplateOptions, OutputFormat } from 'md2cv/types';

/**
 * Arbitrary for template language
 */
const languageArb = fc.constantFrom<TemplateLanguage>('en', 'ja');

/**
 * Arbitrary for output format
 */
const formatArb = fc.constantFrom<OutputFormat>('cv', 'rirekisho', 'both');

/**
 * Arbitrary for include comments option
 */
const includeCommentsArb = fc.boolean();

/**
 * Arbitrary for complete template options
 */
const templateOptionsArb = fc.record({
  language: languageArb,
  format: formatArb,
  includeComments: includeCommentsArb,
  outputPath: fc.constant(undefined),
}) as fc.Arbitrary<TemplateOptions>;

describe('Template Generator Property Tests', () => {
  /**
   * Property 7: テンプレート生成の完全性
   *
   * For any language (en/ja) and format (cv/rirekisho/both) combination,
   * the generated template is valid md2cv format markdown.
   */
  it('Property 7: Generated templates are valid md2cv format markdown', () => {
    fc.assert(
      fc.property(templateOptionsArb, (options) => {
        // Generate template
        const template = generateTemplate(options);

        // Template should not be empty
        expect(template.length).toBeGreaterThan(0);

        // Template should contain frontmatter delimiters
        expect(template).toContain('---');

        // Parse the template to verify it's valid md2cv format
        const parseResult = parseMarkdown(template);

        // The template should parse successfully
        expect(parseResult.ok).toBe(true);

        if (parseResult.ok) {
          // Should have metadata (frontmatter)
          expect(parseResult.value.metadata).toBeDefined();

          // Should have required metadata fields
          expect(parseResult.value.metadata.name).toBeDefined();
          expect(parseResult.value.metadata.email_address).toBeDefined();
          expect(parseResult.value.metadata.phone_number).toBeDefined();
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: テンプレート生成の完全性
   *
   * For any language and format combination, the generated template
   * contains all required sections for the selected format.
   */
  it('Property 7: Generated templates contain all required sections for the format', () => {
    fc.assert(
      fc.property(templateOptionsArb, (options) => {
        // Generate template
        const template = generateTemplate(options);

        // Get the template definition for the language
        const definition = getTemplateDefinition(options.language);

        // Get expected sections for the format
        const expectedSections = filterSectionsForFormat(definition.sections, options.format);

        // Each expected section should have its title in the template
        for (const section of expectedSections) {
          expect(template).toContain(`# ${section.title}`);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: テンプレート生成の完全性
   *
   * For any language and format combination, the generated template
   * uses the selected language's comments/labels when comments are enabled.
   */
  it('Property 7: Generated templates use correct language for comments', () => {
    fc.assert(
      fc.property(
        fc.record({
          language: languageArb,
          format: formatArb,
          includeComments: fc.constant(true), // Always include comments for this test
          outputPath: fc.constant(undefined),
        }) as fc.Arbitrary<TemplateOptions>,
        (options) => {
          // Generate template with comments
          const template = generateTemplate(options);

          if (options.language === 'ja') {
            // Japanese template should contain Japanese text
            expect(template).toContain('md2cv テンプレート');
            expect(template).toContain('フォーマット:');
          } else {
            // English template should contain English text
            expect(template).toContain('md2cv Template');
            expect(template).toContain('Format:');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: テンプレート生成の完全性
   *
   * When comments are disabled, the template should not contain
   * the header comment block.
   */
  it('Property 7: Generated templates without comments do not contain header comment', () => {
    fc.assert(
      fc.property(
        fc.record({
          language: languageArb,
          format: formatArb,
          includeComments: fc.constant(false), // No comments
          outputPath: fc.constant(undefined),
        }) as fc.Arbitrary<TemplateOptions>,
        (options) => {
          // Generate template without comments
          const template = generateTemplate(options);

          // Should not contain the header comment
          expect(template).not.toContain('md2cv Template');
          expect(template).not.toContain('md2cv テンプレート');

          // But should still contain the frontmatter and sections
          expect(template).toContain('---');
          expect(template).toContain('name:');
        }
      ),
      { numRuns: 100 }
    );
  });
});
