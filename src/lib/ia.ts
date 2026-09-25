import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Garde-fous sur l'IA : chaque appel est d'abord réservé en base
// (application_reserver_ia), qui refuse au-delà de la limite du jour du
// client, du plafond global et en cas de rafale. Le compteur n'est pas
// modifiable par le client.

export type TypeIA = "assistant" | "etiquette" | "plat";

export const MODELE_VISION = "claude-haiku-4-5";

const MESSAGES: Record<string, (type: TypeIA) => string> = {
  limite_jour: (type) =>
    type === "assistant"
      ? "Vous avez atteint la limite de questions pour aujourd'hui. À demain !"
      : "Vous avez utilisé toutes vos analyses photo pour aujourd'hui. À demain ! En attendant, la recherche par nom marche toujours.",
  limite_globale: () => "L'IA est très demandée aujourd'hui, réessayez demain. La recherche par nom marche toujours.",
  trop_rapide: () => "Une analyse est déjà en cours, patientez quelques secondes.",
};

export type Reservation = { ok: true; id: number; restant: number } | { ok: false; message: string; status: number };

export async function reserverIA(supabase: SupabaseClient, type: TypeIA): Promise<Reservation> {
  const { data, error } = await supabase.rpc("application_reserver_ia", { p_type: type });
  if (error) {
    const cle = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    return cle
      ? { ok: false, message: MESSAGES[cle](type), status: 429 }
      : { ok: false, message: "Service indisponible, réessayez.", status: 500 };
  }
  const r = data as { id: number; restant: number };
  return { ok: true, id: r.id, restant: r.restant };
}

// L'appel à l'IA a échoué de notre côté : on rend l'essai au client (seulement
// si la clé de service est configurée ; le client ne peut pas le faire lui-même).
export async function rembourserIA(id: number) {
  await createAdminClient()?.from("application_usage_ia").delete().eq("id", id);
}

// Photo envoyée par le navigateur (déjà réduite à ~1024 px) en data URL.
const TYPES_IMAGE = ["image/jpeg", "image/png", "image/webp"] as const;
type TypeImage = (typeof TYPES_IMAGE)[number];
const TAILLE_MAX_BASE64 = 2_000_000; // ~1,5 Mo

export function lireImage(valeur: unknown): { type: TypeImage; donnees: string } | null {
  if (typeof valeur !== "string" || valeur.length > TAILLE_MAX_BASE64) return null;
  const m = valeur.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m || !TYPES_IMAGE.includes(m[1] as TypeImage)) return null;
  return { type: m[1] as TypeImage, donnees: m[2] };
}

export const nombre = (v: unknown, max: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n * 10) / 10, 0), max) : 0;
};
