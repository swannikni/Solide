export interface ProduitCommerce {
  nom: string;
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
  photo_url: string | null;
}

interface ProduitOFF {
  product_name?: string;
  product_name_fr?: string;
  brands?: string;
  nutriments?: Record<string, number | undefined>;
  image_front_url?: string;
  image_url?: string;
  image_front_small_url?: string;
}

function versProduitCommerce(p: ProduitOFF): ProduitCommerce {
  const n = p.nutriments ?? {};
  const arrondi = (v: number | undefined) => Math.round((v ?? 0) * 10) / 10;
  return {
    nom: p.product_name_fr || p.product_name || "Produit sans nom",
    calories: Math.round(n["energy-kcal_100g"] ?? 0),
    proteines: arrondi(n["proteins_100g"]),
    glucides: arrondi(n["carbohydrates_100g"]),
    lipides: arrondi(n["fat_100g"]),
    photo_url: p.image_front_small_url || p.image_front_url || p.image_url || null,
  };
}

// Recherche par nom dans les produits de marque. L'API de recherche Open
// Food Facts est limitée (~10 requêtes/minute) : à déclencher sur action de
// l'utilisateur, pas à chaque frappe.
export async function rechercherProduitsParNom(recherche: string): Promise<(ProduitCommerce & { marque: string })[]> {
  const params = new URLSearchParams({
    search_terms: recherche,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "20",
    fields: "product_name,product_name_fr,brands,nutriments,image_front_small_url",
  });
  const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.products ?? []) as ProduitOFF[])
    .filter((p) => p.nutriments?.["energy-kcal_100g"] != null && (p.product_name_fr || p.product_name))
    .map((p) => ({ ...versProduitCommerce(p), marque: p.brands?.split(",")[0]?.trim() ?? "" }));
}

// Open Food Facts : base publique de produits du commerce par code-barres,
// pas de clé API requise. Appelé depuis le navigateur du client, donc pas
// concerné par les restrictions réseau d'un environnement de build.
export async function chercherProduitParCodeBarres(
  codeBarres: string
): Promise<ProduitCommerce | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(codeBarres)}.json`
  );
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  // Valeurs "pour 100 g" : l'utilisateur ajuste ensuite la quantité réelle.
  return versProduitCommerce(data.product as ProduitOFF);
}
