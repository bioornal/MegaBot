"use client";
import type { ConversationWithPreview } from "@/types";

const AVATAR_PALETTES = [
  { bg: "#152040", fg: "#5090e0" },
  { bg: "#102830", fg: "#30b898" },
  { bg: "#1e1238", fg: "#9060d8" },
  { bg: "#280c18", fg: "#d05878" },
  { bg: "#201600", fg: "#c89030" },
  { bg: "#0e2218", fg: "#38b068" },
  { bg: "#240a10", fg: "#c84050" },
  { bg: "#001828", fg: "#2878be" },
];

function avatarPalette(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++)
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function getInitials(name: string | null, phone: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return phone.replace(/\D/g, "").slice(-2);
}

function relativeTime(ts: number | null): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
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
      <div style={{ padding: "28px 12px", textAlign: "center" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: "#111a25",
            border: "1px solid #1c2836",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 10px",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#2a3e52">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
        </div>
        <div style={{ fontSize: 12, color: "#3d5268", lineHeight: 1.6 }}>
          Sin conversaciones aún.
          <br />
          Esperando mensajes.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {conversations.map((c) => {
        const isActive = activeId === c.id;
        const palette = avatarPalette(c.phone);
        const initials = getInitials(c.name, c.phone);
        const isAI = c.mode === "AI";
        const needsAttention =
          c.mode === "HUMAN" && c.last_message_role === "user";

        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "10px 11px",
              border: `1px solid ${isActive ? "#253a50" : "transparent"}`,
              borderRadius: 10,
              background: isActive ? "#111e2c" : "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
            onMouseEnter={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLElement).style.background = "#0f1820";
            }}
            onMouseLeave={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLElement).style.background =
                  "transparent";
            }}
          >
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  background: palette.bg,
                  border: `1px solid ${isActive ? "#2a4060" : "#1a2838"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 600,
                  color: palette.fg,
                  letterSpacing: "0.03em",
                }}
              >
                {initials}
              </div>
              {needsAttention && (
                <span
                  style={{
                    position: "absolute",
                    top: -3,
                    right: -3,
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    background: "#f59e0b",
                    border: "2px solid #090e14",
                    animation: "pulse-dot 1.4s ease-in-out infinite",
                  }}
                />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                  marginBottom: 3,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: isActive ? "#e8f0f8" : "#c0d0e0",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    lineHeight: 1.3,
                  }}
                >
                  {c.name ?? c.phone}
                </span>
                <span style={{ fontSize: 10.5, color: "#2e4258", flexShrink: 0 }}>
                  {relativeTime(c.last_message_at)}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 11.5,
                    color: "#3d5268",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {c.last_message_preview ?? "Sin mensajes"}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 6px",
                    borderRadius: 999,
                    flexShrink: 0,
                    background: isAI ? "#0a2218" : "#201400",
                    color: isAI ? "#22d986" : "#f59e0b",
                    border: `1px solid ${isAI ? "#153a26" : "#503208"}`,
                    fontWeight: 500,
                    letterSpacing: "0.04em",
                  }}
                >
                  {isAI ? "IA" : "OP"}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
