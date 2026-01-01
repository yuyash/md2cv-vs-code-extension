# md2cv for Visual Studio Code

[English](README.md) | [日本語](README.ja.md)

Markdown から履歴書・職務経歴書を作成する VS Code 拡張機能です。リアルタイムプレビュー、PDF エクスポート、IntelliSense をサポートしています。

![md2cv Preview](https://raw.githubusercontent.com/yuyash/md2cv-vs-extension/main/images/preview.png)

## 機能

- **リアルタイムプレビュー**: 入力と同時に CV が更新されます
- **PDF エクスポート**: ワンクリックで印刷可能な PDF を生成
- **複数フォーマット対応**: 英文 CV、履歴書、職務経歴書
- **テンプレート生成**: 各フォーマット用のテンプレートをすぐに作成
- **IntelliSense**: CV セクションとフィールドの自動補完
- **同期スクロール**: エディタとプレビューが連動してスクロール
- **写真対応**: 履歴書への証明写真の挿入
- **多言語対応**: 日本語・英語完全対応

## クイックスタート

1. Markdown ファイル (`.md`) を開く
2. コマンドパレットから `md2cv: Open Preview` を実行 (`Cmd+Shift+V` / `Ctrl+Shift+V`)
3. CV を書き始めましょう！

### テンプレートを生成

コマンドパレットから `md2cv: Generate Template` を実行すると、新しい CV テンプレートを作成できます。

## コマンド

| コマンド | キーバインド | 説明 |
|---------|------------|-------------|
| `md2cv: Open Preview` | `Cmd+Shift+V` / `Ctrl+Shift+V` | プレビューを開く |
| `md2cv: Export PDF` | `Cmd+Alt+E` / `Ctrl+Alt+E` | PDF にエクスポート |
| `md2cv: Change Format` | `Cmd+Alt+F` / `Ctrl+Alt+F` | フォーマットを切り替え |
| `md2cv: Change Paper Size` | `Cmd+Alt+P` / `Ctrl+Alt+P` | 用紙サイズを変更 |
| `md2cv: Generate Template` | `Cmd+Alt+T` / `Ctrl+Alt+T` | テンプレートを生成 |
| `md2cv: Insert Photo` | - | 写真を挿入（日本語フォーマット） |
| `md2cv: Toggle Sync Scroll` | `Cmd+Alt+S` / `Ctrl+Alt+S` | 同期スクロールの切り替え |
| `md2cv: Switch Language` | `Cmd+Alt+L` / `Ctrl+Alt+L` | CV の言語を切り替え |

## 設定

| 設定 | デフォルト | 説明 |
|---------|---------|-------------|
| `md2cv.defaultFormat` | `cv` | デフォルトの CV フォーマット (`cv`, `rirekisho`, `shokumukeirekisho`, `both`) |
| `md2cv.defaultPaperSize` | `a4` | デフォルトの用紙サイズ (`a3`, `a4`, `b4`, `b5`, `letter`) |
| `md2cv.previewUpdateDelay` | `300` | プレビュー更新の遅延（ミリ秒） |
| `md2cv.enableSyncScroll` | `true` | 同期スクロールを有効化 |
| `md2cv.templateLanguage` | `en` | テンプレートの言語 (`en`, `ja`) |
| `md2cv.includeTemplateComments` | `true` | テンプレートに説明コメントを含める |
| `md2cv.defaultLanguage` | `auto` | CV の言語 (`auto`, `en`, `ja`) |

## 対応フォーマット

### 英文 CV (Western-style CV)
サマリー、職歴、学歴、スキルなどのセクションを持つ標準的な履歴書フォーマット。

### 履歴書 (Rirekisho)
写真、個人情報、構造化されたセクションを持つ日本の伝統的な履歴書フォーマット。

### 職務経歴書 (Shokumu-keirekisho)
日本で一般的に使用される詳細な職務経歴書。

## Markdown フォーマット

YAML フロントマターで個人情報を記述し、標準的な Markdown で CV を作成します：

```yaml
---
name: 山田 太郎
name_furigana: やまだ たろう
email_address: taro@example.com
phone_number: 090-1234-5678
---
```

セクションには構造化されたコードブロックを使用します：

````markdown
# 職歴

```resume:experience
- company: 株式会社テック
  roles:
    - title: シニアエンジニア
      start: 2020-01
      end: present
      highlights:
        - バックエンド開発をリード
        - 若手エンジニアの育成
```
````

詳細な Markdown フォーマットについては、[md2cv ドキュメント](https://github.com/yuyash/md2cv#markdown-format)を参照してください。

## 要件

- VS Code 1.85.0 以上

## 関連プロジェクト

- [md2cv](https://github.com/yuyash/md2cv) - Markdown から CV を生成する CLI ツール
- [md2cv-examples](https://github.com/yuyash/md2cv-examples) - CV テンプレートの例

## ライセンス

[GPL-3.0](LICENSE)
