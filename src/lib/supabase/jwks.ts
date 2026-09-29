import type { JWK } from "@supabase/supabase-js";

// Clés publiques de signature des jetons, lues à la mise en ligne (voir
// next.config.mjs). getClaims les utilise sans rien télécharger ; si une clé
// manque (rotation), il la télécharge lui-même.
function lire(): { keys: JWK[] } | undefined {
  try {
    const keys = JSON.parse(process.env.SUPABASE_JWKS || "[]") as JWK[];
    return keys.length ? { keys } : undefined;
  } catch {
    return undefined;
  }
}

export const JWKS = lire();
