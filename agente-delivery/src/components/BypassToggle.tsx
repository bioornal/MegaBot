"use client";
import { useEffect, useState } from "react";

export default function BypassToggle() {
  const [active, setActive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bypass", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !cancelled) setActive(!!d.active); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function toggle() {
    if (active === null || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/bypass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      if (res.ok) {
        const d = await res.json();
        setActive(!!d.active);
      }
    } finally {
      setBusy(false);
    }
  }

  if (active === null) return null;

  const color = active ? "#f59e0b" : "var(--color-primary)";
  const label = active ? "Bypass ON" : "Bypass OFF";
  const title = active
    ? "Verificación de comprobante DESACTIVADA — toda imagen se acepta como OK (modo test)"
    : "Verificación de comprobante activa — click para desactivar (modo test)";

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        background: "#111a25",
        border: `1px solid ${active ? color : "#1c2836"}`,
        borderRadius: 8,
        cursor: busy ? "wait" : "pointer",
        padding: "6px 11px",
        color: "#e6edf3",
        fontSize: 13,
        marginRight: 8,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
      <span>{label}</span>
    </button>
  );
}
