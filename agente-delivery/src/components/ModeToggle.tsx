"use client";

interface Props {
  mode: "AI" | "HUMAN";
  conversationId: number;
  onToggle: (id: number, mode: "AI" | "HUMAN") => void;
}

export default function ModeToggle({ mode, conversationId, onToggle }: Props) {
  const isAI = mode === "AI";

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs" style={{ color: "#8b949e" }}>
        Modo:
      </span>
      <button
        onClick={() => onToggle(conversationId, isAI ? "HUMAN" : "AI")}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all"
        style={{
          background: isAI ? "#064e3b" : "#78350f",
          color: isAI ? "#10b981" : "#f59e0b",
          border: `2px solid ${isAI ? "#10b981" : "#f59e0b"}`,
          cursor: "pointer",
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
