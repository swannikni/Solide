/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
    // Optimiseur d'images désactivé : ferme la faille RCE non authentifiée
    // de l'API d'optimisation d'images sur fichiers AVIF (GHSA-2xp9-vwfh-vxw4)
    // tant que le projet reste sur Next 14.2.x. Les <Image> continuent de
    // fonctionner, simplement sans redimensionnement serveur.
    unoptimized: true,
  },
};

export default nextConfig;
