import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { useChatStore } from "../../store/useChatStore";
import { useDashboardStore } from "../../store/useDashboardStore";
import { useSessionStore } from "../../store/useSessionStore";
import Icon from "../common/Icon";

export default function ChatPanel({ onBuild }) {
  const userName = useSessionStore((s) => s.userName);
  // The open dashboard's persona, not the session's: after Skip the picker
  // lists every dashboard, and the starters should fit the one being edited.
  const sessionPersona = useSessionStore((s) => s.persona);
  const persona = useDashboardStore((s) => s.dashboard?.persona) || sessionPersona;
  const { targetSlotId, slots, setChatOpen, setTarget } = useDashboardStore();
  const {
    messages,
    suggestions,
    suggestionsSource,
    sending,
    pendingDateQuestion,
    contextExpired,
    setSuggestions,
  } = useChatStore();
  const [draft, setDraft] = useState("");
  const scroller = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api
      .suggestions(persona || "generalist", 3)
      .then((r) => setSuggestions(r.suggestions, r.source))
      .catch(() => setSuggestions([], "seed"));
  }, [persona, setSuggestions]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length, sending]);

  useEffect(() => {
    if (targetSlotId) inputRef.current?.focus();
  }, [targetSlotId]);

  const targetIndex = slots.findIndex((s) => s.i === targetSlotId);
  const started = messages.length > 0;

  function submit(text) {
    const q = (text ?? draft).trim();
    if (!q || sending) return;
    setDraft("");
    onBuild(q);
  }

  return (
    <aside className="chat">
      <header className="chat__head">
        <button
          className="chat__x"
          onClick={() => setChatOpen(false)}
          aria-label="Close chat"
        >
          <Icon name="x" size={17} />
        </button>
      </header>

      <div className="chat__body" ref={scroller}>
        <span className="pill pill--amber chat__beta">
          <Icon name="bulb" size={11} /> BETA
        </span>

        <h2 className="chat__hi">Hi {userName || "enter your name"}!</h2>
        <p className="chat__intro">
          Tell me what data you&apos;d like to see and I&apos;ll create a widget
          for you. Try one of the suggestions below.
        </p>

        {/* Always available — you can describe a chart whichever way you got
            here, including after picking Saved Reports or Browse Templates. */}
        {suggestions.map((s) => (
          <button
            key={s.id}
            className="suggestion"
            onClick={() => submit(s.text)}
            disabled={sending}
          >
            <Icon name="bulb" size={16} className="suggestion__icon" />
            <span>{s.text}</span>
          </button>
        ))}

        {suggestions.length === 0 && (
          <p className="chat__note">
            Loading suggestions… you can type a question below meanwhile.
          </p>
        )}

        {suggestionsSource === "seed" && suggestions.length > 0 && (
          <p className="chat__note">Showing starter suggestions.</p>
        )}

        {started && <div className="chat__rule" />}

        {contextExpired && (
          <div className="chat__divider">
            Starting fresh — earlier context has expired
          </div>
        )}

        {messages.map((m) => {
          // A range the user picked from the follow-up prompt is appended into
          // the bubble itself. Their question carried no time window, so
          // echoing the bare text back after they answered reads as if the
          // pick was dropped — the suffix shows the question that actually ran.
          const picked =
            m.role === "user" && m.dateRangeSource === "manual" && m.dateRange;
          return (
            <div key={m.id} className={`msg msg--${m.role}`}>
              <div className="msg__text">
                {m.text}
                {picked && <span className="msg__added"> + {m.dateRange}</span>}
              </div>
              {m.dateRange && m.role === "user" && !picked && (
                <div className="msg__chip">
                  Using {m.dateRange}
                  {m.dateRangeSource === "regex" || m.dateRangeSource === "llm"
                    ? " (detected)"
                    : ""}
                </div>
              )}
            </div>
          );
        })}

        {pendingDateQuestion && <DatePicker onPick={(r) => onBuild(pendingDateQuestion, r)} />}

        {sending && (
          <div className="msg msg--bot msg--busy">
            <span className="spinner" />
            <span>Working on it…</span>
          </div>
        )}
      </div>

      <footer className="chat__foot">
        {targetSlotId ? (
          <div className="chat__target">
            Building into Widget {targetIndex + 1}
            <button className="chat__target-x" onClick={() => setTarget(null)}>
              Change
            </button>
          </div>
        ) : (
          <div className="chat__target chat__target--none">
            Select a widget, or just ask — I&apos;ll use the next empty one
          </div>
        )}
        <div className="composer">
          <textarea
            ref={inputRef}
            rows={2}
            value={draft}
            placeholder="Ask for any chart…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            className="btn btn--solid composer__send"
            onClick={() => submit()}
            disabled={!draft.trim() || sending}
          >
            <Icon name="arrowRight" size={16} />
          </button>
        </div>
      </footer>
    </aside>
  );
}

function DatePicker({ onPick }) {
  const ranges = useSessionStore((s) => s.dateRanges);
  return (
    <div className="datepick">
      <div className="datepick__label">Which time range should I use?</div>
      <div className="datepick__opts">
        {ranges.map((r) => (
          <button key={r} className="datepick__opt" onClick={() => onPick(r)}>
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
