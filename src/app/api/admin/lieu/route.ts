import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lireCoordonnees, separerLien } from "@/lib/tournees";

// Position d'une adresse de livraison, pour l'admin. ?texte=… accepte :
//  - des coordonnées ou un lien Google Maps, Waze, Plans (Apple), position WhatsApp,
//    y compris les liens courts (suivis jusqu'à l'adresse complète) ;
//  - une adresse écrite, cherchée sur OpenStreetMap autour de Marrakech.

export const dynamic = "force-dynamic";

const erreur = (message: string, status: number) => NextResponse.json({ erreur: message }, { status });

// Seuls les liens de cartes sont suivis (pas d'appel vers n'importe quel site).
const HOTES =
  /^(maps\.app\.goo\.gl|goo\.gl|share\.google|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+|(www\.)?waze\.com|maps\.apple\.com|maps\.apple|apple\.co)$/;

async function verifierAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("application_clients").select("est_admin").eq("id", user.id).single();
  return !!data?.est_admin;
}

// Recherche OpenStreetMap : d'abord dans Marrakech et environs, puis au Maroc.
async function chercherAdresse(adresse: string) {
  for (const limite of [true, false]) {
    const params = new URLSearchParams({
      q: adresse.slice(0, 200),
      format: "json",
      limit: "1",
      countrycodes: "ma",
      viewbox: "-8.20,31.80,-7.80,31.50",
      bounded: limite ? "1" : "0",
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "Chef2BoxAppli/1.0 (hello@chef2box.com)", "Accept-Language": "fr" },
      next: { revalidate: 86400 },
    }).catch(() => null);
    const resultats = (await res?.json().catch(() => null)) as { lat: string; lon: string; display_name: string }[] | null;
    const r = resultats?.[0];
    if (r) return { lat: Number(r.lat), lng: Number(r.lon), libelle: r.display_name };
  }
  return null;
}

// Coordonnées dans la page d'un lieu (Google : image de carte « center=lat%2Clng »,
// vue « @lat,lng », état initial [[[zoom,lng,lat]]) quand l'adresse n'en a pas.
function coordonneesDansPage(html: string) {
  const motifs: [RegExp, boolean][] = [
    [/center=(-?\d{1,2}\.\d+)(?:%2C|,)(-?\d{1,3}\.\d+)/, false],
    [/@(-?\d{1,2}\.\d{3,}),(-?\d{1,3}\.\d{3,}),\d/, false],
    [/APP_INITIALIZATION_STATE=\[\[\[[\d.]+,(-?\d{1,3}\.\d+),(-?\d{1,2}\.\d+)\]/, true],
    // Fiche d'un lieu dans les résultats Google : [null,null,lat,lng]
    [/\[null,null,(-?\d{1,2}\.\d{4,}),(-?\d{1,3}\.\d{4,})\]/, false],
  ];
  for (const [motif, inverse] of motifs) {
    const r = html.match(motif);
    if (r) {
      const [a, b] = [Number(r[1]), Number(r[2])];
      const [lat, lng] = inverse ? [b, a] : [a, b];
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) return { lat, lng };
    }
  }
  return null;
}

// Nom ou adresse lisible dans un lien sans coordonnées (?q=, ?address=, /place/…/).
function adresseDansLien(url: URL) {
  for (const cle of ["address", "q", "query", "name", "daddr", "destination"]) {
    const v = url.searchParams.get(cle);
    if (v && !lireCoordonnees(v)) return v;
  }
  const place = url.pathname.match(/\/place\/([^/]+)/);
  return place ? decodeURIComponent(place[1].replace(/\+/g, " ")) : null;
}

export async function GET(request: NextRequest) {
  if (!(await verifierAdmin())) return erreur("Réservé à l'admin.", 403);
  const texte = (request.nextUrl.searchParams.get("texte") ?? "").trim().slice(0, 500);
  if (texte.length < 3) return erreur("Collez une adresse ou un lien.", 400);

  const direct = lireCoordonnees(texte);
  if (direct) return NextResponse.json(direct);

  // Texte partagé « Nom du lieu, adresse + lien » : le lien d'abord, le nom en secours.
  const { lien, texte: nomLieu } = separerLien(texte);
  if (lien) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(lien) ? lien : `https://${lien}`);
    } catch {
      return erreur("Lien invalide.", 400);
    }
    // Liens courts : on suit les redirections jusqu'à l'adresse complète,
    // puis on lit la page du lieu si l'adresse ne contient pas la position.
    const entetes = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Accept-Language": "fr-FR,fr;q=0.9",
      Cookie: "CONSENT=YES+cb", // évite la page de consentement de Google
    };
    for (let saut = 0; saut < 6; saut++) {
      const point = lireCoordonnees(url.toString());
      if (point) return NextResponse.json(point);
      if (url.protocol !== "https:" || !HOTES.test(url.hostname)) break;
      const res = await fetch(url, { redirect: "manual", headers: entetes }).catch(() => null);
      if (!res) break;
      const suivante = res.headers.get("location");
      if (suivante) {
        url = new URL(suivante, url);
        continue;
      }
      if (res.ok) {
        const html = (await res.text().catch(() => "")).slice(0, 600_000);
        const point = coordonneesDansPage(html) ?? lireCoordonnees(html.match(/https:\/\/[^"'\s]*(?:maps|waze)[^"'\s]*/)?.[0] ?? "");
        if (point) return NextResponse.json(point);
        // Redirection écrite dans la page (meta refresh / lien canonique).
        const meta = html.match(/(?:http-equiv="refresh"[^>]*url=|rel="canonical" href=")([^"'>]+)/i)?.[1];
        if (meta) {
          url = new URL(meta.replace(/&amp;/g, "&"), url);
          continue;
        }
      }
      break;
    }
    // Pas de coordonnées dans le lien : on cherche le lieu par son nom.
    for (const nom of [adresseDansLien(url), nomLieu].filter((n): n is string => !!n && n.length >= 3)) {
      const trouve = await chercherAdresse(nom);
      if (trouve) return NextResponse.json(trouve);
    }
    return erreur("Position introuvable dans ce lien : placez l'adresse sur la carte (bouton carte), ou demandez la position WhatsApp.", 404);
  }

  const trouve = await chercherAdresse(texte);
  if (trouve) return NextResponse.json(trouve);
  return erreur("Adresse introuvable : placez-la sur la carte (bouton carte), ou collez un lien Google Maps, Waze ou une position WhatsApp.", 404);
}
