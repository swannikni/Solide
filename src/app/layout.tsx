import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chef2Box Appli",
  description: "Prêt. Sain. Maîtrisé.",
  applicationName: "Chef2Box",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // Ouverte depuis l'écran d'accueil de l'iPhone : plein écran, sans barre Safari.
  appleWebApp: { capable: true, title: "Chef2Box", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

// maximumScale : empêche Safari iOS de zoomer (et de rester zoomé) quand on
// touche un champ de saisie ; le zoom manuel au pincement reste possible.
export const viewport: Viewport = {
  themeColor: "#1c2e1e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=DM+Serif+Display:ital@0;1&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
