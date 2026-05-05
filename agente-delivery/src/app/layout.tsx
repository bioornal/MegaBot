import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { getSessionTenant } from "@/lib/tenant";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bot Dashboard",
  description: "Panel de operador para gestión de conversaciones de WhatsApp",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await getSessionTenant();
  const theme = {
    '--color-primary': tenant?.theme.primary ?? '#64748b',
    '--color-accent':  tenant?.theme.accent  ?? '#475569',
    '--color-bg':      tenant?.theme.bg      ?? '#060a0f',
    '--color-surface': tenant?.theme.surface ?? '#0d1219',
    '--color-border':  tenant?.theme.border  ?? '#1c2836',
    '--color-muted':   tenant?.theme.textMuted ?? '#3d5268',
    '--color-glow':    tenant?.theme.glow    ?? 'rgba(100,116,139,0.18)',
  };

  return (
    <html lang="es" className={`${sans.variable} ${mono.variable}`} style={theme as React.CSSProperties}>
      <body>{children}</body>
    </html>
  );
}
