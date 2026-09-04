import { CHART_TYPES } from "../../lib/chartTypes";
import Icon from "../common/Icon";
import Popover from "../common/Popover";

export default function ChartTypeMenu({ active, onPick, onClose }) {
  return (
    <Popover
      onClose={onClose}
      className="charttypes"
      style={{ top: 30, right: 0 }}
    >
      {CHART_TYPES.map((c) => (
        <button
          key={c.id}
          className={`charttype${c.id === active ? " charttype--on" : ""}`}
          onClick={() => onPick(c.id)}
        >
          <Icon name={c.id === "table" ? "table" : c.id} size={18} />
          <span>{c.label}</span>
        </button>
      ))}
    </Popover>
  );
}
