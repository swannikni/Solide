import type { SupabaseClient } from "@supabase/supabase-js";

// Les photos de repas sont privées : la base garde le chemin du fichier
// (ou, pour les anciennes, son ancienne adresse publique) et on fabrique à
// chaque affichage un lien signé valable 1 heure.
export const BUCKET_PHOTOS = "application-repas-photos";
const MARQUEUR = `/${BUCKET_PHOTOS}/`;

export function cheminPhoto(valeur: string): string {
  const i = valeur.indexOf(MARQUEUR);
  return i >= 0 ? decodeURIComponent(valeur.slice(i + MARQUEUR.length).split("?")[0]) : valeur;
}

export async function signerPhotos<T extends { photo_url: string | null }>(
  supabase: SupabaseClient,
  lignes: T[]
): Promise<T[]> {
  const chemins = Array.from(new Set(lignes.filter((l) => l.photo_url).map((l) => cheminPhoto(l.photo_url!))));
  if (chemins.length === 0) return lignes;
  const { data } = await supabase.storage.from(BUCKET_PHOTOS).createSignedUrls(chemins, 3600);
  const liens = new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  return lignes.map((l) =>
    l.photo_url ? { ...l, photo_url: liens.get(cheminPhoto(l.photo_url)) ?? null } : l
  );
}
