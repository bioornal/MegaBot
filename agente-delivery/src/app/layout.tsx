import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mega Muebles & Sommiers — Dashboard WhatsApp",
  description: "Panel de operador para gestión de conversaciones de WhatsApp",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
