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

export default function ConversationList({ conversations, activeId, onSelect }: Props) {
  if (conversations.length === 0) {
    return (
      <div style={{ padding: "24px 10px", textAlign: "center" }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "#111a25",
          border: "1px solid #1c2836",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 10px",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#2a3e52">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
        </div>
        <div style={{ fontSize: 11.5, color: "#3d5268", lineHeight: 1.6 }}>
          Sin conversaciones aún.
          <br />
          Esperando mensajes.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {conversations.map((c) => {
        const isActive = activeId === c.id;
        const palette = avatarPalette(c.phone);
        const initials = getInitials(c.name, c.phone);
        const isAI = c.mode === "AI";
        const needsAttention = c.mode === "HUMAN" && c.last_message_role === "user";

        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "7px 9px",
              border: `1px solid ${isActive ? "#1f3347" : "transparent"}`,
              borderRadius: 8,
              background: isActive ? "#0f1b28" : "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 9,
              position: "relative",
            }}
            onMouseEnter={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLElement).style.background = "#0c1620";
            }}
            onMouseLeave={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            {/* Active indicator stripe */}
            {isActive && (
              <span style={{
                position: "absolute",
                left: 0,
                top: "20%",
                bottom: "20%",
                width: 2,
                borderRadius: 999,
                background: "#22d986",
              }} />
            )}

            {/* Avatar */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: palette.bg,
                border: `1px solid ${isActive ? "#253a50" : "#182230"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11.5,
                fontWeight: 700,
                color: palette.fg,
                letterSpacing: "0.03em",
              }}>
                {initials}
              </div>
              {needsAttention && (
                <span style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: "#f59e0b",
                  border: "2px solid #090e14",
                  animation: "pulse-dot 1.4s ease-in-out infinite",
                }} />
              )}
            </div>

            {/* Text content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 4,
                marginBottom: 2,
              }}>
                <span style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: isActive ? "#e8f0f8" : "#b8cad8",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  lineHeight: 1.3,
                }}>
                  {c.name ?? c.phone}
                </span>
                <span style={{ fontSize: 10, color: "#2a3e52", flexShrink: 0, lineHeight: 1.3 }}>
                  {relativeTime(c.last_message_at)}
                </span>
              </div>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 4,
              }}>
                <span style={{
                  fontSize: 11,
                  color: "#324a60",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  lineHeight: 1.3,
                }}>
                  {c.last_message_preview ?? "Sin mensajes"}
                </span>
                <span style={{
                  fontSize: 9.5,
                  padding: "1px 5px",
                  borderRadius: 999,
                  flexShrink: 0,
                  background: isAI ? "#0a2218" : "#1e1200",
                  color: isAI ? "#22d986" : "#f59e0b",
                  border: `1px solid ${isAI ? "#143320" : "#4a2e05"}`,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                }}>
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
