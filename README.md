# md2cv for Visual Studio Code

[English](README.md) | [日本語](README.ja.md)

Create professional resumes and CVs from Markdown directly in VS Code. Features real-time preview, PDF export, and IntelliSense support.

![md2cv Preview](https://raw.githubusercontent.com/yuyash/md2cv-vs-extension/main/images/preview.png)

## Features

- **Real-time Preview**: See your CV update as you type
- **PDF Export**: Generate print-ready PDFs with one click
- **Multiple Formats**: Western-style CV, Japanese rirekisho (履歴書), and shokumu-keirekisho (職務経歴書)
- **Template Generation**: Quick-start templates for different CV formats
- **IntelliSense**: Auto-completion for CV sections and fields
- **Sync Scroll**: Editor and preview scroll together
- **Photo Support**: Add photos to Japanese-style resumes
- **Localization**: Full support for English and Japanese

## Quick Start

1. Open a Markdown file (`.md`)
2. Run `md2cv: Open Preview` from the Command Palette (`Cmd+Shift+V` / `Ctrl+Shift+V`)
3. Start writing your CV!

### Generate a Template

Run `md2cv: Generate Template` from the Command Palette to create a new CV template.

## Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| `md2cv: Open Preview` | `Cmd+Shift+V` / `Ctrl+Shift+V` | Open CV preview |
| `md2cv: Export PDF` | `Cmd+Alt+E` / `Ctrl+Alt+E` | Export to PDF |
| `md2cv: Change Format` | `Cmd+Alt+F` / `Ctrl+Alt+F` | Switch between CV formats |
| `md2cv: Change Paper Size` | `Cmd+Alt+P` / `Ctrl+Alt+P` | Change paper size |
| `md2cv: Generate Template` | `Cmd+Alt+T` / `Ctrl+Alt+T` | Generate CV template |
| `md2cv: Insert Photo` | - | Insert photo (Japanese formats) |
| `md2cv: Toggle Sync Scroll` | `Cmd+Alt+S` / `Ctrl+Alt+S` | Toggle sync scrolling |
| `md2cv: Switch Language` | `Cmd+Alt+L` / `Ctrl+Alt+L` | Switch CV language |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `md2cv.defaultFormat` | `cv` | Default CV format (`cv`, `rirekisho`, `shokumukeirekisho`, `both`) |
| `md2cv.defaultPaperSize` | `a4` | Default paper size (`a3`, `a4`, `b4`, `b5`, `letter`) |
| `md2cv.previewUpdateDelay` | `300` | Preview update delay in milliseconds |
| `md2cv.enableSyncScroll` | `true` | Enable synchronized scrolling |
| `md2cv.templateLanguage` | `en` | Template language (`en`, `ja`) |
| `md2cv.includeTemplateComments` | `true` | Include explanatory comments in templates |
| `md2cv.defaultLanguage` | `auto` | CV language (`auto`, `en`, `ja`) |

## Supported Formats

### Western-style CV
Standard resume format with sections for summary, experience, education, skills, and more.

### Japanese Rirekisho (履歴書)
Traditional Japanese resume format with photo, personal information, and structured sections.

### Japanese Shokumu-keirekisho (職務経歴書)
Detailed work history document commonly used in Japan.

## Markdown Format

Write your CV using standard Markdown with YAML frontmatter for personal information:

```yaml
---
name: John Doe
email_address: john@example.com
phone_number: +1-234-567-8900
---
```

Use structured code blocks for sections:

````markdown
# Experience

```resume:experience
- company: TechCorp
  roles:
    - title: Senior Engineer
      start: 2020-01
      end: present
      highlights:
        - Led backend development
        - Mentored junior developers
```
````

For detailed Markdown format documentation, see the [md2cv documentation](https://github.com/yuyash/md2cv#markdown-format).

## Requirements

- VS Code 1.85.0 or higher

## Related Projects

- [md2cv](https://github.com/yuyash/md2cv) - CLI tool for generating CVs from Markdown
- [md2cv-examples](https://github.com/yuyash/md2cv-examples) - Example CV templates

## License

[GPL-3.0](LICENSE)
