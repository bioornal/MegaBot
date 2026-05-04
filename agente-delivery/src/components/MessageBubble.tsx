import type { Message } from "@/types";

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isHuman = message.role === "human";

  return (
    <div
      style={{
        display: "flex",
        marginBottom: 10,
        justifyContent: isUser ? "flex-start" : "flex-end",
      }}
    >
      <div
        style={{
          maxWidth: "72%",
          padding: "10px 14px 8px",
          borderRadius: isUser
            ? "4px 14px 14px 14px"
            : "14px 4px 14px 14px",
          background: isUser
            ? "#111e2c"
            : isAssistant
            ? "#0c2a1e"
            : "#251600",
          border: `1px solid ${
            isUser ? "#1e3045" : isAssistant ? "#1a4530" : "#5a3a0a"
          }`,
          color: "#e8f0f8",
        }}
      >
        {isHuman && (
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              marginBottom: 5,
              color: "#f59e0b",
              letterSpacing: "0.06em",
            }}
          >
            OPERADOR
          </div>
        )}
        {isAssistant && (
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              marginBottom: 5,
              color: "#22d986",
              letterSpacing: "0.06em",
            }}
          >
            MEGABOT
          </div>
        )}
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {message.content}
        </p>
        <div
          style={{
            fontSize: 10.5,
            marginTop: 5,
            textAlign: "right",
            color: "#2e4258",
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
          {formatTime(message.created_at)}
        </div>
      </div>
    </div>
  );
}
