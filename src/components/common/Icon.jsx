const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const PATHS = {
  sparkle: (
    <>
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
      <path d="M18 15l.9 2.1 2.1.9-2.1.9L18 21l-.9-2.1-2.1-.9 2.1-.9z" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  users: (
    <>
      <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
      <circle cx="10" cy="8" r="3" />
      <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 5.2a3 3 0 0 1 0 5.6" />
    </>
  ),
  whistle: (
    <>
      <path d="M3 12a5 5 0 0 0 5 5h4l6 3v-8h-2a4 4 0 0 1-4-4H8a5 5 0 0 0-5 4z" />
      <circle cx="8" cy="12" r="1.4" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6v3H9z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3H9.8l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.06-.4.1-.8.1-1.2z" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  bar: (
    <>
      <path d="M5 20V10M10 20V5M15 20v-7M20 20v-4" />
    </>
  ),
  line: <path d="M4 16l4-5 4 3 4-7 4 4" />,
  area: (
    <>
      <path d="M4 17l4-5 4 3 4-7 4 4v5H4z" fill="currentColor" opacity="0.25" stroke="none" />
      <path d="M4 17l4-5 4 3 4-7 4 4" />
    </>
  ),
  pie: (
    <>
      <path d="M12 12V3a9 9 0 1 1-9 9z" />
      <path d="M12 3a9 9 0 0 1 9 9h-9z" />
    </>
  ),
  donut: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3.5V8.5" />
    </>
  ),
  scatter: (
    <>
      <circle cx="7" cy="16" r="1.6" />
      <circle cx="12" cy="9" r="1.6" />
      <circle cx="17" cy="13" r="1.6" />
      <circle cx="9" cy="6" r="1.6" />
    </>
  ),
  table: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 10h16M10 10v9" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-.6 4" />
      <path d="M20 4v6h-6" />
    </>
  ),
  save: (
    <>
      <path d="M5 5h11l3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
      <path d="M8 5v5h7V5M8 19v-5h8v5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </>
  ),
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
};

export default function Icon({ name, size = 18, className, style }) {
  const body = PATHS[name];
  if (!body) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={style}
      aria-hidden="true"
      {...S}
    >
      {body}
    </svg>
  );
}
