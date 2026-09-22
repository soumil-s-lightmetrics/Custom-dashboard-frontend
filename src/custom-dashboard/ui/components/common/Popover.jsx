import { useEffect, useRef } from "react";

/** Anchored popover that closes on outside click and Escape. */
export default function Popover({ onClose, children, style, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    }
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    // Deferred so the click that opened it doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className={`popover no-drag ${className}`} style={style}>
      {children}
    </div>
  );
}
