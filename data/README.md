# data フォルダのJSON仕様

このビューアーは `data/` 配下の `*.json` を読み込みます。ディレクトリ一覧取得が使えない環境では `manifest.json` を読み込みます。

## 読み込み対象の決定
- 可能なら `data/` の `*.json` を自動検出。
- 自動検出に失敗した場合は `manifest.json` を参照。

`manifest.json` は以下のどちらかの形式に対応しています。

```json
["questions.json", "questions_smalltest.json"]
```

```json
{ "files": ["questions.json", "questions_smalltest.json"] }
```

## 各JSONファイルの形式
- 1ファイル = 問題オブジェクト配列。
- 文字コードは UTF-8。
- 未知のフィールドは保持され、表示・判定には影響しません。

### 問題オブジェクトのフィールド

#### id
- 型: string（任意）
- 未指定時は `"{ファイル名}__{連番}"` が自動生成されます。

#### tags
- 型: string の配列（任意）
- 特別なタグ: `"writing"`
  - 記述問題であることを示します。ビューアーの一覧に「記述」タグを表示します。

#### question
- 型: string（推奨）
- 問題文。改行を含めても可。

#### question_images / question_image
- 型: string 配列、または string（任意）
- 画像は以下のどちらでもOK:
  - data URL（`data:image/...`）
  - 生の base64（`data:image/jpeg;base64,` を自動付与）

#### options
- 型: 以下のいずれか（任意）
  1. string 配列（選択肢文）
  2. 連想配列（`{"a": "選択肢A", "b": "選択肢B"}` など）

- 連想配列の場合、キー（a/b/c...）がラベルとして表示されます。
- 次のいずれかに該当する場合は「記述問題」とみなされ、選択肢は表示されません。
  - 空配列
  - 空オブジェクト
  - すべての値が空文字列のオブジェクト（例: `{ "a": "", "b": "" }`）

#### answer
- 型: string または string 配列（任意）
- 選択肢が配列の場合は、選択肢テキストと一致する文字列を指定。
- 選択肢が連想配列の場合は、以下のどちらでもOK:
  - キー指定（例: `["a", "c"]`）
  - 選択肢テキスト一致
- 記述問題では未指定でも問題ありません。

#### explanation
- 型: string（任意）
- 解説文。

#### explanation_images / explanation_image
- 型: string 配列、または string（任意）
- `question_images` と同じルール。
- 代替キー `explanationImages` / `explanationImage` も読み込みます。

## 例

### 選択式（配列）
```json
{
  "id": "q-001",
  "question": "次のうち正しいものはどれか",
  "options": ["A", "B", "C"],
  "answer": "B",
  "explanation": "Bが正しい。"
}
```

### 選択式（連想配列）
```json
{
  "id": "q-002",
  "question": "次のうち正しいものはどれか",
  "options": {"a": "A", "b": "B", "c": "C"},
  "answer": ["b"],
  "explanation": "bが正しい。"
}
```

### 記述式
```json
{
  "id": "q-003",
  "tags": ["writing"],
  "question": "〜について説明せよ",
  "options": {"a": "", "b": ""},
  "explanation": "模範解答..."
}
```
