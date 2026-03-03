const { useEffect, useMemo, useState } = React;

const STORAGE_PROGRESS = "questionViewerProgress";
const STORAGE_SETTINGS = "questionViewerSettings";

const DEFAULT_SETTINGS = {
  autoComplete: true,
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
};


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
  if (!Array.isArray(images)) return [];
  return images
    .filter((img) => typeof img === "string" && img.trim().length > 0)
    .map((img) => (img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`));
}

function normalizeText(value) {
  return (value ?? "").toString().replace(/\s+/g, " ").trim();
}

async function listJsonFiles() {
  try {
    const res = await fetch("./data/");
    if (res.ok) {
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const files = Array.from(doc.querySelectorAll("a"))
        .map((a) => a.getAttribute("href"))
        .filter((href) => href && href.endsWith(".json"))
        .map((href) => href.split("/").pop());
      const unique = Array.from(new Set(files));
      if (unique.length > 0) return unique;
    }
  } catch (err) {
    // ignore and fallback
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

  if (!manifestRes) {
    throw new Error(
      "dataフォルダ内のJSON一覧を取得できませんでした。manifest.json が公開されているか確認してください。"
    );
  }

  const manifest = await manifestRes.json();
  if (Array.isArray(manifest)) return manifest;
  if (Array.isArray(manifest.files)) return manifest.files;
  throw new Error("manifest.jsonの形式が不正です。");
}

function buildQuestion(q, index, file) {
  const id = q.id ?? `${file}__${index + 1}`;
  return {
    ...q,
    id,
    category: file,
    _index: index + 1,
    _rawIndex: index,
  };
}

function filterQuestions(questions, keyword, statusFilter, progressById) {
  const needle = keyword.trim().toLowerCase();
  return questions.filter((q) => {
    const text = `${q.question ?? ""} ${(q.options ?? []).join(" ")}`.toLowerCase();
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
  const answerSet = new Set(answers.map((a) => normalizeText(a)));
  const options = Array.isArray(question.options) ? question.options : [];
  const correctIndices = options
    .map((opt, idx) => (answerSet.has(normalizeText(opt)) ? idx : -1))
    .filter((idx) => idx >= 0);

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

function OptionList({ options, selectedOptions, correctSet, showAnswer, onToggle }) {
  return (
    <div className="options-list">
      {options.map((opt, i) => {
        const isSelected = selectedOptions.includes(i);
        const isCorrect = showAnswer && correctSet.has(i);
        const isIncorrect = showAnswer && isSelected && !correctSet.has(i);
        return (
          <button
            key={`opt-${i}`}
            type="button"
            className={`option-item ${isSelected ? "selected" : ""} ${
              isCorrect ? "correct" : ""
            } ${isIncorrect ? "incorrect" : ""}`}
            onClick={() => onToggle(i)}
          >
            <span className="option-num">{i + 1}</span>
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
  hasPrev,
  hasNext,
  onToggleCompleted,
  onToggleBookmark,
  onToggleOption,
  onCheckAnswer,
  onPrev,
  onNext,
  onOpenImage,
}) {
  return (
    <div className="question-card">
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
      <OptionList
        options={question.options ?? []}
        selectedOptions={selectedOptions}
        correctSet={correctSet}
        showAnswer={showAnswer}
        onToggle={onToggleOption}
      />
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
        </div>
      ) : null}
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
  onToggle,
  onSelect,
}) {
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
  onThemeChange,
  shortcutOpen,
  onToggleShortcut,
  isMobileOpen,
  onClose,
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
          <span>正解で自動完了</span>
        </label>
      </div>

      {banner ? <div className="status-banner">{banner}</div> : null}

      <div className="dataset-list">
        {datasets.map((ds) => (
          <DatasetItem
            key={ds.key}
            dataset={ds}
            filtered={filteredMap[ds.key] ?? []}
            collapsed={collapsedMap[ds.key] ?? true}
            progressEntries={progressByDataset[ds.key] || {}}
            selected={selected}
            onToggle={() => onToggleDataset(ds.key)}
            onSelect={onSelectQuestion}
          />
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="shortcut-toggle">
          <button type="button" className="shortcut-btn" onClick={onToggleShortcut}>
            {shortcutOpen ? SHORTCUT_LABELS.buttonClose : SHORTCUT_LABELS.buttonOpen}
          </button>
          {shortcutOpen ? (
            <div className="shortcut-popover" role="dialog" aria-label={SHORTCUT_LABELS.title}>
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

  const [progress, setProgress] = useStoredState(STORAGE_PROGRESS, {});
  const [storedSettings, setStoredSettings] = useStoredState(
    STORAGE_SETTINGS,
    DEFAULT_SETTINGS
  );

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
      let files;
      try {
        files = await listJsonFiles();
      } catch (err) {
        if (!active) return;
        setBanner(err.message);
        setStatusText("読み込みに失敗しました");
        return;
      }

      if (!files.length) {
        if (!active) return;
        setBanner("dataフォルダにJSONファイルがありません。");
        setStatusText("dataフォルダにJSONがありません");
        return;
      }

      const loaded = [];
      const warnings = [];
      for (const file of files) {
        try {
          const res = await fetch(`./data/${file}`);
          if (!res.ok) throw new Error(`${file} の読み込みに失敗しました`);
          const data = await res.json();
          if (!Array.isArray(data)) throw new Error(`${file} は配列形式ではありません`);
          const questions = data.map((q, index) => buildQuestion(q, index, file));
          loaded.push({ key: file, label: file, questions });
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
      if (event.target && event.target.tagName === "INPUT") return;
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
        setLightboxSrc("");
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [datasets, filteredMap, selected, selectedOptions]);

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
    const hasPrev = index > 0;
    const hasNext = index < filtered.length - 1;
    const progressEntry = getProgressEntry(progress, ds.key, q.id);
    const { correctIndices } = evaluateSelection(q, selectedOptions);
    const correctSet = new Set(correctIndices);

    return (
      <QuestionCard
        question={q}
        datasetLabel={ds.label}
        progressEntry={progressEntry}
        selectedOptions={selectedOptions}
        showAnswer={showAnswer}
        correctSet={correctSet}
        images={images}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onToggleCompleted={toggleCompleted}
        onToggleBookmark={toggleBookmark}
        onToggleOption={toggleOption}
        onCheckAnswer={() => handleCheckAnswer(q)}
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
        onThemeChange={(theme) =>
          setStoredSettings((prev) => ({ ...prev, theme }))
        }
        shortcutOpen={isShortcutOpen}
        onToggleShortcut={() => setIsShortcutOpen((prev) => !prev)}
        isMobileOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
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
