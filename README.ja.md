# md2cv for Visual Studio Code

[English](README.md) | [日本語](README.ja.md)

Markdown からフォーマット済みの CV/レジュメ、または日本の履歴書・職務経歴書を VS Code 上で作成できます。

![md2cv Preview](https://raw.githubusercontent.com/yuyash/md2cv-vs-code-extension/main/images/preview_ja.png)

## 機能

- **Markdown から履歴書を生成**: シンプルな Markdown から整形済みドキュメントを作成
- **複数フォーマット対応**: 英文 CV、履歴書、職務経歴書
- **テンプレート生成**: 各フォーマット用のスターターテンプレート
- **IntelliSense**: セクションやフィールドの自動補完

## クイックスタート

1. コマンドパレットから `md2cv: Generate Template` を実行してテンプレートを挿入（必要なら新規ファイルが作成されます）
2. コマンドパレットの `md2cv: Open Preview` か、エディタ上部のプレビューボタンからプレビューを開く
3. テンプレートを埋めて内容を整える

## テンプレートと対応フォーマット

テンプレートには以下が含まれます。

- 各フォーマットに合わせた編集用の構成
- 基本情報を入力する YAML フロントマター
- 職歴・学歴・スキルなどのセクションブロック

### 英文 CV

サマリー、職歴、学歴、スキルなどのセクションを持つ標準的な履歴書フォーマット。

### 履歴書

写真、個人情報、構造化されたセクションを持つ日本の伝統的な履歴書フォーマット。

### 職務経歴書

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

## 設定

| 設定                            | デフォルト | 説明                                                                          |
| ------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| `md2cv.defaultFormat`           | `cv`       | デフォルトの CV フォーマット (`cv`, `rirekisho`, `shokumukeirekisho`, `both`) |
| `md2cv.defaultPaperSize`        | `a4`       | デフォルトの用紙サイズ (`a3`, `a4`, `b4`, `b5`, `letter`)                     |
| `md2cv.marginMm`                | `30`       | ページ余白（mm）（単一値または `{top, right, bottom, left}`）                 |
| `md2cv.previewUpdateDelay`      | `300`      | プレビュー更新の遅延（ミリ秒）                                                |
| `md2cv.enableSyncScroll`        | `true`     | 同期スクロールを有効化                                                        |
| `md2cv.templateLanguage`        | `en`       | テンプレートの言語 (`en`, `ja`)                                               |
| `md2cv.includeTemplateComments` | `true`     | テンプレートに説明コメントを含める                                            |
| `md2cv.defaultLanguage`         | `auto`     | CV の言語 (`auto`, `en`, `ja`)                                                |

## コマンド

| コマンド                    | キーバインド                   | 説明                             |
| --------------------------- | ------------------------------ | -------------------------------- |
| `md2cv: Open Preview`       | `Cmd+Shift+V` / `Ctrl+Shift+V` | プレビューを開く                 |
| `md2cv: Export PDF`         | `Cmd+Alt+E` / `Ctrl+Alt+E`     | PDF にエクスポート               |
| `md2cv: Change Format`      | `Cmd+Alt+F` / `Ctrl+Alt+F`     | フォーマットを切り替え           |
| `md2cv: Change Paper Size`  | `Cmd+Alt+P` / `Ctrl+Alt+P`     | 用紙サイズを変更                 |
| `md2cv: Generate Template`  | `Cmd+Alt+T` / `Ctrl+Alt+T`     | テンプレートを生成               |
| `md2cv: Insert Photo`       | -                              | 写真を挿入（日本語フォーマット） |
| `md2cv: Toggle Sync Scroll` | `Cmd+Alt+S` / `Ctrl+Alt+S`     | 同期スクロールの切り替え         |
| `md2cv: Switch Language`    | `Cmd+Alt+L` / `Ctrl+Alt+L`     | CV の言語を切り替え              |

## 要件

- VS Code 1.90.0 以上

## 関連プロジェクト

- [md2cv](https://github.com/yuyash/md2cv) - Markdown から CV を生成する CLI ツール
- [md2cv-examples](https://github.com/yuyash/md2cv-examples) - CV テンプレートの例

## ライセンス

このプロジェクトは GNU General Public License v3.0 (GPL-3.0) の下でライセンスされています。このソフトウェアは自由に使用、変更、配布できますが、派生物も同じライセンスの下で配布する必要があります。詳細は [LICENSE](LICENSE) ファイルを参照してください。
