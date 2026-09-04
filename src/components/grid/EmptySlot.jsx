import { useState } from "react";
import { useChatStore } from "../../store/useChatStore";
import { useDashboardStore } from "../../store/useDashboardStore";
import Icon from "../common/Icon";
import Popover from "../common/Popover";

export default function EmptySlot({ slot, index, onRemove }) {
  const {
    targetSlotId,
    setTarget,
    setRailOpen,
    setChatOpen,
    setRailFocus,
    savedReports,
    suggestedReports,
  } = useDashboardStore();
  const push = useChatStore((s) => s.push);
  const [menu, setMenu] = useState(false);
  const isTarget = targetSlotId === slot.i;

  function pick(mode) {
    setMenu(false);
    setTarget(slot.i, mode);
    // The chat stays available whichever option you choose — you can always
    // just describe the chart you want instead.
    setChatOpen(true);

    if (mode === "ai") {
      setRailFocus(null);
      return;
    }

    setRailOpen(true);
    setRailFocus(mode === "saved" ? "saved" : "template");

    // Every option must produce visible feedback. Picking "Saved Reports" with
    // none saved previously looked like a dead click.
    if (mode === "saved" && savedReports.length === 0) {
      push({
        role: "bot",
        kind: "answer",
        text:
          `You don't have any saved reports yet. Build a chart into Widget ${index + 1} ` +
          `by describing it below, then hit the save icon on the widget — it'll ` +
          `appear under Saved Reports for reuse.`,
      });
    } else if (mode === "saved") {
      push({
        role: "bot",
        kind: "answer",
        text: `Pick a saved report on the right to drop it into Widget ${index + 1}.`,
      });
    } else if (mode === "template") {
      push({
        role: "bot",
        kind: "answer",
        text:
          suggestedReports.length > 0
            ? `Pick a suggested report on the right and I'll run it into Widget ${index + 1}.`
            : `No suggestions are available right now — describe the chart you want instead.`,
      });
    }
  }

  return (
    <div
      className={`empty${isTarget ? " empty--target" : ""}`}
      // Clicking anywhere in the body targets the slot — cheap discoverability.
      onClick={() => setTarget(slot.i, "ai")}
    >
      <button
        className="empty__remove no-drag"
        title="Remove this widget"
        aria-label="Remove this widget"
        onClick={(e) => {
          e.stopPropagation();
          onRemove?.();
        }}
      >
        <Icon name="x" size={14} />
      </button>

      <div className="empty__stack">
        <button
          className="empty__plus no-drag"
          onClick={(e) => {
            e.stopPropagation();
            setMenu((v) => !v);
          }}
          aria-label="Add a widget"
        >
          <Icon name="plus" size={20} />
        </button>
        <div className="empty__title">Add a widget</div>
        <div className="empty__sub">
          Pick from saved reports
          <br />
          or build with AI
        </div>

        {menu && (
          <Popover
            onClose={() => setMenu(false)}
            style={{ top: 44, left: "50%", transform: "translateX(-50%)" }}
          >
            <div className="popover__label">Select an option</div>
            <button className="popover__item" onClick={() => pick("saved")}>
              <Icon name="file" size={16} /> Saved Reports
              {savedReports.length > 0 && (
                <span className="popover__count">{savedReports.length}</span>
              )}
            </button>
            <button className="popover__item" onClick={() => pick("template")}>
              <Icon name="file" size={16} /> Suggested Reports
              {suggestedReports.length > 0 && (
                <span className="popover__count">{suggestedReports.length}</span>
              )}
            </button>
            <button className="popover__item" onClick={() => pick("ai")}>
              <Icon name="file" size={16} /> Build with AI
            </button>
          </Popover>
        )}
      </div>
    </div>
  );
}
