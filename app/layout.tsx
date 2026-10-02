import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Qualité de l'air — Alertes Météo",
  description: "Indice ATMO par département, aujourd'hui et demain. Source : Atmo France.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
