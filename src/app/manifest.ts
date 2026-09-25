import type { MetadataRoute } from "next";

// Permet d'installer l'appli sur l'écran d'accueil (Android et iPhone).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chef2Box — Suivi nutrition",
    short_name: "Chef2Box",
    description: "Prêt. Sain. Maîtrisé.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f3ec",
    theme_color: "#1c2e1e",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
