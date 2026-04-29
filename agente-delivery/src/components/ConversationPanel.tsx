"use client";
import { useState, useRef, useEffect } from "react";
import type { Conversation, Message } from "@/types";
import MessageBubble from "./MessageBubble";
import ModeToggle from "./ModeToggle";

interface Props {
  conversation: Conversation;
  messages: Message[];
  onToggleMode: (id: number, mode: "AI" | "HUMAN") => Promise<void>;
  onSendMessage: (id: number, content: string) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
}

export default function ConversationPanel({
  conversation,
  messages,
  onToggleMode,
  onSendMessage,
  onDelete,
}: Props) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "#1c2128" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: "#30363d" }}
      >
        <div>
          <div className="font-semibold text-white">
            {conversation.name ?? conversation.phone}
          </div>
          <div
            className="text-xs font-mono"
            style={{ color: "#8b949e" }}
          >
            {conversation.phone}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ModeToggle
            mode={conversation.mode}
            conversationId={conversation.id}
            onToggle={onToggleMode}
          />
          <button
            onClick={() => setShowConfirm(true)}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{
              color: "#f85149",
              border: "1px solid #f85149",
              cursor: "pointer",
            }}
          >
            Borrar
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {conversation.mode === "AI" && (
          <div
            className="text-center text-xs mb-3 py-2 rounded"
            style={{ background: "#0d2219", color: "#10b981" }}
          >
            El bot responde automáticamente
          </div>
        )}
        {messages.length === 0 && (
          <div
            className="text-center text-sm mt-8"
            style={{ color: "#8b949e" }}
          >
            Sin mensajes aún
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        className="flex-shrink-0 px-4 py-3 border-t"
        style={{ borderColor: "#30363d" }}
      >
        {conversation.mode === "HUMAN" ? (
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribí tu respuesta... (Enter para enviar, Shift+Enter nueva línea)"
              rows={2}
              className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: "#21262d",
                color: "#e6edf3",
                border: "1px solid #30363d",
              }}
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background:
                  sending || !input.trim() ? "#21262d" : "#10b981",
                color:
                  sending || !input.trim() ? "#8b949e" : "#000",
                cursor:
                  sending || !input.trim() ? "not-allowed" : "pointer",
              }}
            >
              {sending ? "..." : "Enviar"}
            </button>
          </div>
        ) : (
          <div
            className="text-center text-xs py-2"
            style={{ color: "#8b949e" }}
          >
            Cambiá a modo HUMANO para responder manualmente
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.75)" }}
        >
          <div
            className="rounded-xl p-6 w-80"
            style={{
              background: "#161b22",
              border: "1px solid #30363d",
            }}
          >
            <h3 className="font-semibold text-white mb-2">
              ¿Borrar conversación?
            </h3>
            <p className="text-sm mb-4" style={{ color: "#8b949e" }}>
              Se eliminan todos los mensajes. Esta acción no se puede
              deshacer.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-3 py-1.5 rounded text-sm"
                style={{
                  background: "#21262d",
                  color: "#e6edf3",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  onDelete(conversation.id);
                }}
                className="px-3 py-1.5 rounded text-sm font-semibold"
                style={{
                  background: "#f85149",
                  color: "#fff",
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
