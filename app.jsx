const { useEffect, useLayoutEffect, useMemo, useRef, useState } = React;

const STORAGE_PROGRESS = "questionViewerProgress";
const STORAGE_SETTINGS = "questionViewerSettings";
const STORAGE_NOTES = "questionViewerNotes";

const DEFAULT_SETTINGS = {
  autoComplete: true,
  noteEnabled: false,
  noteWrap: false,
  theme: "light",
};

const STATUS_TABS = [
  { key: "all", label: "すべて" },
  { key: "uncompleted", label: "未完了" },
  { key: "completed", label: "完了済み" },
  { key: "bookmarked", label: "ブックマーク" },
];

const THEME_OPTIONS = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

const SHORTCUT_LABELS = {
  title: "\u30b7\u30e7\u30fc\u30c8\u30ab\u30c3\u30c8",
  buttonOpen: "\u30b7\u30e7\u30fc\u30c8\u30ab\u30c3\u30c8\u30ad\u30fc\u4e00\u89a7\u3092\u8868\u793a",
  buttonClose: "\u30b7\u30e7\u30fc\u30c8\u30ab\u30c3\u30c8\u3092\u9589\u3058\u308b",
  pcOnly: "PC\u306e\u307f",
  select: "\u9078\u629e\u80a2\u3092\u9078\u629e/\u89e3\u9664",
  complete: "\u5b8c\u4e86/\u672a\u5b8c\u4e86\u306e\u5207\u66ff",
  bookmark: "\u30d6\u30c3\u30af\u30de\u30fc\u30af\u306e\u5207\u66ff",
  nav: "\u524d/\u6b21\u306e\u554f\u984c\u3078\u79fb\u52d5",
  closeImage: "\u753b\u50cf\u62e1\u5927\u3092\u9589\u3058\u308b",
  checkToggle: "\u89e3\u7b54\u30c1\u30a7\u30c3\u30af\u3092\u30c8\u30b0\u30eb",
  noteFocus: "\u30ce\u30fc\u30c8\u3078\u30d5\u30a9\u30fc\u30ab\u30b9/\u89e3\u9664",
};

const DESCRIPTIVE_TAG_KEY = "writing";
const DESCRIPTIVE_TAG_LABEL = "\u8a18\u8ff0";


function loadStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function saveStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // ignore storage errors
  }
}

function useStoredState(key, fallback) {
  const [state, setState] = useState(() => loadStoredJson(key, fallback));
  useEffect(() => {
    saveStoredJson(key, state);
  }, [key, state]);
  return [state, setState];
}

