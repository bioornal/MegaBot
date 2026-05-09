"use client";
import { useEffect, useState } from "react";

interface BotToggleProps {
  botName: string;
}

export default function BotToggle({ botName }: BotToggleProps) {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bot-toggle", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !cancelled) setPaused(!!d.paused); })
      .catch(() => {});
    const interval = setInterval(() => {
      fetch("/api/bot-toggle", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d && !cancelled) setPaused(!!d.paused); })
        .catch(() => {});
    }, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  async function toggle() {
    if (paused === null || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/bot-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !paused }),
      });
      if (res.ok) {
        const d = await res.json();
        setPaused(!!d.paused);
      }
    } finally {
      setBusy(false);
    }
  }

  if (paused === null) return null;

  const isRunning = !paused;
  const dotColor = isRunning ? "#22c55e" : "#ef4444";
  const borderColor = isRunning ? "#1c2836" : "#7f1d1d";
  const bg = isRunning ? "#111a25" : "#1a0a0a";
  const label = isRunning ? `${botName} activo` : `${botName} pausado`;

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={isRunning
        ? "Click para PAUSAR el bot — los mensajes se guardan sin respuesta automática"
        : "Click para REACTIVAR el bot — responde automáticamente de nuevo"
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        cursor: busy ? "wait" : "pointer",
        padding: "6px 12px",
        color: "#e6edf3",
        fontSize: 13,
        fontWeight: 600,
        marginRight: 8,
        opacity: busy ? 0.6 : 1,
        transition: "background 0.2s, border-color 0.2s",
      }}
    >
      <span style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: dotColor,
        boxShadow: isRunning ? "0 0 6px #22c55e80" : "0 0 6px #ef444480",
        transition: "background 0.2s, box-shadow 0.2s",
      }} />
      <span>{label}</span>
    </button>
  );
}