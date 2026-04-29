"use client";
import type { ConversationWithPreview } from "@/types";

function relativeTime(ts: number | null): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

interface Props {
  conversations: ConversationWithPreview[];
  activeId: number | null;
  onSelect: (id: number) => void;
}

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
}: Props) {
  if (conversations.length === 0) {
    return (
      <div className="p-4 text-sm" style={{ color: "#8b949e" }}>
        Sin conversaciones aún.
        <br />
        Esperando mensajes de WhatsApp.
      </div>
    );
  }

  return (
    <div>
      {conversations.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className="w-full text-left px-4 py-3 border-b transition-colors"
          style={{
            background: activeId === c.id ? "#1c2128" : "transparent",
            borderColor: "#30363d",
            cursor: "pointer",
          }}
        >
          <div className="flex items-center justify-between mb-1 gap-2">
            <span
              className="text-sm font-medium text-white truncate"
              style={{ maxWidth: "120px" }}
            >
              {c.name ?? c.phone}
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
              style={{
                background: c.mode === "AI" ? "#064e3b" : "#78350f",
                color: c.mode === "AI" ? "#10b981" : "#f59e0b",
              }}
            >
              {c.mode === "AI" ? "IA" : "HUMANO"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-xs truncate"
              style={{ color: "#8b949e", maxWidth: "150px" }}
            >
              {c.last_message_preview
                ? c.last_message_preview.slice(0, 40)
                : "Sin mensajes"}
            </span>
            <span
              className="text-xs flex-shrink-0"
              style={{ color: "#8b949e" }}
            >
              {relativeTime(c.last_message_at)}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