function normalizeImages(images) {
  if (typeof images === "string") {
    images = [images];
  }
  if (!Array.isArray(images)) return [];
  return images
    .filter((img) => typeof img === "string" && img.trim().length > 0)
    .map((img) => (img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`));
}

function normalizeText(value) {
  return (value ?? "").toString().replace(/\s+/g, " ").trim();
}

function normalizeOptions(rawOptions) {
  if (Array.isArray(rawOptions)) {
    const allEmpty =
      rawOptions.length === 0 ||
      rawOptions.every((opt) => normalizeText(opt) === "");
    if (allEmpty) return { options: [], optionKeys: null };
    return { options: rawOptions, optionKeys: null };
  }
  if (rawOptions && typeof rawOptions === "object") {
    const entries = Object.entries(rawOptions);
    const values = entries.map(([, value]) => value);
    const allEmpty =
      values.length === 0 || values.every((opt) => normalizeText(opt) === "");
    if (allEmpty) return { options: [], optionKeys: null };
    return {
      options: values,
      optionKeys: entries.map(([key]) => key),
    };
  }
  return { options: [], optionKeys: null };
}

async function listJsonFiles() {
  function normalizeEntries(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        if (typeof item === "string") {
          const name = item.trim();
          return name ? { file: name, label: name } : null;
        }
        if (item && typeof item === "object") {
          const file = typeof item.file === "string" ? item.file.trim() : "";
          const labelRaw = typeof item.label === "string" ? item.label.trim() : "";
          if (!file) return null;
          return { file, label: labelRaw || file };
        }
        return null;
      })
      .filter(Boolean);
  }

  const manifestCandidates = ["./data/manifest.json", "./application/data/manifest.json"];
  let manifestRes = null;
  for (const path of manifestCandidates) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (res.ok) {
        manifestRes = res;
        break;
      }
    } catch (err) {
      // continue
    }
  }

  if (manifestRes) {
    const manifest = await manifestRes.json();
    const rawList = Array.isArray(manifest)
      ? manifest
      : Array.isArray(manifest?.files)
      ? manifest.files
      : null;
    if (!rawList) throw new Error("manifest.json has an unexpected shape.");
    const entries = normalizeEntries(rawList);
    if (entries.length) return entries;
    throw new Error("manifest.json contains no valid entries.");
  }

  try {
    const res = await fetch("./data/");
    if (res.ok) {
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const files = Array.from(doc.querySelectorAll("a"))
        .map((a) => a.getAttribute("href"))
        .filter((href) => href && href.endsWith(".json"))
        .map((href) => href.split("/").pop());
      const unique = Array.from(new Set(files)).filter(
        (name) => name && name.toLowerCase() !== "manifest.json"
      );
      if (unique.length > 0) return normalizeEntries(unique);
    }
  } catch (err) {
    // ignore and fallback
  }

  throw new Error(
    "No JSON files found under /data. Add data/manifest.json or enable directory listing."
  );
}

function buildQuestion(q, index, file) {
  const id = q.id ?? `${file}__${index + 1}`;
  const { options, optionKeys } = normalizeOptions(q.options);
  return {
    ...q,
    id,
    category: file,
    options,
    _optionKeys: optionKeys,
    _index: index + 1,
    _rawIndex: index,
  };
}

function filterQuestions(questions, keyword, statusFilter, progressById) {
  const needle = keyword.trim().toLowerCase();
  return questions.filter((q) => {
    const optionText = Array.isArray(q.options) ? q.options.join(" ") : "";
    const text = `${q.question ?? ""} ${optionText}`.toLowerCase();
    const matches = !needle || text.includes(needle);
    if (!matches) return false;

    const progress = progressById[q.id] || { status: "uncompleted", isBookmarked: false };
    if (statusFilter === "completed" && progress.status !== "completed") return false;
    if (statusFilter === "uncompleted" && progress.status === "completed") return false;
    if (statusFilter === "bookmarked" && !progress.isBookmarked) return false;
    return true;
  });
}

function getProgressEntry(progress, datasetKey, questionId) {
  const entry = progress?.[datasetKey]?.[questionId];
  return {
    status: entry?.status ?? "uncompleted",
    isBookmarked: !!entry?.isBookmarked,
  };
}

function evaluateSelection(question, selected) {
  const answers = Array.isArray(question.answer)
    ? question.answer
    : question.answer
    ? [question.answer]
    : [];
  const options = Array.isArray(question.options) ? question.options : [];
  const optionKeys = Array.isArray(question._optionKeys) ? question._optionKeys : null;

  let correctIndices = [];
  if (optionKeys && answers.length) {
    const keyMap = new Map(
      optionKeys.map((key, idx) => [normalizeText(key), idx])
    );
    const fromKeys = answers
      .map((a) => keyMap.get(normalizeText(a)))
      .filter((idx) => typeof idx === "number");
    if (fromKeys.length) {
      correctIndices = Array.from(new Set(fromKeys));
    }
  }

  if (!correctIndices.length) {
    const answerSet = new Set(answers.map((a) => normalizeText(a)));
    correctIndices = options
      .map((opt, idx) => (answerSet.has(normalizeText(opt)) ? idx : -1))
      .filter((idx) => idx >= 0);
  }

  const selectedSet = new Set(selected);
  const correctSet = new Set(correctIndices);
  const allCorrectSelected =
    correctIndices.length > 0 &&
    correctIndices.every((idx) => selectedSet.has(idx)) &&
    selected.every((idx) => correctSet.has(idx));

  return { correctIndices, allCorrectSelected };
}

function StatusTabs({ value, onChange }) {
  return (
    <div className="status-tabs">
      {STATUS_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`status-tab ${value === tab.key ? "active" : ""}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function ThemeToggle({ theme, onChange }) {
  return (
    <div className="theme-toggle" role="group" aria-label="テーマ切替">
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          className={`theme-btn ${theme === option.key ? "active" : ""}`}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function NotePane({ value, onChange, onClear, inputRef, wrapEnabled, onWrapChange }) {
  const gutterRef = useRef(null);
  const textareaRef = useRef(null);
  const mirrorRef = useRef(null);
  const logicalLines = useMemo(() => value.split("\n"), [value]);
  const [mirrorWidth, setMirrorWidth] = useState(0);
  const [lineNumbers, setLineNumbers] = useState(["1"]);
  const [isCompactNote, setIsCompactNote] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 1024px)").matches
      : false
  );

  useEffect(() => {
    if (!textareaRef.current || !gutterRef.current) return;
    if (!value) {
      textareaRef.current.scrollTop = 0;
    }
    gutterRef.current.style.transform = `translateY(-${textareaRef.current.scrollTop}px)`;
  }, [value]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 1024px)");
    const updateCompactNote = (event) => setIsCompactNote(event.matches);

    setIsCompactNote(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateCompactNote);
      return () => mediaQuery.removeEventListener("change", updateCompactNote);
    }

    mediaQuery.addListener(updateCompactNote);
    return () => mediaQuery.removeListener(updateCompactNote);
  }, []);

  useEffect(() => {
    if (!textareaRef.current) return;

    function updateMirrorWidth() {
      if (textareaRef.current) {
        setMirrorWidth(textareaRef.current.clientWidth);
      }
    }

    updateMirrorWidth();

    if (typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(updateMirrorWidth);
    observer.observe(textareaRef.current);
    return () => observer.disconnect();
  }, [wrapEnabled]);

  useLayoutEffect(() => {
    if (!wrapEnabled) {
      setLineNumbers(logicalLines.map((_, index) => `${index + 1}`));
      return;
    }

    if (!textareaRef.current || !mirrorRef.current || mirrorWidth <= 0) return;

    const computed = window.getComputedStyle(textareaRef.current);
    const lineHeight = parseFloat(computed.lineHeight) || 28.8;
    const nextLineNumbers = [];
    const lineNodes = mirrorRef.current.querySelectorAll(".note-mirror-line");

    lineNodes.forEach((node, index) => {
      const rect = node.getBoundingClientRect();
      const visualRows = Math.max(1, Math.round(rect.height / lineHeight));
      nextLineNumbers.push(`${index + 1}`);
      for (let row = 1; row < visualRows; row += 1) {
        nextLineNumbers.push("");
      }
    });

    setLineNumbers(nextLineNumbers.length ? nextLineNumbers : ["1"]);
  }, [logicalLines, mirrorWidth, wrapEnabled]);

  useLayoutEffect(() => {
    if (!textareaRef.current) return;

    if (!isCompactNote) {
      textareaRef.current.style.height = "";
      return;
    }

    const computed = window.getComputedStyle(textareaRef.current);
    const lineHeight = parseFloat(computed.lineHeight) || 28.8;
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    const paddingBottom = parseFloat(computed.paddingBottom) || 0;
    const minHeight = lineHeight * 10 + paddingTop + paddingBottom;

    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.max(
      minHeight,
      textareaRef.current.scrollHeight
    )}px`;
  }, [isCompactNote, value, wrapEnabled, lineNumbers]);

  function handleScroll(event) {
    if (gutterRef.current) {
      gutterRef.current.style.transform = `translateY(-${event.target.scrollTop}px)`;
    }
  }

  function setTextareaRef(node) {
    textareaRef.current = node;
    if (!inputRef) return;
    inputRef.current = node;
  }

  return (
    <aside className="note-pane" aria-label="ノート">
      <div className="note-header">
        <div className="note-title">ノート</div>
        <div className="note-actions">
          <label className="note-wrap-toggle">
            <input
              type="checkbox"
              checked={wrapEnabled}
              onChange={(event) => onWrapChange(event.target.checked)}
            />
            <span>折り返し</span>
          </label>
        <button
          type="button"
          className="note-clear-btn"
          onClick={onClear}
          disabled={!value}
        >
          ノートをクリア
        </button>
        </div>
      </div>
      <div className="note-editor">
        <div className="note-gutter" aria-hidden="true">
          <div ref={gutterRef} className="note-line-numbers">
            {lineNumbers.map((line, index) => (
              <div key={`${index}-${line}`} className="note-line-number">
                {line}
              </div>
            ))}
          </div>
        </div>
        <textarea
          ref={setTextareaRef}
          className={`note-textarea ${wrapEnabled ? "wrapped" : ""}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onScroll={handleScroll}
          spellCheck={false}
          wrap={wrapEnabled ? "soft" : "off"}
          placeholder="ここにメモを書けます"
        />
        <div
          ref={mirrorRef}
          className={`note-mirror ${wrapEnabled ? "wrapped" : ""}`}
          style={{ width: mirrorWidth ? `${mirrorWidth}px` : undefined }}
          aria-hidden="true"
        >
          {logicalLines.map((line, index) => (
            <div key={`mirror-${index}`} className="note-mirror-line">
              {line || "\u200b"}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function OptionList({
  options,
  optionKeys,
  selectedOptions,
  correctSet,
  showAnswer,
  onToggle,
}) {
  return (
    <div className="options-list">
      {options.map((opt, i) => {
        const isSelected = selectedOptions.includes(i);
        const isCorrect = showAnswer && correctSet.has(i);
        const isIncorrect = showAnswer && isSelected && !correctSet.has(i);
        const label = optionKeys?.[i] ?? i + 1;
        return (
          <button
            key={`opt-${i}`}
            type="button"
            className={`option-item ${isSelected ? "selected" : ""} ${
              isCorrect ? "correct" : ""
            } ${isIncorrect ? "incorrect" : ""}`}
            onClick={() => onToggle(i)}
          >
            <span className="option-num">{label}</span>
            <span className="option-text">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

function QuestionCard({
  question,
  datasetLabel,
  progressEntry,
  selectedOptions,
  showAnswer,
  correctSet,
  images,
  explanationImages,
  noteEnabled,
  noteValue,
  noteWrap,
  noteInputRef,
  hasPrev,
  hasNext,
  onToggleCompleted,
  onToggleBookmark,
  onToggleOption,
  onCheckAnswer,
  onNoteChange,
  onClearNote,
  onNoteWrapChange,
  onPrev,
  onNext,
  onOpenImage,
}) {
  return (
    <div className="question-card">
      <div className={`question-layout ${noteEnabled ? "with-note" : "without-note"}`}>
        <div className="question-content">
          <div className="q-card-header">
        <button
          type="button"
          className={`status-toggle ${progressEntry.status === "completed" ? "completed" : ""}`}
          onClick={onToggleCompleted}
          title="完了/未完了を切り替え"
        >
          {progressEntry.status === "completed" ? "✓ 完了" : "○ 未完了"}
        </button>
        <span className="q-card-num">問題 {question._index}</span>
        <span className="q-card-dataset">{datasetLabel}</span>
        <span className="q-card-id">{question.id ?? ""}</span>
        <div className="q-card-actions">
          <button
            type="button"
            className={`bookmark-toggle ${progressEntry.isBookmarked ? "active" : ""}`}
            onClick={onToggleBookmark}
          >
            {progressEntry.isBookmarked ? "ブックマーク中" : "ブックマーク"}
          </button>
        </div>
      </div>
      <div className="q-text">{question.question ?? ""}</div>
      {images.length ? (
        <div className="q-images">
          {images.map((src, i) => (
            <img
              key={`${question.id ?? question._index}-${i}`}
              src={src}
              alt="問題画像"
              onClick={(event) => {
                event.stopPropagation();
                onOpenImage(src);
              }}
            />
          ))}
        </div>
      ) : null}
      {Array.isArray(question.options) && question.options.length ? (
        <OptionList
          options={question.options}
          optionKeys={question._optionKeys}
          selectedOptions={selectedOptions}
          correctSet={correctSet}
          showAnswer={showAnswer}
          onToggle={onToggleOption}
        />
      ) : null}
        </div>
        {noteEnabled ? (
          <NotePane
            value={noteValue}
            onChange={onNoteChange}
            onClear={onClearNote}
            inputRef={noteInputRef}
            wrapEnabled={noteWrap}
            onWrapChange={onNoteWrapChange}
          />
        ) : null}
        <div className="question-footer">
          <div className="answer-actions">
        <button type="button" className="check-btn" onClick={onCheckAnswer}>
          解答チェック
        </button>
        <div className="nav-bar">
          <button type="button" className="nav-btn" disabled={!hasPrev} onClick={onPrev}>
            前へ
          </button>
          <button type="button" className="nav-btn" disabled={!hasNext} onClick={onNext}>
            次へ
          </button>
        </div>
      </div>
      {showAnswer ? (
        <div className="explanation">
          <div className="explanation-title">解説</div>
          <div className="explanation-body">{question.explanation ?? "解説はありません。"}</div>

          {explanationImages.length ? (
            <div className="q-images">
              {explanationImages.map((src, i) => (
                <img
                  key={`${question.id ?? question._index}-exp-${i}`}
                  src={src}
                  alt="Explanation image"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenImage(src);
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="empty-state">
      <div className="icon">□</div>
      <p>{message}</p>
    </div>
  );
}



function DatasetItem({
  dataset,
  filtered,
  collapsed,
  progressEntries,
  selected,
  noteEnabled,
  onToggle,
  onSelect,
  onExportNotes,
  onImportNotes,
}) {
  const importInputRef = useRef(null);
  const completedCount = dataset.questions.filter(
    (q) => progressEntries[q.id]?.status === "completed"
  ).length;
  const ratio = dataset.questions.length
    ? Math.round((completedCount / dataset.questions.length) * 100)
    : 0;

  return (
    <div className="dataset">
      <button type="button" className="dataset-header" onClick={onToggle}>
        <div className="dataset-title-row">
          <span>{dataset.label}</span>
          <span className="dataset-count">
            {filtered.length}/{dataset.questions.length}
          </span>
        </div>
        <div className="dataset-progress">
          <div className="dataset-progress-bar" style={{ width: `${ratio}%` }}></div>
        </div>
        <div className="dataset-progress-text">
          完了 {completedCount}/{dataset.questions.length}
        </div>
      </button>
      <div className={`dataset-questions ${collapsed ? "collapsed" : ""}`}>
        {noteEnabled ? <div className="dataset-tools">
          <button
            type="button"
            className="dataset-tool-btn"
            onClick={() => onExportNotes(dataset)}
          >
            ノート書き出し
          </button>
          <button
            type="button"
            className="dataset-tool-btn"
            onClick={() => importInputRef.current?.click()}
          >
            ノート読み込み
          </button>
          <input
            ref={importInputRef}
            className="dataset-import-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onImportNotes(dataset, file);
              }
              event.target.value = "";
            }}
          />
        </div> : null}
        {filtered.length === 0 ? (
          <div className="dataset-empty">該当する問題がありません</div>
        ) : (
          filtered.map((q) => {
            const isActive =
              selected &&
              selected.datasetKey === dataset.key &&
              selected.questionId === q.id;
            const entry = getProgressEntry({ [dataset.key]: progressEntries }, dataset.key, q.id);
            const hasImages =
              Array.isArray(q.question_images) && q.question_images.length > 0;
            const hasDescriptiveTag =
              Array.isArray(q.tags) && q.tags.includes(DESCRIPTIVE_TAG_KEY);
            const isDescriptive =
              hasDescriptiveTag ||
              !Array.isArray(q.options) ||
              q.options.length === 0;
            return (
              <button
                key={`${dataset.key}-${q.id}`}
                type="button"
                className={`q-item ${isActive ? "active" : ""}`}
                onClick={() => onSelect(dataset.key, q.id)}
              >
                <span className="q-num">{q._index}</span>
                <span className="q-preview">
                  {normalizeText((q.question ?? "")).replace(/\n/g, " ")}
                </span>
                {entry.isBookmarked ? <span className="q-tag">復習</span> : null}
                {entry.status === "completed" ? <span className="q-tag done">完了</span> : null}
                  {isDescriptive ? (
                  <span className="q-tag">{DESCRIPTIVE_TAG_LABEL}</span>
                ) : null}
                {hasImages ? <span className="q-img-badge">{q.question_images.length}</span> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function Sidebar({
  statusText,
  statusFilter,
  onStatusFilterChange,
  keyword,
  onKeywordChange,
  settings,
  onSettingsChange,
  banner,
  datasets,
  filteredMap,
  collapsedMap,
  progressByDataset,
  selected,
  onToggleDataset,
  onSelectQuestion,
  onExportNotes,
  onImportNotes,
  onThemeChange,
  shortcutOpen,
  onToggleShortcut,
  isMobileOpen,
  onClose,
  onDismissBanner,
}) {
  return (
    <aside className={`sidebar ${isMobileOpen ? "open" : ""}`}>
      <div className="sidebar-header">
        <div className="title-block">
          <p className="eyebrow">Question Viewer</p>
          <h1>問題演習ビューアー</h1>
        </div>
        <div className="count">{statusText}</div>
        <button type="button" className="sidebar-close" onClick={onClose}>
          ✕
        </button>
      </div>

      <StatusTabs value={statusFilter} onChange={onStatusFilterChange} />

      <div className="search-box">
        <input
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          type="text"
          placeholder="キーワード検索..."
        />
      </div>

      <div className="settings-row">
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.autoComplete}
            onChange={(event) => onSettingsChange({ autoComplete: event.target.checked })}
          />
          <span>{"\u6b63\u89e3\u3067\u81ea\u52d5\u5b8c\u4e86"}</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.noteEnabled}
            onChange={(event) => onSettingsChange({ noteEnabled: event.target.checked })}
          />
          <span>ノート機能</span>
        </label>
      </div>

      <div className="sidebar-scroll">
        {banner ? (
          <div className="status-banner">
            <span className="status-banner-text">{banner}</span>
            <button
              type="button"
              className="status-banner-close"
              onClick={onDismissBanner}
              aria-label="通知を閉じる"
            >
              ×
            </button>
          </div>
        ) : null}

        <div className="dataset-list">
          {datasets.map((ds) => (
            <DatasetItem
              key={ds.key}
              dataset={ds}
              filtered={filteredMap[ds.key] ?? []}
              collapsed={collapsedMap[ds.key] ?? true}
              progressEntries={progressByDataset[ds.key] || {}}
              selected={selected}
              noteEnabled={settings.noteEnabled}
              onToggle={() => onToggleDataset(ds.key)}
              onSelect={onSelectQuestion}
              onExportNotes={onExportNotes}
              onImportNotes={onImportNotes}
            />
          ))}
        </div>
      </div>
      <div className="sidebar-footer">
        <div className="shortcut-toggle">
          <button type="button" className="shortcut-btn" onClick={onToggleShortcut}>
            {shortcutOpen ? SHORTCUT_LABELS.buttonClose : SHORTCUT_LABELS.buttonOpen}
          </button>
          {shortcutOpen ? (
            <div className="shortcut-overlay" onClick={onToggleShortcut}>
              <div
                className="shortcut-modal"
                role="dialog"
                aria-label={SHORTCUT_LABELS.title}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="shortcut-header">
                  <h2 className="shortcut-title">{SHORTCUT_LABELS.title}</h2>
                  <span className="shortcut-note">{SHORTCUT_LABELS.pcOnly}</span>
                </div>
                <div className="shortcut-grid">
                  <div className="shortcut-item">
                    <kbd>1-9</kbd>
                    <span>{SHORTCUT_LABELS.select}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>C</kbd>
                    <span>{SHORTCUT_LABELS.complete}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>B</kbd>
                    <span>{SHORTCUT_LABELS.bookmark}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>{"\u2190 / \u2192"}</kbd>
                    <span>{SHORTCUT_LABELS.nav}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>{"\u2191 / \u2193"}</kbd>
                    <span>{SHORTCUT_LABELS.nav}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Esc</kbd>
                    <span>{SHORTCUT_LABELS.closeImage}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Space</kbd>
                    <span>{SHORTCUT_LABELS.checkToggle}</span>
                  </div>
                  <div className="shortcut-item">
                    <kbd>Alt + N</kbd>
                    <span>{SHORTCUT_LABELS.noteFocus}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="theme-row">
          <span className="footer-label">Theme</span>
          <ThemeToggle theme={settings.theme} onChange={onThemeChange} />
        </div>
      </div>
    </aside>
  );
}

function App() {
  const [datasets, setDatasets] = useState([]);
  const [collapsedMap, setCollapsedMap] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState(null);
  const [statusText, setStatusText] = useState("読み込み中...");
  const [banner, setBanner] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState("");
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isShortcutOpen, setIsShortcutOpen] = useState(false);
  const noteInputRef = useRef(null);

  const [progress, setProgress] = useStoredState(STORAGE_PROGRESS, {});
  const [storedSettings, setStoredSettings] = useStoredState(
    STORAGE_SETTINGS,
    DEFAULT_SETTINGS
  );
  const [notes, setNotes] = useStoredState(STORAGE_NOTES, {});

  const settings = useMemo(
    () => ({ ...DEFAULT_SETTINGS, ...storedSettings }),
    [storedSettings]
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    document.body.classList.toggle("sidebar-open", isSidebarOpen);
  }, [isSidebarOpen]);

  useEffect(() => {
    let active = true;
    async function load() {
      setStatusText("JSONファイルを探しています...");
      let entries;
      try {
        entries = await listJsonFiles();
      } catch (err) {
        if (!active) return;
        setBanner(err.message);
        setStatusText("読み込みに失敗しました");
        return;
      }

      if (!entries.length) {
        if (!active) return;
        setBanner("dataフォルダにJSONファイルがありません。");
        setStatusText("dataフォルダにJSONがありません");
        return;
      }

      const loaded = [];
      const warnings = [];
      for (const entry of entries) {
        const file = entry.file;
        const label = entry.label || entry.file;
        try {
          const res = await fetch(`./data/${file}`);
          if (!res.ok) throw new Error(`${file} の読み込みに失敗しました`);
          const data = await res.json();
          if (!Array.isArray(data)) throw new Error(`${file} は配列形式ではありません`);
          const questions = data.map((q, index) => buildQuestion(q, index, file));
          loaded.push({ key: file, label, questions });
        } catch (err) {
          warnings.push(err.message);
        }
      }

      if (!active) return;
      setDatasets(loaded);
      setCollapsedMap(
        loaded.reduce((acc, ds) => {
          acc[ds.key] = true;
          return acc;
        }, {})
      );
      const total = loaded.reduce((sum, ds) => sum + ds.questions.length, 0);
      setStatusText(`${loaded.length}セット / ${total}問`);
      if (warnings.length) setBanner(warnings.join(" / "));
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const progressByDataset = useMemo(() => {
    const map = {};
    datasets.forEach((ds) => {
      map[ds.key] = progress[ds.key] || {};
    });
    return map;
  }, [datasets, progress]);

  const filteredMap = useMemo(() => {
    const map = {};
    datasets.forEach((ds) => {
      map[ds.key] = filterQuestions(
        ds.questions,
        keyword,
        statusFilter,
        progressByDataset[ds.key] || {}
      );
    });
    return map;
  }, [datasets, keyword, statusFilter, progressByDataset]);

  useEffect(() => {
    if (!selected) return;
    const ds = datasets.find((d) => d.key === selected.datasetKey);
    if (!ds) {
      setSelected(null);
      return;
    }
    const filtered = filteredMap[ds.key] ?? [];
    if (!filtered.length) {
      setSelected(null);
      return;
    }
    const exists = filtered.some((q) => q.id === selected.questionId);
    if (!exists) {
      setSelected({ datasetKey: ds.key, questionId: filtered[0].id });
    }
  }, [datasets, filteredMap, selected]);

  useEffect(() => {
    setSelectedOptions([]);
    setShowAnswer(false);
  }, [selected?.datasetKey, selected?.questionId]);

  useEffect(() => {
    const el = document.querySelector(".q-item.active");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selected, filteredMap]);

  useEffect(() => {
    function handleKey(event) {
      const activeElement = document.activeElement;
      const isNoteFocused = noteInputRef.current && activeElement === noteInputRef.current;

      if (event.altKey && (event.key === "n" || event.key === "N")) {
        if (settings.noteEnabled && selected && noteInputRef.current) {
          event.preventDefault();
          if (isNoteFocused) {
            noteInputRef.current.blur();
          } else {
            noteInputRef.current.focus();
          }
        }
        return;
      }

      const isTypingTarget =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.tagName === "SELECT" ||
          activeElement.isContentEditable);

      if (isNoteFocused) return;
      if (isTypingTarget) return;
      if (!selected) return;

      const ds = datasets.find((d) => d.key === selected.datasetKey);
      if (!ds) return;
      const filtered = filteredMap[ds.key] ?? [];
      const index = filtered.findIndex((q) => q.id === selected.questionId);
      const question = filtered[index];

      if (event.key >= "1" && event.key <= "9" && question) {
        const idx = Number(event.key) - 1;
        if (Array.isArray(question.options) && idx < question.options.length) {
          event.preventDefault();
          toggleOption(idx);
        }
        return;
      }

      if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        toggleCompleted();
        return;
      }

      if (event.key === "b" || event.key === "B") {
        event.preventDefault();
        toggleBookmark();
        return;
      }

      if (event.code === "Space" || event.key === " ") {
        if (question) {
          event.preventDefault();
          handleCheckAnswer(question);
        }
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        if (index < filtered.length - 1) {
          setSelected({ datasetKey: ds.key, questionId: filtered[index + 1].id });
          setCollapsedMap((prev) => ({ ...prev, [ds.key]: false }));
        }
      } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        if (index > 0) {
          setSelected({ datasetKey: ds.key, questionId: filtered[index - 1].id });
          setCollapsedMap((prev) => ({ ...prev, [ds.key]: false }));
        }
      } else if (event.key === "Escape") {
        if (isShortcutOpen) {
          setIsShortcutOpen(false);
          return;
        }
        setLightboxSrc("");
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [datasets, filteredMap, selected, selectedOptions, settings.noteEnabled, isShortcutOpen]);

  function updateProgress(datasetKey, questionId, updates) {
    setProgress((prev) => {
      const next = { ...prev };
      const datasetEntries = { ...(prev[datasetKey] || {}) };
      const current = {
        status: "uncompleted",
        isBookmarked: false,
        ...(datasetEntries[questionId] || {}),
      };
      datasetEntries[questionId] = { ...current, ...updates };
      next[datasetKey] = datasetEntries;
      return next;
    });
  }

  function toggleCompleted() {
    if (!selected) return;
    const entry = getProgressEntry(progress, selected.datasetKey, selected.questionId);
    updateProgress(selected.datasetKey, selected.questionId, {
      status: entry.status === "completed" ? "uncompleted" : "completed",
    });
  }

  function toggleBookmark() {
    if (!selected) return;
    const entry = getProgressEntry(progress, selected.datasetKey, selected.questionId);
    updateProgress(selected.datasetKey, selected.questionId, {
      isBookmarked: !entry.isBookmarked,
    });
  }

  function toggleOption(index) {
    setSelectedOptions((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      }
      return [...prev, index];
    });
  }

  function handleCheckAnswer(question) {
    setShowAnswer((prev) => {
      const next = !prev;
      if (next) {
        const result = evaluateSelection(question, selectedOptions);
        if (settings.autoComplete && result.allCorrectSelected) {
          updateProgress(question.category, question.id, { status: "completed" });
        }
      }
      return next;
    });
  }

  function handleSelect(datasetKey, questionId) {
    setSelected({ datasetKey, questionId });
    setCollapsedMap((prev) => ({ ...prev, [datasetKey]: false }));
    setIsSidebarOpen(false);
  }

  function handleToggleDataset(key) {
    setCollapsedMap((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function updateNote(datasetKey, questionId, value) {
    setNotes((prev) => {
      const next = { ...prev };
      const datasetNotes = { ...(prev[datasetKey] || {}) };

      if (value) {
        datasetNotes[questionId] = value;
      } else {
        delete datasetNotes[questionId];
      }

      if (Object.keys(datasetNotes).length > 0) {
        next[datasetKey] = datasetNotes;
      } else {
        delete next[datasetKey];
      }

      return next;
    });
  }

  function replaceDatasetNotes(datasetKey, datasetNotes) {
    setNotes((prev) => {
      const next = { ...prev };
      if (Object.keys(datasetNotes).length > 0) {
        next[datasetKey] = datasetNotes;
      } else {
        delete next[datasetKey];
      }
      return next;
    });
  }

  /*
  function handleExportNotes(dataset) {
    const datasetNotes = notes?.[dataset.key] || {};
    const payload = dataset.questions
      .map((question) => {
        const rawNote = datasetNotes[question.id];
        if (!rawNote) return null;
        return {
          id: question.id,
          note: rawNote.split("\n"),
        };
      })
      .filter(Boolean);

    const filename = `${dataset.key.replace(/\.json$/i, "")}_notes.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setBanner(`${dataset.label} のノートを ${payload.length} 件書き出しました。`);
  }

  async function handleImportNotes(dataset, file) {
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error("ノートJSONは配列形式で指定してください。");
      }

      const validIds = new Set(dataset.questions.map((question) => question.id));
      const existingDatasetNotes = notes?.[dataset.key] || {};
      const nextDatasetNotes = { ...existingDatasetNotes };
      let importedCount = 0;
      let skippedCount = 0;

      parsed.forEach((item) => {
        if (!item || typeof item !== "object") return;
        if (typeof item.id !== "string" || !validIds.has(item.id)) return;
        if (!Array.isArray(item.note)) return;

        const noteText = item.note
          .filter((line) => typeof line === "string")
          .join("\n");

        if (!noteText) return;

        nextDatasetNotes[item.id] = noteText;
        importedCount += 1;
      });

      replaceDatasetNotes(dataset.key, nextDatasetNotes);
      setBanner(`${dataset.label} のノートを ${importedCount} 件読み込みました。`);
    } catch (error) {
      setBanner(
        `${dataset.label} のノート読み込みに失敗しました: ${
          error?.message || "JSONを確認してください。"
        }`
      );
    }
  }

  */

  function handleExportNotes(dataset) {
    const datasetNotes = notes?.[dataset.key] || {};
    const payload = dataset.questions
      .map((question) => {
        const rawNote = datasetNotes[question.id];
        if (!rawNote) return null;
        return {
          id: question.id,
          note: rawNote.split("\n"),
        };
      })
      .filter(Boolean);

    const filename = `${dataset.key.replace(/\.json$/i, "")}_notes.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setBanner(
      `${dataset.label} \u306e\u30ce\u30fc\u30c8\u3092 ${payload.length} \u4ef6\u66f8\u304d\u51fa\u3057\u307e\u3057\u305f\u3002`
    );
  }

  async function handleImportNotes(dataset, file) {
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error(
          "\u30ce\u30fc\u30c8JSON\u306f\u914d\u5217\u5f62\u5f0f\u3067\u6307\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002"
        );
      }

      const validIds = new Set(dataset.questions.map((question) => question.id));
      const existingDatasetNotes = notes?.[dataset.key] || {};
      const nextDatasetNotes = { ...existingDatasetNotes };
      let importedCount = 0;
      let skippedCount = 0;

      parsed.forEach((item) => {
        if (!item || typeof item !== "object") return;
        if (typeof item.id !== "string" || !validIds.has(item.id)) return;
        if (!Array.isArray(item.note)) return;

        const noteText = item.note
          .filter((line) => typeof line === "string")
          .join("\n");

        if (!noteText) return;
        if (existingDatasetNotes[item.id]) {
          skippedCount += 1;
          return;
        }

        nextDatasetNotes[item.id] = noteText;
        importedCount += 1;
      });

      replaceDatasetNotes(dataset.key, nextDatasetNotes);
      setBanner(
        `${dataset.label} \u306e\u30ce\u30fc\u30c8\u3092 ${importedCount} \u4ef6\u8aad\u307f\u8fbc\u307f\u307e\u3057\u305f\u3002${
          skippedCount
            ? ` ${skippedCount} \u4ef6\u306f\u65e2\u5b58\u30ce\u30fc\u30c8\u304c\u3042\u308b\u305f\u3081\u4e0a\u66f8\u304d\u3057\u307e\u305b\u3093\u3067\u3057\u305f\u3002`
            : ""
        }`
      );
    } catch (error) {
      setBanner(
        `${dataset.label} \u306e\u30ce\u30fc\u30c8\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ${
          error?.message ||
          "JSON\u306e\u5f62\u5f0f\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002"
        }`
      );
    }
  }

  function renderMain() {
    if (!selected) {
      return (
        <EmptyState
          message={
            "\u53f3\u306e\u30d5\u30a9\u30eb\u30c0\u304b\u3089\u554f\u984c\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044"
          }
        />
      );
    }

    const ds = datasets.find((d) => d.key === selected.datasetKey);
    if (!ds) return null;
    const filtered = filteredMap[ds.key] ?? [];
    const index = filtered.findIndex((q) => q.id === selected.questionId);
    const q = filtered[index];
    if (!q) return null;
    const images = normalizeImages(q.question_images);
    const explanationImages = normalizeImages(
      q.explanation_images ?? q.explanation_image ?? q.explanationImages ?? q.explanationImage
    );
    const hasPrev = index > 0;
    const hasNext = index < filtered.length - 1;
    const progressEntry = getProgressEntry(progress, ds.key, q.id);
    const { correctIndices } = evaluateSelection(q, selectedOptions);
    const correctSet = new Set(correctIndices);
    const noteValue = notes?.[ds.key]?.[q.id] ?? "";

    return (
      <QuestionCard
        question={q}
        datasetLabel={ds.label}
        progressEntry={progressEntry}
        selectedOptions={selectedOptions}
        showAnswer={showAnswer}
        correctSet={correctSet}
        images={images}
        explanationImages={explanationImages}
        noteEnabled={settings.noteEnabled}
        noteValue={noteValue}
        noteWrap={settings.noteWrap}
        noteInputRef={noteInputRef}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onToggleCompleted={toggleCompleted}
        onToggleBookmark={toggleBookmark}
        onToggleOption={toggleOption}
        onCheckAnswer={() => handleCheckAnswer(q)}
        onNoteChange={(value) => updateNote(ds.key, q.id, value)}
        onClearNote={() => updateNote(ds.key, q.id, "")}
        onNoteWrapChange={(value) =>
          setStoredSettings((prev) => ({ ...prev, noteWrap: value }))
        }
        onPrev={() => hasPrev && handleSelect(ds.key, filtered[index - 1].id)}
        onNext={() => hasNext && handleSelect(ds.key, filtered[index + 1].id)}
        onOpenImage={setLightboxSrc}
      />
    );
  }

  return (
    <div className="app">
      <header className="mobile-header">
        <div className="mobile-title">問題演習ビューアー</div>
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setIsSidebarOpen(true)}
        >
          ☰
        </button>
      </header>

      <div
        className={`sidebar-overlay ${isSidebarOpen ? "show" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
      ></div>

      <Sidebar
        statusText={statusText}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        keyword={keyword}
        onKeywordChange={setKeyword}
        settings={settings}
        onSettingsChange={(updates) =>
          setStoredSettings((prev) => ({ ...prev, ...updates }))
        }
        banner={banner}
        datasets={datasets}
        filteredMap={filteredMap}
        collapsedMap={collapsedMap}
        progressByDataset={progressByDataset}
        selected={selected}
        onToggleDataset={handleToggleDataset}
        onSelectQuestion={handleSelect}
        onExportNotes={handleExportNotes}
        onImportNotes={handleImportNotes}
        onThemeChange={(theme) =>
          setStoredSettings((prev) => ({ ...prev, theme }))
        }
        shortcutOpen={isShortcutOpen}
        onToggleShortcut={() => setIsShortcutOpen((prev) => !prev)}
        isMobileOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onDismissBanner={() => setBanner("")}
      />

      <main className="main">{renderMain()}</main>

      <div
        className={`lightbox ${lightboxSrc ? "show" : ""}`}
        onClick={() => setLightboxSrc("")}
      >
        {lightboxSrc ? <img src={lightboxSrc} alt="拡大画像" /> : null}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
