import { useCallback, useEffect, useMemo, useRef } from "react";
import { Responsive, WidthProvider } from "react-grid-layout";
import { api } from "../../api";
import { useDashboardStore } from "../../store/useDashboardStore";
import EmptySlot from "./EmptySlot";
import WidgetCard from "./WidgetCard";

const Grid = WidthProvider(Responsive);

// Small enough to fit four across; stored layouts from before this change
// carry larger minimums, so they are overridden on the way in.
const MIN_W = 2;
const MIN_H = 3;

export default function DashboardGrid(handlers) {
  const { slots, layouts, pending, errors, setLayouts, targetSlotId, clearTarget } =
    useDashboardStore();
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const relaxed = useMemo(() => {
    const out = {};
    for (const [bp, items] of Object.entries(layouts || {})) {
      out[bp] = (items || []).map((it) => ({
        ...it,
        minW: MIN_W,
        minH: MIN_H,
        w: Math.max(it.w, MIN_W),
        h: Math.max(it.h, MIN_H),
      }));
    }
    return out;
  }, [layouts]);

  const onLayoutChange = useCallback(
    (_current, all) => {
      setLayouts(all);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        api.setLayout(useDashboardStore.getState().dashboardId, all).catch(() => {});
      }, 600);
    },
    [setLayouts],
  );

  return (
    <div
      className="gridwrap"
      onClick={(e) => {
        if (e.target === e.currentTarget && targetSlotId) clearTarget();
      }}
    >
      <Grid
        className="layout"
        layouts={relaxed}
        // WidthProvider measures the GRID CONTAINER, not the viewport. With the
        // chat (352) and rail (320) taken out, a 1440px window leaves ~750px
        // here — so viewport-sized breakpoints would drop straight to `sm` and
        // stack every widget full-width.
        breakpoints={{ lg: 1000, md: 620, sm: 0 }}
        cols={{ lg: 12, md: 8, sm: 4 }}
        rowHeight={34}
        margin={[16, 16]}
        // Toolbars, popovers and the "+" must never start a drag.
        draggableCancel=".no-drag"
        // Corners and edges, not just the bottom-right nub.
        resizeHandles={["se", "sw", "e", "s"]}
        onLayoutChange={onLayoutChange}
      >
        {slots.map((slot, i) => (
          <div key={slot.i} className="gridcell" data-slot={slot.i}>
            {slot.state === "filled" ? (
              <WidgetCard
                slot={slot}
                index={i}
                pending={pending[slot.i]}
                error={errors[slot.i]}
                onChangeType={(t) => handlers.onChangeType(slot, t)}
                onSave={() => handlers.onSave(slot)}
                onRefresh={() => handlers.onRefresh(slot)}
                onRemove={() => handlers.onRemove(slot)}
              />
            ) : pending[slot.i] ? (
              <div className="widget">
                <div className="widget__body">
                  <div className="widget__overlay">
                    <span className="spinner" />
                    <span>
                      {pending[slot.i] === "asking"
                        ? "Querying your data…"
                        : "Designing the chart…"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              // Empty slots are removable too — `remove` deletes the slot
              // outright rather than clearing it back to empty.
              <EmptySlot
                slot={slot}
                index={i}
                onRemove={() => handlers.onRemoveEmpty(slot)}
              />
            )}
          </div>
        ))}
      </Grid>
    </div>
  );
}
