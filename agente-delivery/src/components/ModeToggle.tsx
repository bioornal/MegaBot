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
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 12px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        background: isAI ? "#0a2218" : "#201400",
        color: isAI ? "#22d986" : "#f59e0b",
        border: `1px solid ${isAI ? "#153a26" : "#503208"}`,
        cursor: pending ? "not-allowed" : "pointer",
        opacity: pending ? 0.5 : 1,
        letterSpacing: "0.02em",
        minWidth: 130,
        justifyContent: "center",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: isAI ? "#22d986" : "#f59e0b",
          flexShrink: 0,
          boxShadow: `0 0 6px ${isAI ? "rgba(34,217,134,0.5)" : "rgba(245,158,11,0.5)"}`,
        }}
      />
      {isAI ? "IA automático" : "Humano manual"}
    </button>
  );
}
