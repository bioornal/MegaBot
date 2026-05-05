"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface StatusData {
  status: "connecting" | "connected" | "disconnected" | "waiting_qr" | "error";
  provider: string;
  qr?: string | null;
  error?: string;
}

const STATUS_POLL_INTERVAL_MS = 10_000;

const STATUS_CONFIG = {
  connected: { color: "var(--color-primary)", label: "Conectado" },
  connecting: { color: "#f59e0b", label: "Conectando..." },
  waiting_qr: { color: "#3b82f6", label: "Esperando QR" },
  disconnected: { color: "#ef4444", label: "Desconectado" },
  error: { color: "#ef4444", label: "Error" },
} as const;

export default function StatusWidget() {
  const [data, setData] = useState<StatusData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (res.ok && !cancelled) setData(await res.json());
      } catch {
        // silent
      }
    }

    poll();
    const id = setInterval(poll, STATUS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (data?.qr) {
      QRCode.toDataURL(data.qr, { width: 220, margin: 2 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(null));
    } else {
      setQrDataUrl(null);
      setShowQr(false);
    }
  }, [data?.qr]);

  if (!data) return null;

  const cfg = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.disconnected;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => data.status === "waiting_qr" && setShowQr((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          background: "#111a25",
          border: "1px solid #1c2836",
          borderRadius: 8,
          cursor: data.status === "waiting_qr" ? "pointer" : "default",
          padding: "6px 11px",
        }}
        title={data.status === "waiting_qr" ? "Click para ver el QR" : undefined}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: cfg.color,
            display: "inline-block",
            flexShrink: 0,
            boxShadow: `0 0 6px ${cfg.color}88`,
          }}
        />
        <span
          style={{
            color: cfg.color,
            fontSize: 12,
            whiteSpace: "nowrap",
            fontWeight: 500,
          }}
        >
          {cfg.label}
          {data.provider && ` · ${data.provider}`}
          {data.status === "waiting_qr" && " (click para QR)"}
        </span>
      </button>

      {showQr && qrDataUrl && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 8,
            background: "#0d1219",
            border: "1px solid #1c2836",
            borderRadius: 12,
            padding: 14,
            zIndex: 50,
            boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
          }}
        >
          <p
            style={{
              color: "#3d5268",
              fontSize: 11,
              marginBottom: 10,
              textAlign: "center",
            }}
          >
            Escaneá con WhatsApp → Dispositivos vinculados
          </p>
          <img
            src={qrDataUrl}
            alt="QR WhatsApp"
            style={{ display: "block", borderRadius: 6 }}
          />
          <p
            style={{
              color: "#2e4258",
              fontSize: 10,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            El QR se actualiza cada ~20s
          </p>
        </div>
      )}
    </div>
  );
}
