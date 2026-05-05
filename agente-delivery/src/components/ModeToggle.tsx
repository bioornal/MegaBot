"use client";
import { useState } from "react";

interface Props {
  mode: "AI" | "HUMAN";
  conversationId: number;
  onToggle: (id: number, mode: "AI" | "HUMAN") => Promise<void>;
}

export default function ModeToggle({ mode, conversationId, onToggle }: Props) {
  const [pending, setPending] = useState(false);
  const isAI = mode === "AI";

  const handleClick = async () => {
    if (pending) return;
    setPending(true);
    try {
      await onToggle(conversationId, isAI ? "HUMAN" : "AI");
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      title={isAI ? "Modo IA automático — click para cambiar a humano" : "Modo humano manual — click para cambiar a IA"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 10px",
        borderRadius: 7,
        fontSize: 11.5,
        fontWeight: 600,
        background: isAI ? "color-mix(in srgb, var(--color-primary) 8%, #060a0f)" : "#1e1200",
        color: isAI ? "var(--color-primary)" : "#f59e0b",
        border: `1px solid ${isAI ? "color-mix(in srgb, var(--color-primary) 15%, #060a0f)" : "#4a2e05"}`,
        cursor: pending ? "not-allowed" : "pointer",
        opacity: pending ? 0.5 : 1,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: isAI ? "var(--color-primary)" : "#f59e0b",
        flexShrink: 0,
        boxShadow: `0 0 5px ${isAI ? "var(--color-glow)" : "rgba(245,158,11,0.6)"}`,
      }} />
      {/* Full label on desktop, short label on mobile via CSS */}
      <span className="mode-label-full">{isAI ? "IA automático" : "Humano manual"}</span>
      <span className="mode-label-short">{isAI ? "IA" : "OP"}</span>
    </button>
  );
}
