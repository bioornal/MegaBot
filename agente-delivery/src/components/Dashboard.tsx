"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { ConversationWithPreview, Message } from "@/types";
import ConversationList from "./ConversationList";
import ConversationPanel from "./ConversationPanel";
import StatusWidget from "./StatusWidget";

const POLL_INTERVAL_MS = 10_000;

export default function Dashboard() {
  const [conversations, setConversations] = useState<ConversationWithPreview[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const activeIdRef = useRef<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setConversations(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchMessages = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/messages/${id}`, { cache: "no-store" });
      if (res.ok) setMessages(await res.json());
    } catch {
      // silent
    }
  }, []);

  const poll = useCallback(() => {
    if (document.hidden) return;
    fetchConversations();
    if (activeIdRef.current !== null) fetchMessages(activeIdRef.current);
  }, [fetchConversations, fetchMessages]);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  const handleSelectConversation = useCallback(
    (id: number) => {
      activeIdRef.current = id;
      setActiveId(id);
      fetchMessages(id);
    },
    [fetchMessages]
  );

  const handleToggleMode = useCallback(
    async (id: number, mode: "AI" | "HUMAN") => {
      try {
        await fetch(`/api/mode/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        await fetchConversations();
      } catch {
        // silent
      }
    },
    [fetchConversations]
  );

  const handleSendMessage = useCallback(
    async (id: number, content: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/messages/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (res.ok) await fetchMessages(id);
        return res.ok;
      } catch {
        return false;
      }
    },
    [fetchMessages]
  );

  const handleDeleteConversation = useCallback(
    async (id: number) => {
      try {
        await fetch(`/api/conversations/${id}`, { method: "DELETE" });
        if (activeId === id) {
          activeIdRef.current = null;
          setActiveId(null);
          setMessages([]);
        }
        await fetchConversations();
      } catch {
        // silent
      }
    },
    [activeId, fetchConversations]
  );

  const handleResetMemory = useCallback(
    async (id: number) => {
      try {
        await fetch(`/api/messages/${id}`, { method: "DELETE" });
        if (activeId === id) setMessages([]);
        await fetchConversations();
      } catch {
        // silent
      }
    },
    [activeId, fetchConversations]
  );

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div style={{ height: "100vh", padding: "28px 32px", background: "#060a0f" }}>
      <div
        style={{
          display: "flex",
          height: "100%",
          overflow: "hidden",
          borderRadius: 16,
          background: "#0d1219",
          border: "1px solid #1c2836",
          boxShadow:
            "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.025)",
        }}
      >
        {/* Sidebar */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "#090e14",
            borderRight: "1px solid #1c2836",
          }}
        >
          {/* Branding */}
          <div
            style={{
              padding: "18px 20px",
              borderBottom: "1px solid #1c2836",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background:
                    "linear-gradient(140deg, #22d986 0%, #0fa860 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: "0 4px 14px rgba(34,217,134,0.28)",
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#e8f0f8",
                    lineHeight: 1.25,
                  }}
                >
                  Mega Muebles
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#3d5268",
                    lineHeight: 1.4,
                    marginTop: 1,
                  }}
                >
                  {conversations.length > 0
                    ? `${conversations.length} conversacion${conversations.length !== 1 ? "es" : ""}`
                    : "Panel de WhatsApp"}
                </div>
              </div>
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            <ConversationList
              conversations={conversations}
              activeId={activeId}
              onSelect={handleSelectConversation}
            />
          </div>
        </div>

        {/* Main */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "0 20px",
              flexShrink: 0,
              background: "#090e14",
              borderBottom: "1px solid #1c2836",
            }}
          >
            <StatusWidget />
          </div>

          <div style={{ flex: 1, overflow: "hidden" }}>
            {activeConversation ? (
              <ConversationPanel
                conversation={activeConversation}
                messages={messages}
                onToggleMode={handleToggleMode}
                onSendMessage={handleSendMessage}
                onDelete={handleDeleteConversation}
                onResetMemory={handleResetMemory}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    background: "#111a25",
                    border: "1px solid #1c2836",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 4,
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="#2a3e52"
                  >
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                  </svg>
                </div>
                <span style={{ fontSize: 13, color: "#3d5268" }}>
                  Seleccioná una conversación
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
