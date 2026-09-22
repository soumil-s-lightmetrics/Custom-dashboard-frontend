export default function StepDots({ count = 3, active = 0 }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          style={{
            height: 8,
            width: i === active ? 30 : 8,
            borderRadius: 999,
            background: i === active ? "var(--purple)" : "#d4d4d8",
            transition: "width .2s",
          }}
        />
      ))}
    </div>
  );
}
