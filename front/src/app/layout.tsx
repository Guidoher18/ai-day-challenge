import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Suplente digital",
  description: "Cliente de prueba para el suplente digital",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
