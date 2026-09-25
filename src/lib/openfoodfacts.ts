import { portionDepuisTexte, type PortionUsuelle } from "@/lib/portions";

export interface ProduitCommerce {
  nom: string;
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
  photo_url: string | null;
  // Portion indiquée par le fabricant (« 1 pot, 125 g »), ou l'emballage s'il est petit.
  portion?: PortionUsuelle | null;
}

interface ChampsPortion {
  serving_size?: string;
  serving_quantity?: number | string;
  quantity?: string;
  product_quantity?: number | string;
}

export function portionDuProduit(p: ChampsPortion): PortionUsuelle | null {
  const parPortion = portionDepuisTexte(p.serving_size, Number(p.serving_quantity) || null);
  if (parPortion) return parPortion;
  // Sinon l'emballage entier s'il est petit (canette 33 cl, barre 45 g...).
  const emballage = portionDepuisTexte(p.quantity, Number(p.product_quantity) || null);
  return emballage && emballage.grammes <= 500 ? { ...emballage, libelle: "1 emballage" } : null;
}

interface ProduitOFF extends ChampsPortion {
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
    portion: portionDuProduit(p),
  };
}

export interface ProduitMarque extends ProduitCommerce {
  marque: string;
  maroc: boolean;
}

// Produits de marque via le relais /api/produits (Maroc en premier).
export async function rechercherProduitsParNom(recherche: string, signal?: AbortSignal): Promise<ProduitMarque[]> {
  const res = await fetch(`/api/produits?q=${encodeURIComponent(recherche)}`, { signal });
  if (!res.ok) return [];
  return (await res.json()) as ProduitMarque[];
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
