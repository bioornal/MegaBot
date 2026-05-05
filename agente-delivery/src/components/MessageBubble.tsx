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
    <div style={{
      display: "flex",
      marginBottom: 4,
      justifyContent: isUser ? "flex-start" : "flex-end",
    }}>
      <div style={{
        maxWidth: "72%",
        padding: "3px 7px 2px",
        borderRadius: isUser ? "3px 10px 10px 10px" : "10px 3px 10px 10px",
        background: isUser ? "#101e2d" : isAssistant ? "#0b2a1e" : "#231400",
        border: `1px solid ${isUser ? "#1a2e44" : isAssistant ? "#183f2c" : "#523508"}`,
        color: "#e8f0f8",
      }}>
        {isHuman && (
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            marginBottom: 2,
            color: "#f59e0b",
            letterSpacing: "0.07em",
          }}>
            OPERADOR
          </div>
        )}
        {isAssistant && (
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            marginBottom: 2,
            color: "#22d986",
            letterSpacing: "0.07em",
          }}>
            SOFÍA
          </div>
        )}
        <p style={{
          fontSize: 12.5,
          lineHeight: 1.45,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {message.content}
        </p>
        <div style={{
          fontSize: 9.5,
          marginTop: 2,
          textAlign: "right",
          color: "#4a6a80",
          fontFamily: "var(--font-mono, monospace)",
        }}>
          {formatTime(message.created_at)}
        </div>
      </div>
    </div>
  );
}
