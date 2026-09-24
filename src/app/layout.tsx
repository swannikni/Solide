import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chef2Box - Suivi",
  description: "Prêt. Sain. Maîtrisé.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
