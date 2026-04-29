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
    <div className="flex items-center gap-2">
      <span className="text-xs" style={{ color: "#8b949e" }}>
        Modo:
      </span>
      <button
        onClick={handleClick}
        disabled={pending}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all"
        style={{
          background: isAI ? "#064e3b" : "#78350f",
          color: isAI ? "#10b981" : "#f59e0b",
          border: `2px solid ${isAI ? "#10b981" : "#f59e0b"}`,
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ background: isAI ? "#10b981" : "#f59e0b" }}
        />
        {isAI ? "IA — Automático" : "HUMANO — Manual"}
      </button>
    </div>
  );
}
