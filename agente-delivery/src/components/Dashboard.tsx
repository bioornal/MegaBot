"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { ConversationWithPreview, Message } from "@/types";
import ConversationList from "./ConversationList";
import ConversationPanel from "./ConversationPanel";
import StatusWidget from './StatusWidget';

export default function Dashboard() {
  const [conversations, setConversations] = useState<
    ConversationWithPreview[]
  >([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const activeIdRef = useRef<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) setConversations(await res.json());
    } catch {
      // silent — polling retry en 3s
    }
  }, []);

  const fetchMessages = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/messages/${id}`);
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
    intervalRef.current = setInterval(poll, 3000);
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
        // silent — UI will reflect real state on next poll
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
        // silent — UI reflects real state on next poll
      }
    },
    [activeId, fetchConversations]
  );

  const activeConversation =
    conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div className="flex h-screen" style={{ background: "#0f1117" }}>
      {/* Top header */}
      <div
        className="fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-4 z-10"
        style={{
          background: "#161b22",
          borderBottom: "1px solid #30363d",
        }}
      >
        <span className="font-semibold text-white text-sm">
          Mega Muebles & Sommiers — Dashboard WhatsApp
        </span>
        <StatusWidget />
      </div>

      {/* Body below header */}
      <div className="flex w-full pt-12">
        {/* Sidebar */}
        <div
          className="w-72 flex-shrink-0 overflow-y-auto"
          style={{
            background: "#161b22",
            borderRight: "1px solid #30363d",
          }}
        >
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelectConversation}
          />
        </div>

        {/* Main panel */}
        <div className="flex-1 overflow-hidden">
          {activeConversation ? (
            <ConversationPanel
              conversation={activeConversation}
              messages={messages}
              onToggleMode={handleToggleMode}
              onSendMessage={handleSendMessage}
              onDelete={handleDeleteConversation}
            />
          ) : (
            <div
              className="flex items-center justify-center h-full text-sm"
              style={{ color: "#8b949e" }}
            >
              Seleccioná una conversación para ver los mensajes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
