import { useMemo, useState } from "react";

/** Sortable table view. Renders straight from row keys — no model call. */
export default function WidgetTable({ data }) {
  const rows = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const head = Array.isArray(data[0]) ? data[0] : data;
    return head.filter((r) => r && typeof r === "object");
  }, [data]);

  const columns = useMemo(() => {
    const keys = [];
    for (const r of rows.slice(0, 100)) {
      for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
    }
    return keys;
  }, [rows]);

  const [sort, setSort] = useState({ key: null, dir: 1 });

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    return [...rows].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * sort.dir;
      return String(x).localeCompare(String(y)) * sort.dir;
    });
  }, [rows, sort]);

  if (!rows.length) return <div className="widget__empty">No rows</div>;

  return (
    <div className="wtable">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                onClick={() =>
                  setSort((s) => ({ key: c, dir: s.key === c ? -s.dir : 1 }))
                }
              >
                {c}
                {sort.key === c ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 300).map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c}>{r[c] == null ? "—" : String(r[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > 300 && (
        <div className="wtable__more">
          Showing 300 of {sorted.length.toLocaleString()} rows
        </div>
      )}
    </div>
  );
}
