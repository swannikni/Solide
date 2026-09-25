import { NextResponse, type NextRequest } from "next/server";

// Relais vers la recherche Open Food Facts : l'API search.openfoodfacts.org
// ne renvoie pas d'en-tête CORS, elle ne peut pas être appelée depuis le
// navigateur. Les produits vendus au Maroc sont remontés en premier.

const API = "https://search.openfoodfacts.org/search";
const CHAMPS = "code,product_name,product_name_fr,brands,countries_tags,nutriments,image_front_small_url";

interface Hit {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  brands?: string[] | string;
  countries_tags?: string[];
  nutriments?: Record<string, number | undefined>;
  image_front_small_url?: string;
}

async function chercher(q: string, taille: number): Promise<Hit[]> {
  const params = new URLSearchParams({ q, langs: "fr", page_size: String(taille), fields: CHAMPS });
  const res = await fetch(`${API}?${params}`, {
    headers: { "User-Agent": "Chef2BoxAppli/1.0 (hello@chef2box.com)" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.hits ?? []) as Hit[];
}

const arrondi = (v: number | undefined) => Math.round((v ?? 0) * 10) / 10;

export async function GET(request: NextRequest) {
  // Guillemets et ":" retirés : la saisie ne doit pas casser le filtre pays.
  const termes = (request.nextUrl.searchParams.get("q") ?? "").replace(/["':\\]/g, " ").trim().slice(0, 80);
  if (termes.length < 2) return NextResponse.json([]);

  const [maroc, monde] = await Promise.all([
    chercher(`${termes} countries_tags:"en:morocco"`, 15).catch(() => []),
    chercher(termes, 25).catch(() => []),
  ]);

  const vus = new Set<string>();
  const produits = [];
  for (const hit of [...maroc, ...monde]) {
    const nom = (hit.product_name_fr || hit.product_name || "").trim();
    const kcal = hit.nutriments?.["energy-kcal_100g"];
    const cle = hit.code || nom.toLowerCase();
    if (!nom || kcal == null || vus.has(cle)) continue;
    vus.add(cle);
    const marque = (Array.isArray(hit.brands) ? hit.brands[0] : hit.brands?.split(",")[0])?.trim() ?? "";
    produits.push({
      nom,
      marque,
      maroc: hit.countries_tags?.includes("en:morocco") ?? false,
      calories: Math.round(kcal),
      proteines: arrondi(hit.nutriments?.["proteins_100g"]),
      glucides: arrondi(hit.nutriments?.["carbohydrates_100g"]),
      lipides: arrondi(hit.nutriments?.["fat_100g"]),
      photo_url: hit.image_front_small_url ?? null,
    });
    if (produits.length >= 25) break;
  }

  return NextResponse.json(produits, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
