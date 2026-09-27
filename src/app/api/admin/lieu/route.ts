import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lireCoordonnees } from "@/lib/tournees";

// Position d'une adresse de livraison, pour l'admin :
//  - ?lien=… : lien Google Maps court (maps.app.goo.gl) → coordonnées ;
//  - ?adresse=… : recherche de l'adresse sur OpenStreetMap, autour de Marrakech.

export const dynamic = "force-dynamic";

const erreur = (message: string, status: number) => NextResponse.json({ erreur: message }, { status });

// Seuls les liens Google Maps sont suivis (pas d'appel vers n'importe quel site).
const HOTES = /^(maps\.app\.goo\.gl|goo\.gl|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+)$/;

async function verifierAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("application_clients").select("est_admin").eq("id", user.id).single();
  return !!data?.est_admin;
}

export async function GET(request: NextRequest) {
  if (!(await verifierAdmin())) return erreur("Réservé à l'admin.", 403);
  const lien = request.nextUrl.searchParams.get("lien");
  const adresse = request.nextUrl.searchParams.get("adresse");

  if (lien) {
    let url: URL;
    try {
      url = new URL(lien.trim());
    } catch {
      return erreur("Lien invalide.", 400);
    }
    // Liens courts : on suit les redirections (3 au plus) jusqu'à l'adresse complète.
    for (let saut = 0; saut < 4; saut++) {
      const point = lireCoordonnees(url.toString());
      if (point) return NextResponse.json(point);
      if (url.protocol !== "https:" || !HOTES.test(url.hostname)) break;
      const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } }).catch(() => null);
      const suivante = res?.headers.get("location");
      if (!suivante) break;
      url = new URL(suivante, url);
    }
    return erreur("Position introuvable dans ce lien. Ouvrez le lieu dans Google Maps et copiez le lien de partage.", 404);
  }

  if (adresse && adresse.trim().length >= 3) {
    const params = new URLSearchParams({
      q: adresse.trim().slice(0, 200),
      format: "json",
      limit: "1",
      countrycodes: "ma",
      // Priorité à Marrakech et ses environs.
      viewbox: "-8.20,31.80,-7.80,31.50",
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "Chef2BoxAppli/1.0 (hello@chef2box.com)", "Accept-Language": "fr" },
      next: { revalidate: 86400 },
    }).catch(() => null);
    const resultats = (await res?.json().catch(() => null)) as { lat: string; lon: string; display_name: string }[] | null;
    const r = resultats?.[0];
    if (!r) return erreur("Adresse introuvable sur la carte. Collez plutôt un lien Google Maps.", 404);
    return NextResponse.json({ lat: Number(r.lat), lng: Number(r.lon), libelle: r.display_name });
  }

  return erreur("Indiquez un lien ou une adresse.", 400);
}
