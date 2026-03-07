(() => {
  function getLineStartOffsets(value) {
    const offsets = [0];
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === "\n") {
        offsets.push(index + 1);
      }
    }
    return offsets;
  }

  function getLineIndexFromOffset(lineStarts, offset) {
    let lineIndex = 0;
    for (let index = 0; index < lineStarts.length; index += 1) {
      if (lineStarts[index] > offset) {
        break;
      }
      lineIndex = index;
    }
    return lineIndex;
  }

  function clampSelectionOffset(value, max) {
    return Math.max(0, Math.min(value, max));
  }

  function transformNoteLines(value, selectionStart, selectionEnd, direction, duplicate) {
    const lines = value.split("\n");
    const lineStarts = getLineStartOffsets(value);
    const safeStart = clampSelectionOffset(selectionStart, value.length);
    const safeEnd = clampSelectionOffset(selectionEnd, value.length);
    const rangeStart = Math.min(safeStart, safeEnd);
    const rangeEnd = Math.max(safeStart, safeEnd);
    const effectiveEnd = rangeEnd > rangeStart ? rangeEnd - 1 : rangeEnd;
    const startLine = getLineIndexFromOffset(lineStarts, rangeStart);
    const endLine = getLineIndexFromOffset(lineStarts, effectiveEnd);
    const movedLines = lines.slice(startLine, endLine + 1);

    if (!duplicate) {
      if (direction < 0 && startLine === 0) return null;
      if (direction > 0 && endLine === lines.length - 1) return null;
    }

    const nextLines = [...lines];
    let nextStartLine = startLine;

    if (duplicate) {
      nextStartLine = direction < 0 ? startLine : endLine + 1;
      nextLines.splice(nextStartLine, 0, ...movedLines);
    } else {
      nextLines.splice(startLine, movedLines.length);
      nextStartLine = direction < 0 ? startLine - 1 : startLine + 1;
      nextLines.splice(nextStartLine, 0, ...movedLines);
    }

    const nextValue = nextLines.join("\n");
    const nextLineStarts = getLineStartOffsets(nextValue);
    const baseOffset = lineStarts[startLine];
    const nextBaseOffset = nextLineStarts[nextStartLine];

    return {
      value: nextValue,
      selectionStart: clampSelectionOffset(nextBaseOffset + (safeStart - baseOffset), nextValue.length),
      selectionEnd: clampSelectionOffset(nextBaseOffset + (safeEnd - baseOffset), nextValue.length),
    };
  }

  function NoteTextarea({ value, onChange, inputRef, wrapEnabled, placeholder }) {
    const gutterRef = React.useRef(null);
    const textareaRef = React.useRef(null);
    const mirrorRef = React.useRef(null);
    const pendingSelectionRef = React.useRef(null);
    const logicalLines = React.useMemo(() => value.split("\n"), [value]);
    const [mirrorWidth, setMirrorWidth] = React.useState(0);
    const [lineNumbers, setLineNumbers] = React.useState(["1"]);
    const [isCompactNote, setIsCompactNote] = React.useState(() =>
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(max-width: 1024px)").matches
        : false
    );

    React.useEffect(() => {
      if (!textareaRef.current || !gutterRef.current) return;
      if (!value) {
        textareaRef.current.scrollTop = 0;
      }
      gutterRef.current.style.transform = `translateY(-${textareaRef.current.scrollTop}px)`;
    }, [value]);

    React.useEffect(() => {
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

    React.useEffect(() => {
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

    React.useLayoutEffect(() => {
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

    React.useLayoutEffect(() => {
      if (!textareaRef.current) return;

      if (pendingSelectionRef.current) {
        const { selectionStart, selectionEnd } = pendingSelectionRef.current;
        textareaRef.current.setSelectionRange(selectionStart, selectionEnd);
        pendingSelectionRef.current = null;
      }

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

    function handleKeyDown(event) {
      if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
        return;
      }

      const direction = event.key === "ArrowUp" ? -1 : 1;
      const nextState = transformNoteLines(
        value,
        event.currentTarget.selectionStart,
        event.currentTarget.selectionEnd,
        direction,
        event.shiftKey
      );

      if (!nextState) {
        return;
      }

      event.preventDefault();
      if (nextState.value === value) {
        event.currentTarget.setSelectionRange(
          nextState.selectionStart,
          nextState.selectionEnd
        );
        return;
      }

      pendingSelectionRef.current = {
        selectionStart: nextState.selectionStart,
        selectionEnd: nextState.selectionEnd,
      };
      onChange(nextState.value);
    }

    function setTextareaRef(node) {
      textareaRef.current = node;
      if (!inputRef) return;
      inputRef.current = node;
    }

    return (
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
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          spellCheck={false}
          wrap={wrapEnabled ? "soft" : "off"}
          placeholder={placeholder}
        />
        <div
          ref={mirrorRef}
          className={`note-mirror ${wrapEnabled ? "wrapped" : ""}`}
          style={{ width: mirrorWidth ? `${mirrorWidth}px` : undefined }}
          aria-hidden="true"
        >
          {logicalLines.map((line, index) => (
            <div key={`mirror-${index}`} className="note-mirror-line">
              {line || "​"}
            </div>
          ))}
        </div>
      </div>
    );
  }

  window.NoteTextarea = NoteTextarea;
})();
