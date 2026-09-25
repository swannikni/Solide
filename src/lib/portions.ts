// Portions du quotidien pour les aliments au poids (valeurs pour 100 g) :
// « 1 œuf », « 1 c. à soupe »… au lieu de deviner les grammes.
// Poids moyens (parties comestibles), arrondis.

export interface PortionUsuelle {
  libelle: string;
  grammes: number; // pour une boisson : millilitres (1 ml ≈ 1 g)
  ml?: boolean;
}

const ml = (libelle: string, quantite: number): PortionUsuelle => ({ libelle, grammes: quantite, ml: true });

// Chaque motif est ancré au début du nom (« Oeuf, cuit dur », « Poulet, filet ») :
// « Brick à l'oeuf » ou « Tajine de poulet » ne reçoivent pas la portion d'un œuf
// ou d'un filet. Les plus précis d'abord (« huile d'olive » avant « olive »).
const REGLES: { motif: RegExp; portions: PortionUsuelle[] }[] = [
  { motif: /^huile/, portions: [{ libelle: "1 c. à café", grammes: 4 }, { libelle: "1 c. à soupe", grammes: 10 }] },
  // Boissons : au verre, à la tasse, à la canette (valeurs en ml).
  // Boissons café du commerce : le mot peut être n'importe où (« Ice caramel latte »).
  { motif: /(^| )(latte|cappuccino|macchiato|mocha|moka|frappe|frappuccino|flat white)\b/, portions: [ml("1 gobelet", 250), ml("1 grand gobelet", 400)] },
  { motif: /^cafe\b.*\bsoluble/, portions: [{ libelle: "1 c. à café", grammes: 2 }] },
  { motif: /^cafe\b.*\b(moulu|grain)/, portions: [{ libelle: "1 dose", grammes: 7 }] },
  { motif: /^(cafe|expresso|espresso)\b/, portions: [ml("1 expresso", 40), ml("1 tasse", 150), ml("1 mug", 250)] },
  { motif: /(ice ?tea|iced tea|the glace)/, portions: [ml("1 canette", 330), ml("1 bouteille", 500)] },
  { motif: /^(the|infusion|tisane)\b/, portions: [ml("1 tasse", 250)] },
  { motif: /^(cola|soda|limonade|boisson gazeuse|coca|fanta|sprite|schweppes|orangina|tonic|oasis|red ?bull|boisson energisante)/, portions: [ml("1 canette", 330), ml("1 bouteille", 500)] },
  { motif: /^eau\b/, portions: [ml("1 verre", 250), ml("1 bouteille", 500)] },
  { motif: /^(biere|cidre)\b/, portions: [ml("1 demi", 250), ml("1 canette", 330)] },
  { motif: /^vin\b/, portions: [ml("1 verre", 125)] },
  { motif: /^(soupe|veloute|potage)\b/, portions: [ml("1 bol", 250)] },
  { motif: /^(boisson|smoothie|nectar)\b/, portions: [ml("1 verre", 250)] },
  { motif: /^oeufs?\b/, portions: [{ libelle: "1 œuf", grammes: 55 }, { libelle: "2 œufs", grammes: 110 }] },
  { motif: /^banane/, portions: [{ libelle: "1 banane", grammes: 120 }] },
  { motif: /^croissant/, portions: [{ libelle: "1 croissant", grammes: 45 }] },
  { motif: /^pain au chocolat|^chocolatine/, portions: [{ libelle: "1 pain au chocolat", grammes: 65 }] },
  { motif: /^pain au lait/, portions: [{ libelle: "1 pain au lait", grammes: 35 }] },
  { motif: /^brioche/, portions: [{ libelle: "1 tranche", grammes: 35 }] },
  { motif: /^madeleine/, portions: [{ libelle: "1 madeleine", grammes: 25 }] },
  { motif: /^(cookie|muffin)/, portions: [{ libelle: "1 pièce", grammes: 60 }] },
  { motif: /^crepe/, portions: [{ libelle: "1 crêpe", grammes: 60 }] },
  { motif: /^msemen|^m.?semen|^harcha|^baghrir/, portions: [{ libelle: "1 pièce", grammes: 80 }] },
  { motif: /^petit.suisse/, portions: [{ libelle: "1 pot", grammes: 60 }] },
  { motif: /^jambon/, portions: [{ libelle: "1 tranche", grammes: 40 }] },
  { motif: /^(saucisse|merguez)/, portions: [{ libelle: "1 saucisse", grammes: 50 }] },
  { motif: /^pizza/, portions: [{ libelle: "1 part", grammes: 150 }, { libelle: "1 pizza", grammes: 400 }] },
  { motif: /^(pommes? de terre|patate)/, portions: [{ libelle: "1 moyenne", grammes: 150 }] },
  { motif: /^pomme\b/, portions: [{ libelle: "1 pomme", grammes: 150 }] },
  { motif: /^poire\b/, portions: [{ libelle: "1 poire", grammes: 150 }] },
  { motif: /^orange\b/, portions: [{ libelle: "1 orange", grammes: 150 }] },
  { motif: /^(clementine|mandarine)/, portions: [{ libelle: "1 clémentine", grammes: 60 }] },
  { motif: /^kiwi/, portions: [{ libelle: "1 kiwi", grammes: 75 }] },
  { motif: /^(peche|nectarine)\b/, portions: [{ libelle: "1 pêche", grammes: 130 }] },
  { motif: /^abricot/, portions: [{ libelle: "1 abricot", grammes: 40 }] },
  { motif: /^dattes?\b/, portions: [{ libelle: "1 datte", grammes: 8 }, { libelle: "3 dattes", grammes: 24 }] },
  { motif: /^figue/, portions: [{ libelle: "1 figue", grammes: 50 }] },
  { motif: /^avocat/, portions: [{ libelle: "½ avocat", grammes: 80 }, { libelle: "1 avocat", grammes: 160 }] },
  { motif: /^tomate\b/, portions: [{ libelle: "1 tomate", grammes: 120 }] },
  { motif: /^concombre/, portions: [{ libelle: "½ concombre", grammes: 150 }] },
  { motif: /^carotte/, portions: [{ libelle: "1 carotte", grammes: 80 }] },
  { motif: /^olives?\b/, portions: [{ libelle: "5 olives", grammes: 20 }] },
  { motif: /^pain de mie/, portions: [{ libelle: "1 tranche", grammes: 25 }, { libelle: "2 tranches", grammes: 50 }] },
  { motif: /^(pain,? )?baguette/, portions: [{ libelle: "¼ de baguette", grammes: 60 }, { libelle: "½ baguette", grammes: 125 }] },
  { motif: /^pain\b/, portions: [{ libelle: "1 tranche", grammes: 35 }, { libelle: "2 tranches", grammes: 70 }] },
  { motif: /^(beurre de cacahu|pate a tartiner|nutella)/, portions: [{ libelle: "1 c. à soupe", grammes: 15 }] },
  { motif: /^beurre\b/, portions: [{ libelle: "1 noisette", grammes: 5 }, { libelle: "1 c. à soupe", grammes: 15 }] },
  { motif: /^miel\b/, portions: [{ libelle: "1 c. à café", grammes: 7 }, { libelle: "1 c. à soupe", grammes: 20 }] },
  { motif: /^confiture/, portions: [{ libelle: "1 c. à soupe", grammes: 15 }] },
  { motif: /^sucre\b/, portions: [{ libelle: "1 morceau", grammes: 5 }, { libelle: "1 c. à soupe", grammes: 12 }] },
  { motif: /^(yaourt|yogourt)/, portions: [{ libelle: "1 pot", grammes: 125 }] },
  { motif: /^(fromage blanc|skyr)/, portions: [{ libelle: "1 pot", grammes: 100 }] },
  { motif: /^lait\b(?! en poudre| concentre)/, portions: [ml("1 verre", 200), ml("1 bol", 250)] },
  { motif: /^jus\b/, portions: [ml("1 verre", 200), ml("1 bouteille", 330)] },
  { motif: /^(fromage|emmental|camembert|comte\b|gouda|mozzarella|feta)/, portions: [{ libelle: "1 portion", grammes: 30 }] },
  { motif: /^(amande|noix\b|noisette|cajou|noix de cajou|pistache|cacahu)/, portions: [{ libelle: "1 poignée", grammes: 30 }] },
  { motif: /^chocolat (noir|au lait|blanc)/, portions: [{ libelle: "1 carré", grammes: 5 }, { libelle: "4 carrés", grammes: 20 }] },
  { motif: /^(flocons? d.avoine|muesli|cereales? pour petit dejeuner)/, portions: [{ libelle: "1 bol", grammes: 40 }, { libelle: "1 grand bol", grammes: 60 }] },
  { motif: /^(riz|pates|spaghetti|semoule|couscous|quinoa|boulgour|lentilles|pois chiches?)\b.*\bcuit/, portions: [{ libelle: "1 portion", grammes: 150 }, { libelle: "1 assiette", grammes: 250 }] },
  { motif: /^(riz|pates|spaghetti|semoule|couscous|quinoa|boulgour|lentilles)\b/, portions: [{ libelle: "1 portion crue", grammes: 60 }, { libelle: "1 grosse portion crue", grammes: 90 }] },
  { motif: /^((blanc|filet|escalope) de )?(poulet|dinde)/, portions: [{ libelle: "1 filet", grammes: 120 }] },
  { motif: /^(steak|boeuf hache)/, portions: [{ libelle: "1 steak", grammes: 100 }] },
  { motif: /^((pave|filet) de )?(saumon|cabillaud|colin|merlu|dorade|loup)/, portions: [{ libelle: "1 pavé", grammes: 120 }] },
  { motif: /^thon\b/, portions: [{ libelle: "1 petite boîte", grammes: 100 }] },
  { motif: /^crevette/, portions: [{ libelle: "1 portion", grammes: 100 }] },
  { motif: /^(whey|proteine en poudre)/, portions: [{ libelle: "1 dose", grammes: 30 }] },
];

