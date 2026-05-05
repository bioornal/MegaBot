"use client";
import { useState, useRef, useEffect } from "react";
import type { Conversation, Message } from "@/types";
import MessageBubble from "./MessageBubble";
import ModeToggle from "./ModeToggle";
import StatusWidget from "./StatusWidget";

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

interface Props {
  conversation: Conversation;
  messages: Message[];
  onToggleMode: (id: number, mode: "AI" | "HUMAN") => Promise<void>;
  onSendMessage: (id: number, content: string) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
  onResetMemory: (id: number) => Promise<void>;
  onBack?: () => void;
}

export default function ConversationPanel({
  conversation,
  messages,
  onToggleMode,
  onSendMessage,
  onDelete,
  onResetMemory,
  onBack,
}: Props) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const ok = await onSendMessage(conversation.id, input.trim());
      if (ok) setInput("");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const palette = avatarPalette(conversation.phone);
  const initials = getInitials(conversation.name, conversation.phone);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0d1219" }}>

      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "11px 14px",
        borderBottom: "1px solid #1c2836",
        flexShrink: 0,
        background: "#090e14",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
          {/* Back button (visible on mobile) */}
          {onBack && (
            <button
              onClick={onBack}
              className="mobile-back-btn"
              style={{
                flexShrink: 0,
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "transparent",
                border: "1px solid #1c2836",
                color: "#7a9bb5",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Volver a conversaciones"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}

          <div style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: palette.bg,
            border: "1px solid #1a2838",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 700,
            color: palette.fg,
            letterSpacing: "0.03em",
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "#e8f0f8",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.3,
              letterSpacing: "-0.01em",
            }}>
              {conversation.name ?? conversation.phone}
            </div>
            {conversation.name && (
              <div style={{
                fontSize: 10.5,
                color: "#3d5268",
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                marginTop: 1,
                letterSpacing: "0.02em",
              }}>
                {conversation.phone}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {/* Status widget — only visible on mobile (desktop has its own bar) */}
          <span className="mobile-status-in-header">
            <StatusWidget />
          </span>

          <ModeToggle
            mode={conversation.mode}
            conversationId={conversation.id}
            onToggle={onToggleMode}
          />

          {/* Reset memory — icon+label on desktop, icon-only on mobile */}
          <button
            onClick={() => setShowResetConfirm(true)}
            title="Borrar historial — la IA olvidará todo sobre este cliente"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11.5,
              padding: "5px 10px",
              borderRadius: 7,
              color: "#f59e0b",
              border: "1px solid #3a2a00",
              background: "transparent",
              cursor: "pointer",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#1a1200";
              (e.currentTarget as HTMLElement).style.borderColor = "#6a4a00";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.borderColor = "#3a2a00";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
            </svg>
            <span className="btn-label-hide-mobile">Resetear IA</span>
          </button>

          <button
            onClick={() => setShowConfirm(true)}
            title="Borrar conversación"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11.5,
              padding: "5px 10px",
              borderRadius: 7,
              color: "#ef4444",
              border: "1px solid #3a1818",
              background: "transparent",
              cursor: "pointer",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#1a0808";
              (e.currentTarget as HTMLElement).style.borderColor = "#6a2020";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.borderColor = "#3a1818";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
            <span className="btn-label-hide-mobile">Borrar</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {conversation.mode === "AI" && (
          <div style={{
            textAlign: "center",
            fontSize: 11,
            marginBottom: 14,
            padding: "5px 12px",
            borderRadius: 8,
            background: "color-mix(in srgb, var(--color-primary) 8%, #060a0f)",
            border: "1px solid color-mix(in srgb, var(--color-primary) 15%, #060a0f)",
            color: "var(--color-primary)",
            letterSpacing: "0.02em",
          }}>
            Bot respondiendo automáticamente · modo IA activo
          </div>
        )}
        {messages.length === 0 && (
          <div style={{ textAlign: "center", fontSize: 12.5, marginTop: 40, color: "#3d5268" }}>
            Sin mensajes aún
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        flexShrink: 0,
        padding: "12px 14px",
        borderTop: "1px solid #1c2836",
        background: "#090e14",
      }}>
        {conversation.mode === "HUMAN" ? (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribí tu respuesta... (Enter para enviar)"
              rows={2}
              style={{
                flex: 1,
                resize: "none",
                borderRadius: 9,
                padding: "9px 12px",
                fontSize: 13,
                outline: "none",
                background: "#0d1219",
                color: "#e8f0f8",
                border: "1px solid #1c2836",
                minHeight: 42,
                maxHeight: 120,
                lineHeight: 1.5,
                fontFamily: "inherit",
              }}
              onFocus={(e) => { (e.target as HTMLElement).style.borderColor = "#253a50"; }}
              onBlur={(e) => { (e.target as HTMLElement).style.borderColor = "#1c2836"; }}
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              style={{
                padding: "9px 16px",
                borderRadius: 9,
                fontSize: 12.5,
                fontWeight: 600,
                background: sending || !input.trim()
                  ? "#111a25"
                  : "linear-gradient(140deg, var(--color-primary) 0%, var(--color-accent) 100%)",
                color: sending || !input.trim() ? "#3d5268" : "#04130a",
                border: "none",
                cursor: sending || !input.trim() ? "not-allowed" : "pointer",
                flexShrink: 0,
                boxShadow: sending || !input.trim()
                  ? "none"
                  : "0 3px 12px var(--color-glow)",
                transition: "opacity 0.15s",
              }}
            >
              {sending ? "···" : "Enviar"}
            </button>
          </div>
        ) : (
          <div style={{
            textAlign: "center",
            fontSize: 11.5,
            padding: "7px 0",
            color: "#3d5268",
          }}>
            Cambiá a modo HUMANO para responder manualmente
          </div>
        )}
      </div>

      {/* Reset memory confirm modal */}
      {showResetConfirm && (
        <div style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
          background: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(4px)",
          padding: "0 16px",
        }}>
          <div style={{
            borderRadius: 14,
            padding: "22px",
            width: "100%",
            maxWidth: 320,
            background: "#0d1219",
            border: "1px solid #1c2836",
            boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          }}>
            <h3 style={{ fontWeight: 600, color: "#e8f0f8", marginBottom: 8, fontSize: 14.5 }}>
              ¿Resetear memoria de la IA?
            </h3>
            <p style={{ fontSize: 12.5, marginBottom: 18, color: "#4a6278", lineHeight: 1.55 }}>
              Se borrará todo el historial de mensajes. Sofía olvidará la conversación y arrancará de cero con este cliente.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowResetConfirm(false)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 7,
                  fontSize: 12.5,
                  background: "#111a25",
                  color: "#c0d0e0",
                  border: "1px solid #1c2836",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowResetConfirm(false);
                  onResetMemory(conversation.id);
                }}
                style={{
                  padding: "7px 14px",
                  borderRadius: 7,
                  fontSize: 12.5,
                  fontWeight: 600,
                  background: "#f59e0b",
                  color: "#1a0e00",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Resetear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {showConfirm && (
        <div style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
          background: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(4px)",
          padding: "0 16px",
        }}>
          <div style={{
            borderRadius: 14,
            padding: "22px",
            width: "100%",
            maxWidth: 320,
            background: "#0d1219",
            border: "1px solid #1c2836",
            boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          }}>
            <h3 style={{ fontWeight: 600, color: "#e8f0f8", marginBottom: 8, fontSize: 14.5 }}>
              ¿Borrar conversación?
            </h3>
            <p style={{ fontSize: 12.5, marginBottom: 18, color: "#4a6278", lineHeight: 1.55 }}>
              Se eliminan todos los mensajes. Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 7,
                  fontSize: 12.5,
                  background: "#111a25",
                  color: "#c0d0e0",
                  border: "1px solid #1c2836",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  onDelete(conversation.id);
                }}
                style={{
                  padding: "7px 14px",
                  borderRadius: 7,
                  fontSize: 12.5,
                  fontWeight: 600,
                  background: "#ef4444",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
