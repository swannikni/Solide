export interface ProduitCommerce {
  nom: string;
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
  photo_url: string | null;
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

  const p = data.product;
  const nutriments = p.nutriments ?? {};
  // OFF exprime les valeurs "pour 100g" par défaut : c'est la portion de
  // référence affichée, l'utilisateur ajuste ensuite la quantité réelle.
  return {
    nom: p.product_name || p.product_name_fr || "Produit sans nom",
    calories: Math.round(nutriments["energy-kcal_100g"] ?? 0),
    proteines: Math.round((nutriments["proteins_100g"] ?? 0) * 10) / 10,
    glucides: Math.round((nutriments["carbohydrates_100g"] ?? 0) * 10) / 10,
    lipides: Math.round((nutriments["fat_100g"] ?? 0) * 10) / 10,
    photo_url: p.image_front_url || p.image_url || null,
  };
}