function normaliser(texte: string) {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9% ]/g, " ");
}

export function portionsUsuelles(nom: string): PortionUsuelle[] {
  const n = normaliser(nom).trim().replace(/\s+/g, " ");
  return REGLES.find((r) => r.motif.test(n))?.portions ?? [];
}

// Quantité proposée par défaut pour un aliment au poids (ajout rapide).
export function grammesParDefaut(nom: string): { grammes: number; libelle: string | null } {
  const p = portionsUsuelles(nom)[0];
  return p ? { grammes: p.grammes, libelle: p.libelle } : { grammes: 100, libelle: null };
}

// Boisson : quantités affichées en ml plutôt qu'en g.
export function estLiquide(nom: string, groupe?: string | null): boolean {
  return portionsPour(nom, { groupe })[0]?.ml === true;
}

// Portions par famille d'aliments (groupes de la table CIQUAL), quand aucune
// règle plus précise ne s'applique au nom.
const PAR_GROUPE: { motif: RegExp; portions: PortionUsuelle[] }[] = [
  { motif: /^eaux$/, portions: [ml("1 verre", 250), ml("1 bouteille", 500)] },
  { motif: /^boissons sans alcool$/, portions: [ml("1 verre", 250), ml("1 canette", 330)] },
  { motif: /^boisson alcoolis/, portions: [ml("1 verre", 125), ml("1 canette", 330)] },
  { motif: /^laits$/, portions: [ml("1 verre", 200), ml("1 bol", 250)] },
  { motif: /^soupes$/, portions: [ml("1 bol", 250)] },
  { motif: /^produits laitiers frais/, portions: [{ libelle: "1 pot", grammes: 125 }] },
  { motif: /^fromages/, portions: [{ libelle: "1 portion", grammes: 30 }] },
  { motif: /^(crèmes|creme)/, portions: [{ libelle: "1 c. à soupe", grammes: 15 }] },
  { motif: /^(beurres|margarines|autres matières grasses)/, portions: [{ libelle: "1 noisette", grammes: 10 }] },
  { motif: /^huiles/, portions: [{ libelle: "1 c. à soupe", grammes: 10 }] },
  { motif: /^sauces$/, portions: [{ libelle: "1 c. à soupe", grammes: 15 }, { libelle: "1 portion", grammes: 40 }] },
  { motif: /^condiments$/, portions: [{ libelle: "1 c. à café", grammes: 5 }] },
  { motif: /^(épices|herbes|sels)$/, portions: [{ libelle: "1 pincée", grammes: 1 }] },
  { motif: /^sucres, miels/, portions: [{ libelle: "1 c. à café", grammes: 6 }] },
  { motif: /^confitures/, portions: [{ libelle: "1 c. à soupe", grammes: 15 }] },
  { motif: /^fruits$/, portions: [{ libelle: "1 fruit moyen", grammes: 150 }] },
  { motif: /^fruits à coque/, portions: [{ libelle: "1 poignée", grammes: 30 }] },
  { motif: /^légumes$/, portions: [{ libelle: "1 portion", grammes: 150 }] },
  { motif: /^légumineuses$/, portions: [{ libelle: "1 portion", grammes: 150 }] },
  { motif: /^pommes de terre/, portions: [{ libelle: "1 portion", grammes: 200 }] },
  { motif: /^pâtes, riz et céréales$/, portions: [{ libelle: "1 portion", grammes: 150 }] },
  { motif: /^pains/, portions: [{ libelle: "1 tranche", grammes: 40 }] },
  { motif: /^viennoiseries$/, portions: [{ libelle: "1 pièce", grammes: 60 }] },
  { motif: /^gâteaux et pâtisseries$/, portions: [{ libelle: "1 part", grammes: 80 }] },
  { motif: /^biscuits sucrés$/, portions: [{ libelle: "2 biscuits", grammes: 20 }, { libelle: "4 biscuits", grammes: 40 }] },
  { motif: /^biscuits apéritifs$/, portions: [{ libelle: "1 poignée", grammes: 30 }] },
  { motif: /^céréales de petit-déjeuner$/, portions: [{ libelle: "1 bol", grammes: 40 }] },
  { motif: /^barres céréalières$/, portions: [{ libelle: "1 barre", grammes: 25 }] },
  { motif: /^chocolats/, portions: [{ libelle: "4 carrés", grammes: 20 }] },
  { motif: /^confiseries/, portions: [{ libelle: "1 portion", grammes: 20 }] },
  { motif: /^(glaces|sorbets|desserts glacés|glaces et sorbets)/, portions: [{ libelle: "1 boule", grammes: 50 }, { libelle: "2 boules", grammes: 100 }] },
  { motif: /^(viandes|poissons|mollusques)/, portions: [{ libelle: "1 portion", grammes: 120 }] },
  { motif: /^charcuteries/, portions: [{ libelle: "1 tranche", grammes: 40 }, { libelle: "1 portion", grammes: 80 }] },
  { motif: /^(produits à base de poissons|autres produits à base de viande|substitus)/, portions: [{ libelle: "1 portion", grammes: 100 }] },
  { motif: /^œufs$/, portions: [{ libelle: "1 œuf", grammes: 55 }] },
  { motif: /^plats composés$/, portions: [{ libelle: "1 assiette", grammes: 300 }] },
  { motif: /^pizzas, tartes et crêpes salées$/, portions: [{ libelle: "1 part", grammes: 150 }] },
  { motif: /^sandwichs$/, portions: [{ libelle: "1 sandwich", grammes: 200 }] },
  { motif: /^salades composées/, portions: [{ libelle: "1 assiette", grammes: 250 }] },
  { motif: /^feuilletées et autres entrées$/, portions: [{ libelle: "1 pièce", grammes: 100 }] },
];

