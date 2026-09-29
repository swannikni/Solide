// En-têtes de sécurité envoyés avec chaque page.
const ENTETES_SECURITE = [
  // Interdit d'afficher l'appli dans un cadre sur un autre site (anti-clickjacking).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Caméra (scanner) et position (bouton ⊕ des livraisons) autorisées, le reste coupé.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// Clés publiques de signature des jetons de connexion (Supabase), lues une
// fois à la mise en ligne : la connexion est vérifiée sur place à chaque page,
// sans les retélécharger (~0,5 s gagnée à chaque démarrage du serveur). Si
// elles changent ou ne sont pas lisibles ici, l'appli les télécharge elle-même.
async function clesDeConnexion() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "";
  try {
    const res = await fetch(`${url}/auth/v1/.well-known/jwks.json`, { signal: AbortSignal.timeout(5000) });
    const jwks = await res.json();
    return Array.isArray(jwks?.keys) && jwks.keys.length ? JSON.stringify(jwks.keys) : "";
  } catch {
    return "";
  }
}
const SUPABASE_JWKS = await clesDeConnexion();

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  env: { SUPABASE_JWKS },
  // Un onglet déjà visité s'affiche tout de suite pendant 30 s au lieu d'être
  // redemandé au serveur (les ajouts de repas rafraîchissent quand même).
  experimental: {
    staleTimes: { dynamic: 30 },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
    // Optimiseur d'images désactivé : moins de surface d'attaque (plusieurs
    // failles passées de Next.js visaient cette API) et pas de coût serveur.
    // Les <Image> fonctionnent, simplement sans redimensionnement serveur.
    unoptimized: true,
  },
  async headers() {
    return [
      { source: "/:path*", headers: ENTETES_SECURITE },
      // Le service worker doit toujours être relu pour prendre les mises à jour.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
