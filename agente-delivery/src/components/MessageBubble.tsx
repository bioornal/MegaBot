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
      className={`flex mb-3 ${isUser ? "justify-start" : "justify-end"}`}
    >
      <div
        className="max-w-xs lg:max-w-md px-4 py-2 rounded-2xl"
        style={{
          background: isUser
            ? "#21262d"
            : isAssistant
            ? "#064e3b"
            : "#78350f",
          color: "#e6edf3",
        }}
      >
        {isHuman && (
          <div
            className="text-xs font-semibold mb-1"
            style={{ color: "#f59e0b" }}
          >
            Operador
          </div>
        )}
        <p className="text-sm whitespace-pre-wrap break-words">
          {message.content}
        </p>
        <div
          className="text-xs mt-1 text-right"
          style={{ color: "#8b949e" }}
        >
          {formatTime(message.created_at)}
        </div>
      </div>
    </div>
  );
}