// Toutes les portions proposées pour un aliment : celle du fabricant (produit
// de marque) d'abord, puis celles du nom, sinon celles de sa famille.
export function portionsPour(
  nom: string,
  options: { groupe?: string | null; portionProduit?: PortionUsuelle | null } = {}
): PortionUsuelle[] {
  const parNom = portionsUsuelles(nom);
  const parGroupe =
    parNom.length === 0 && options.groupe
      ? PAR_GROUPE.find((r) => r.motif.test(options.groupe!.toLowerCase()))?.portions ?? []
      : [];
  const liste = [...(options.portionProduit ? [options.portionProduit] : []), ...parNom, ...parGroupe];
  // Sans doublon de poids (la portion du fabricant peut égaler une portion connue).
  return liste.filter((p, i) => liste.findIndex((q) => q.grammes === p.grammes) === i);
}

// Portion donnée par Open Food Facts : « 1 pot (125 g) », « 250 ml », « 33 cl »...
export function portionDepuisTexte(texte: string | null | undefined, quantite?: number | null): PortionUsuelle | null {
  const t = (texte ?? "").toLowerCase();
  const nombre = (s: string) => parseFloat(s.replace(",", "."));
  let valeur = quantite && quantite > 0 ? quantite : NaN;
  let enMl = /\b(ml|cl|l)\b/.test(t);
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/);
  if (m) {
    const v = nombre(m[1]);
    const unite = m[2];
    enMl = unite === "ml" || unite === "cl" || unite === "l";
    if (Number.isNaN(valeur)) valeur = unite === "kg" || unite === "l" ? v * 1000 : unite === "cl" ? v * 10 : v;
  }
  if (!Number.isFinite(valeur) || valeur <= 0 || valeur > 1000) return null;
  // Libellé court : « 1 pot », « 1 barre »… si le fabricant le précise, sinon « 1 portion ».
  const compte = t.match(/^\s*(\d+)\s+([a-zà-ÿ]+)/);
  const libelle = compte && !/^(g|ml|cl|l|kg)$/.test(compte[2]) ? `${compte[1]} ${compte[2]}` : "1 portion";
  return { libelle, grammes: Math.round(valeur), ml: enMl || undefined };
}
