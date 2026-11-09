// Catalogue des recettes Chef2Box (fiches cuisine & montage).
//
// Chaque fiche est écrite pour une base de 10 personnes en P2, avec les
// portions par box en P1 / P2 / P3 (poids cuits). Pour un nombre de box
// par palier, chaque élément de la box donne un facteur :
//   facteur = (Σ box du palier × portion du palier) / (10 × portion P2)
// et chaque aliment ou ingrédient de sauce « suit » un élément de la box :
// sa quantité de base est multipliée par ce facteur.

import type { Palier } from "@/lib/types";

export type Effectifs = Record<Palier, number>;

// Un élément de la box (fiche montage), poids cuits / prêts à servir.
export interface ElementBox {
  id: string;
  nom: string;
  portions: Effectifs; // par box (g, ou unités si `unite`)
  unite?: string; // "g" par défaut ; "u" pour 1 tostinette, 1 galette…
  texte?: string; // sans poids imposé (ex. « Au montage »)
}

// Un aliment à préparer (fiche cuisine, base 10 P2).
export interface Aliment {
  nom: string;
  suit: string | { id: string; part: number }[]; // élément(s) de la box
  cru?: number; // g (ou unité) cru / net à prévoir
  cuit?: number; // g cuit / prêt à servir
  unite?: string; // "g" par défaut
  note?: string;
  texte?: string; // sans quantité chiffrée (ex. « Selon montage »)
}

// Une préparation (sauce, marinade…) : ingrédients pour la base de 10.
export interface Preparation {
  titre: string;
  suit: string | { id: string; part: number }[];
  ingredients: { nom: string; qte: number; max?: number; unite: string }[];
  etapes: string[];
}

export interface Recette {
  id: string;
  nom: string;
  sousTitre: string;
  description: string;
  elements: ElementBox[];
  aliments: Aliment[];
  preparations: Preparation[];
  cuisine: string[]; // étapes ({id} = poids cuit total de l'élément)
  montage: string[];
  notes: string[];
  allergenes: string;
}

export const PALIERS_RECETTE: Palier[] = ["P1", "P2", "P3"];
export const BASE = 10; // la fiche est écrite pour 10 box P2

// Facteur de chaque élément de la box pour ces effectifs.
export function facteurs(r: Recette, eff: Effectifs) {
  const f: Record<string, number> = {};
  for (const e of r.elements) {
    const besoin = PALIERS_RECETTE.reduce((t, p) => t + (eff[p] || 0) * e.portions[p], 0);
    // Base de la fiche : 10 box P2 ; si l'élément n'existe qu'en P1 (ex. pommes
    // de terre du wrap), base : 10 box du premier palier qui en a.
    const ref = PALIERS_RECETTE.map((p) => e.portions[p]).find((v) => v > 0) ?? 0;
    const base = e.portions.P2 > 0 ? e.portions.P2 : ref;
    f[e.id] = base > 0 ? besoin / (BASE * base) : 0;
  }
  return f;
}

export function facteurDe(suit: Aliment["suit"], f: Record<string, number>) {
  if (typeof suit === "string") return f[suit] ?? 0;
  const total = suit.reduce((t, s) => t + s.part, 0);
  return total ? suit.reduce((t, s) => t + s.part * (f[s.id] ?? 0), 0) / total : 0;
}

// Portion d'un élément pour un palier, telle qu'affichée (« 130 g », « 1 », « Au montage », « Aucune »).
export function portionTexte(e: ElementBox, p: Palier) {
  if (e.texte) return e.texte;
  if (!e.portions[p]) return "Aucune";
  return e.unite === "u" ? String(e.portions[p]) : `${e.portions[p]} ${e.unite ?? "g"}`;
}

// Total d'un élément pour ces effectifs, tel qu'affiché.
export function totalTexte(e: ElementBox, eff: Effectifs) {
  if (e.texte) return "—";
  const t = totalElement(e, eff);
  return e.unite === "u" ? String(t) : quantite(t, e.unite ?? "g");
}

// Total cuit d'un élément de la box.
export function totalElement(e: ElementBox, eff: Effectifs) {
  return PALIERS_RECETTE.reduce((t, p) => t + (eff[p] || 0) * e.portions[p], 0);
}

// « 1,25 kg », « 340 g », « 2 c. à s. », « 1,5 pièce »…
export function quantite(v: number, unite = "g") {
  if (unite === "g" || unite === "ml") {
    const arrondi = v < 20 ? Math.round(v) : v < 200 ? Math.round(v / 5) * 5 : Math.round(v / 10) * 10;
    if (arrondi >= 1000) {
      const grand = unite === "g" ? "kg" : "L";
      return `${(arrondi / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${grand}`;
    }
    return `${arrondi} ${unite}`;
  }
  // Pièces, gousses, feuilles… : arrondies à l'unité supérieure (on n'achète pas une demi-pièce) ;
  // cuillères : à la demi près.
  if (!unite.startsWith("c.")) return `${Math.max(1, Math.ceil(v - 0.05))} ${unite}`;
  const demi = Math.max(0.5, Math.round(v * 2) / 2);
  return `${demi.toLocaleString("fr-FR")} ${unite}`;
}

const pP = (P1: number, P2: number, P3: number): Effectifs => ({ P1, P2, P3 });

export const RECETTES: Recette[] = [
  {
    id: "salade-cesar",
    nom: "Salade César",
    sousTitre: "Poulet & pâtes",
    description: "Pâtes saucées, poulet, salade, tomates, avocat et parmesan. Sauce César au yaourt grec, mayonnaise, parmesan, citron et moutarde.",
    elements: [
      { id: "pates", nom: "Pâtes + sauce César", portions: pP(300, 258, 216) },
      { id: "poulet", nom: "Poulet", portions: pP(145, 130, 110) },
      { id: "salade", nom: "Salade", portions: pP(60, 60, 60) },
      { id: "tomates", nom: "Tomates", portions: pP(40, 40, 40) },
      { id: "avocat", nom: "Avocat", portions: pP(30, 25, 20) },
      { id: "parmesan", nom: "Parmesan en copeaux", portions: pP(10, 8, 5) },
      { id: "pot", nom: "Pot de sauce à côté", portions: pP(25, 25, 20) },
    ],
    aliments: [
      { nom: "Pâtes", suit: "pates", cru: 860, cuit: 2150, note: "sèches → cuites hors sauce" },
      { nom: "Filet de poulet", suit: "poulet", cru: 1750, cuit: 1300 },
      { nom: "Salade lavée et essorée", suit: "salade", cru: 600, cuit: 600, note: "net" },
      { nom: "Tomates", suit: "tomates", cru: 400, cuit: 400, note: "net" },
      { nom: "Avocat (chair)", suit: "avocat", cru: 250, cuit: 250, note: "sans peau ni noyau" },
      { nom: "Parmesan en copeaux", suit: "parmesan", cru: 80, cuit: 80 },
      { nom: "Huile pour le poulet", suit: "poulet", cru: 50, note: "pour toute la cuisson" },
    ],
    preparations: [
      {
        titre: "Sauce César",
        suit: [
          { id: "pates", part: 430 },
          { id: "pot", part: 250 },
        ],
        ingredients: [
          { nom: "Yaourt grec", qte: 427, unite: "g" },
          { nom: "Mayonnaise", qte: 63, unite: "g" },
          { nom: "Parmesan râpé", qte: 108, unite: "g" },
          { nom: "Jus de citron", qte: 54, unite: "g" },
          { nom: "Moutarde de Dijon", qte: 27, unite: "g" },
          { nom: "Ail épluché", qte: 1, unite: "g" },
        ],
        etapes: ["Mixer l'ail très finement.", "Mélanger tous les ingrédients."],
      },
    ],
    cuisine: [
      "Cuire les pâtes, égoutter et peser. Ne pas ajouter d'huile aux pâtes.",
      "Répartir l'huile sur le poulet. Cuire puis émincer et peser.",
      "Laver et couper les crudités. Préparer les portions d'avocat et de parmesan.",
      "Mélanger la sauce aux pâtes ({pates} de pâtes saucées au total). Réserver {pot} de sauce pour les pots séparés.",
      "Dresser selon la fiche montage. Ajouter le pot de sauce fermé à côté.",
    ],
    montage: [
      "Peser le mélange pâtes + sauce : 300 / 258 / 216 g.",
      "Ajouter la salade, les tomates et la portion de poulet.",
      "Ajouter l'avocat, le parmesan et le pot de sauce fermé à côté.",
    ],
    notes: ["Pâtes saucées + un pot de sauce séparé. Ne pas verser le pot dans les pâtes.", "Pas d'huile supplémentaire au dressage."],
    allergenes: "Blé, lait, œuf, moutarde. Version sans anchois.",
  },
  {
    id: "chicken-burrata",
    nom: "Chicken Burrata",
    sousTitre: "Linguine",
    description: "Linguine, poulet grillé, tomates rôties, burrata et pignons de pin. Sauce aux herbes, huile d'olive, parmesan et citron.",
    elements: [
      { id: "pates", nom: "Linguine + sauce", portions: pP(300, 258, 216) },
      { id: "poulet", nom: "Poulet", portions: pP(130, 115, 100) },
      { id: "tomates", nom: "Tomates rôties", portions: pP(100, 90, 80) },
      { id: "burrata", nom: "Burrata égouttée", portions: pP(20, 15, 15) },
      { id: "pignons", nom: "Pignons de pin", portions: pP(5, 4, 3) },
    ],
    aliments: [
      { nom: "Linguine", suit: "pates", cru: 860, cuit: 2150, note: "sèches → cuites" },
      { nom: "Filet de poulet", suit: "poulet", cru: 1550, cuit: 1150 },
      { nom: "Tomates", suit: "tomates", cru: 1100, cuit: 900, note: "net → rôties" },
      { nom: "Burrata", suit: "burrata", cru: 150, cuit: 150, note: "égouttée" },
      { nom: "Pignons de pin", suit: "pignons", cru: 40, cuit: 40 },
    ],
    preparations: [
      {
        titre: "Sauce aux herbes",
        suit: "pates",
        ingredients: [
          { nom: "Huile d'olive", qte: 72, unite: "g" },
          { nom: "Parmesan râpé", qte: 60, unite: "g" },
          { nom: "Basilic", qte: 25, unite: "g" },
          { nom: "Persil", qte: 20, unite: "g" },
          { nom: "Jus de citron", qte: 45, unite: "g" },
          { nom: "Ail épluché", qte: 6, unite: "g" },
          { nom: "Eau de cuisson", qte: 202, unite: "g" },
        ],
        etapes: [
          "Laver et sécher les herbes.",
          "Mixer avec le citron, l'ail, le parmesan et l'eau. Incorporer l'huile d'olive.",
          "Eau ajustée pour obtenir +20 % de poids après mélange : compenser l'évaporation.",
        ],
      },
    ],
    cuisine: [
      "Cuire les linguine. Garder de l'eau de cuisson, égoutter et peser les pâtes.",
      "Cuire le poulet dans une poêle antiadhésive, sans huile supplémentaire. Émincer.",
      "Rôtir les tomates sur papier cuisson. Torréfier les pignons à sec.",
      "Mélanger toute la sauce aux pâtes. Viser {pates} de mélange final (pâtes cuites × 1,20).",
      "Dresser selon la fiche montage. Ajouter la burrata et les pignons en dernier.",
    ],
    montage: [
      "Peser directement le mélange linguine + sauce : 300 / 258 / 216 g.",
      "Ajouter le poulet et les tomates rôties.",
      "Terminer avec la burrata et les pignons.",
    ],
    notes: ["Ne pas ajouter de sauce au montage : sauce, eau, huile et parmesan sont déjà dans les pâtes saucées."],
    allergenes: "Blé, lait ; œuf selon les pâtes. Contient des pignons de pin.",
  },
  {
    id: "roasted-chicken",
    nom: "Roasted Chicken",
    sousTitre: "Sourdough sandwich",
    description: "Pain au levain, poulet rôti effiloché, salade et sauce mayonnaise-moutarde. Accompagnement : pommes de terre au four.",
    elements: [
      { id: "pain", nom: "Pain au levain", portions: pP(100, 100, 100) },
      { id: "poulet", nom: "Poulet effiloché", portions: pP(130, 115, 100) },
      { id: "salade", nom: "Salade", portions: pP(30, 30, 30) },
      { id: "sauce", nom: "Sauce sandwich", portions: pP(20, 18, 15) },
      { id: "pdt", nom: "Pommes de terre", portions: pP(100, 70, 50) },
    ],
    aliments: [
      { nom: "Cuisse de poulet sans peau, désossée", suit: "poulet", cru: 1600, cuit: 1150, note: "→ effiloché" },
      { nom: "Pain au levain", suit: "pain", cru: 1000, cuit: 1000 },
      { nom: "Pommes de terre", suit: "pdt", cru: 900, cuit: 700, note: "net" },
      { nom: "Salade lavée et essorée", suit: "salade", cru: 300, cuit: 300, note: "net" },
    ],
    preparations: [
      {
        titre: "Marinade du poulet",
        suit: "poulet",
        ingredients: [
          { nom: "Beurre", qte: 133, unite: "g" },
          { nom: "Moutarde de Dijon", qte: 67, unite: "g" },
          { nom: "Huile d'olive", qte: 33, unite: "ml" },
          { nom: "Bouillon", qte: 100, unite: "ml" },
          { nom: "Jus de citron", qte: 20, unite: "ml" },
          { nom: "Ail épluché", qte: 10, unite: "g" },
          { nom: "Paprika", qte: 4, unite: "g" },
          { nom: "Thym", qte: 2, unite: "g" },
          { nom: "Origan", qte: 2, unite: "g" },
          { nom: "Poivre", qte: 1, unite: "g" },
        ],
        etapes: ["Mélanger le beurre ramolli, la moutarde, l'huile, le bouillon, le citron et les épices."],
      },
      {
        titre: "Sauce sandwich",
        suit: "sauce",
        ingredients: [
          { nom: "Mayonnaise", qte: 133, unite: "g" },
          { nom: "Moutarde", qte: 30, unite: "g" },
          { nom: "Jus de citron", qte: 15, unite: "g" },
          { nom: "Ail épluché", qte: 2, unite: "g" },
        ],
        etapes: ["Mixer l'ail puis mélanger tous les ingrédients de la sauce."],
      },
    ],
    cuisine: [
      "Enrober le poulet de marinade. Rôtir au four jusqu'à cuisson complète, puis effilocher ({poulet} de poulet effiloché).",
      "Cuire les pommes de terre sur papier cuisson, sans huile supplémentaire.",
      "Mélanger la sauce du sandwich. Laver, essorer et couper la salade.",
      "Garnir le pain selon la fiche montage. Ajouter les pommes de terre dans la box.",
    ],
    montage: [
      "Répartir la sauce sur le pain.",
      "Ajouter la salade et la portion de poulet.",
      "Fermer le sandwich et ajouter les pommes de terre à côté.",
    ],
    notes: [
      "Peser la viande cuite et effilochée, sans excès de jus de cuisson.",
      "Pas de beurre sur le pain ni d'huile au dressage : ils sont déjà dans la marinade.",
    ],
    allergenes: "Blé, lait, œuf, moutarde ; vérifier la composition du bouillon.",
  },
  {
    id: "beef-melt",
    nom: "Beef Melt",
    sousTitre: "Bœuf effiloché",
    description: "Pain au levain, bœuf effiloché, mimolette et frites de patate douce. Sauce mayonnaise-moutarde. Bœuf mijoté avec tomate, poivrons et épices.",
    elements: [
      { id: "pain", nom: "Pain au levain", portions: pP(120, 120, 120) },
      { id: "boeuf", nom: "Bœuf effiloché", portions: pP(120, 120, 90) },
      { id: "mimolette", nom: "Mimolette", portions: pP(20, 20, 20) },
      { id: "sauce", nom: "Sauce mayo-moutarde", portions: pP(16, 16, 16) },
      { id: "patate", nom: "Frites de patate douce", portions: pP(60, 50, 40) },
    ],
    aliments: [
      { nom: "Jarret de bœuf désossé", suit: "boeuf", cru: 1800, cuit: 1200, note: "→ effiloché" },
      { nom: "Pain au levain", suit: "pain", cru: 1200, cuit: 1200 },
      { nom: "Mimolette", suit: "mimolette", cru: 200, cuit: 200, note: "tranches de 20 g" },
      { nom: "Patate douce", suit: "patate", cru: 650, cuit: 500, note: "net" },
    ],
    preparations: [
      {
        titre: "Base de cuisson du bœuf",
        suit: "boeuf",
        ingredients: [
          { nom: "Poivron rouge", qte: 2, unite: "pièce(s)" },
          { nom: "Poivron jaune", qte: 2, unite: "pièce(s)" },
          { nom: "Poivron vert", qte: 2, unite: "pièce(s)" },
          { nom: "Oignon", qte: 5, unite: "pièce(s)" },
          { nom: "Ail", qte: 5, unite: "gousse(s)" },
          { nom: "Bouillon de bœuf", qte: 420, unite: "ml" },
          { nom: "Purée de tomate", qte: 660, unite: "g" },
          { nom: "Concentré de tomate", qte: 2, unite: "c. à s." },
          { nom: "Épices tex-mex", qte: 5, unite: "c. à s." },
          { nom: "Origan", qte: 2, unite: "c. à s." },
          { nom: "Thym", qte: 2, unite: "c. à s." },
          { nom: "Sucre de canne", qte: 2, unite: "c. à s." },
          { nom: "Laurier", qte: 5, unite: "feuille(s)" },
          { nom: "Cannelle", qte: 1, unite: "bâton(s)" },
          { nom: "Piment fort", qte: 0.5, max: 0.75, unite: "c. à c." },
        ],
        etapes: [
          "Réunir le jarret, les légumes, le bouillon, la tomate et les épices.",
          "Mijoter à couvert environ 3 h, jusqu'à effilochage facile. Ajouter de l'eau si besoin.",
          "Version sans huile ni beurre ajoutés à la cuisson.",
        ],
      },
      {
        titre: "Sauce du sandwich",
        suit: "sauce",
        ingredients: [
          { nom: "Mayonnaise", qte: 80, unite: "g" },
          { nom: "Moutarde", qte: 80, unite: "g" },
        ],
        etapes: ["Mélanger jusqu'à homogénéité."],
      },
    ],
    cuisine: [
      "Mijoter le bœuf avec sa base de cuisson (environ 3 h).",
      "Retirer laurier et cannelle. Effilocher le bœuf ({boeuf} au total) et l'humidifier avec un peu de jus.",
      "Couper les patates douces en frites. Cuire au four sur papier cuisson, sans huile.",
      "Mélanger la sauce. Garnir le pain selon la fiche montage et faire fondre la mimolette.",
    ],
    montage: [
      "Répartir la sauce sur le pain.",
      "Ajouter le bœuf, puis la mimolette. Faire fondre le fromage.",
      "Placer le sandwich et la portion de patate douce dans la box.",
    ],
    notes: [
      "Peser la viande effilochée, sans excès de jus ni garniture de cuisson.",
      "Pas de beurre sur le pain ni d'huile au dressage. P1 et P2 gardent la même portion de bœuf.",
    ],
    allergenes: "Blé, lait, œuf, moutarde. Vérifier bouillon, épices et sauces.",
  },
  {
    id: "riz-asiatique",
    nom: "Riz asiatique",
    sousTitre: "Aux crevettes",
    description: "Riz sauté, crevettes et légumes, sauce soja, sésame et gingembre.",
    elements: [
      { id: "riz", nom: "Riz", portions: pP(300, 260, 220) },
      { id: "crevettes", nom: "Crevettes", portions: pP(120, 110, 100) },
      { id: "legumes", nom: "Légumes mélangés (carotte, courgette, poivron)", portions: pP(150, 150, 150) },
      { id: "sauce", nom: "Sauce asiatique", portions: pP(40, 35, 30) },
    ],
    aliments: [
      { nom: "Crevettes décortiquées", suit: "crevettes", cru: 1400, cuit: 1100, note: "pesées hors glace" },
      { nom: "Riz", suit: "riz", cru: 870, cuit: 2600 },
      { nom: "Carotte", suit: "legumes", cru: 600, cuit: 500, note: "net" },
      { nom: "Courgette", suit: "legumes", cru: 650, cuit: 500, note: "net" },
      { nom: "Poivron", suit: "legumes", cru: 650, cuit: 500, note: "net" },
    ],
    preparations: [
      {
        titre: "Sauce asiatique",
        suit: "sauce",
        ingredients: [
          { nom: "Sauce soja sucrée", qte: 71, unite: "ml" },
          { nom: "Huile de sésame", qte: 71, unite: "ml" },
          { nom: "Sauce huître", qte: 36, unite: "ml" },
          { nom: "Gingembre épluché", qte: 29, unite: "g" },
          { nom: "Ail", qte: 4, unite: "gousse(s)" },
          { nom: "Miel", qte: 29, unite: "g" },
          { nom: "Vinaigre de riz", qte: 29, unite: "ml" },
          { nom: "Eau", qte: 107, unite: "ml" },
        ],
        etapes: [
          "Hacher l'ail et le gingembre.",
          "Mélanger avec les sauces, le miel, le vinaigre et l'eau. Incorporer l'huile de sésame.",
          "Remuer avant chaque dosage. Ne pas verser tout le lot : garder le surplus à part.",
        ],
      },
    ],
    cuisine: [
      "Cuire le riz sans matière grasse ({riz} cuit). Couper et cuire les légumes ({legumes} cuits).",
      "Cuire les crevettes dans une poêle antiadhésive, sans huile supplémentaire.",
      "Peser séparément le riz, les légumes et les crevettes après cuisson.",
      "Doser la sauce par palier ({sauce} au total), puis mélanger à la portion ou servir à part.",
    ],
    montage: ["Riz → Légumes → Crevettes → Sauce.", "Légumes par box : 50 g de carotte + 50 g de courgette + 50 g de poivron cuits."],
    notes: ["Mélanger la sauce avant de la peser.", "Ne pas ajouter d'huile : l'huile de sésame est déjà dans la sauce."],
    allergenes: "Crustacés, soja, sésame, mollusques ; blé selon les sauces.",
  },
  {
    id: "thai-peanut",
    nom: "Thai Peanut",
    sousTitre: "Chicken bowl",
    description: "Poulet au paprika, riz basmati et crudités, sauce cacahuète.",
    elements: [
      { id: "riz", nom: "Riz basmati", portions: pP(280, 240, 200) },
      { id: "poulet", nom: "Poulet", portions: pP(140, 130, 115) },
      { id: "crudites", nom: "Crudités mélangées (chou, carotte, concombre)", portions: pP(100, 100, 100) },
      { id: "sauce", nom: "Sauce cacahuète", portions: pP(45, 40, 35) },
      { id: "cacahuetes", nom: "Cacahuètes", portions: pP(5, 5, 5) },
    ],
    aliments: [
      { nom: "Filet de poulet", suit: "poulet", cru: 1750, cuit: 1300 },
      { nom: "Riz basmati", suit: "riz", cru: 800, cuit: 2400 },
      { nom: "Chou rouge", suit: "crudites", cru: 300, cuit: 300, note: "net" },
      { nom: "Carotte", suit: "crudites", cru: 300, cuit: 300, note: "net" },
      { nom: "Concombre", suit: "crudites", cru: 400, cuit: 400, note: "net" },
      { nom: "Cacahuètes", suit: "cacahuetes", cru: 50, cuit: 50 },
    ],
    preparations: [
      {
        titre: "Assaisonnement du poulet",
        suit: "poulet",
        ingredients: [
          { nom: "Huile", qte: 25, unite: "g" },
          { nom: "Paprika", qte: 5, unite: "g" },
          { nom: "Poivre", qte: 1, unite: "g" },
        ],
        etapes: ["Enrober le poulet, cuire, puis découper."],
      },
      {
        titre: "Sauce cacahuète",
        suit: "sauce",
        ingredients: [
          { nom: "Beurre de cacahuète", qte: 140, unite: "g" },
          { nom: "Sauce soja salée", qte: 56, unite: "g" },
          { nom: "Jus de citron vert", qte: 38, unite: "g" },
          { nom: "Miel", qte: 26, unite: "g" },
          { nom: "Huile de sésame", qte: 10, unite: "g" },
          { nom: "Ail", qte: 4, unite: "g" },
          { nom: "Gingembre", qte: 5, unite: "g" },
          { nom: "Paprika", qte: 1, unite: "g" },
          { nom: "Eau", qte: 120, unite: "g" },
        ],
        etapes: ["Mixer ou mélanger tous les ingrédients jusqu'à obtenir une sauce homogène."],
      },
    ],
    cuisine: [
      "Cuire le riz sans huile ni beurre ({riz} cuit). Assaisonner et cuire le poulet.",
      "Émincer le chou, râper la carotte, couper le concombre. Mélanger.",
      "Préparer la sauce. Concasser les cacahuètes. Garder les éléments séparés.",
      "Monter les box selon la fiche montage.",
    ],
    montage: ["Riz → Poulet → Crudités → Sauce → Cacahuètes.", "Crudités par box : 30 g de chou rouge + 30 g de carotte + 40 g de concombre."],
    notes: ["Ne pas ajouter d'huile au dressage : l'huile de cuisson est déjà prévue."],
    allergenes: "Arachides, soja, sésame ; blé selon la sauce soja utilisée.",
  },
  {
    id: "cheesy-burger-bowl",
    nom: "Cheesy Burger Bowl",
    sousTitre: "Steak haché & pommes de terre",
    description: "Steak haché 5 %, pommes de terre, tostinette, crudités et sauce burger. Pommes de terre comme base de féculents. Sauce en pot à côté.",
    elements: [
      { id: "steak", nom: "Steak 5 % (poids CRU)", portions: pP(130, 100, 90) },
      { id: "tostinette", nom: "Tostinette (≈ 60 kcal)", portions: pP(1, 1, 1), unite: "u" },
      { id: "pdt", nom: "Pommes de terre cuites", portions: pP(300, 250, 200) },
      { id: "crudites", nom: "Crudités", portions: pP(0, 0, 0), texte: "Au montage" },
      { id: "pot", nom: "Pot de sauce à côté", portions: pP(25, 25, 25) },
    ],
    aliments: [
      { nom: "Steaks hachés 5 %", suit: "steak", cru: 1000, note: "pesés CRUS : 130 / 100 / 90 g par palier" },
      { nom: "Tostinettes", suit: "tostinette", cru: 10, unite: "unité(s)", note: "1 par box" },
      { nom: "Pommes de terre", suit: "pdt", cru: 3100, cuit: 2500, note: "net" },
      { nom: "Huile pommes de terre", suit: "pdt", cru: 4, unite: "c. à s." },
      { nom: "Crudités", suit: "crudites", texte: "Salade, etc.", note: "sans grammage imposé" },
    ],
    preparations: [
      {
        titre: "Sauce burger",
        suit: "pot",
        ingredients: [
          { nom: "Yaourt", qte: 123, unite: "g" },
          { nom: "Mayonnaise", qte: 61, unite: "g" },
          { nom: "Ketchup", qte: 33, unite: "g" },
          { nom: "Moutarde", qte: 12, unite: "g" },
          { nom: "Cornichons hachés", qte: 15, unite: "g" },
          { nom: "Jus de cornichons", qte: 6, unite: "g" },
        ],
        etapes: ["Hacher les cornichons. Mélanger tous les ingrédients.", "Assaisonnement habituel, à goûter avant de saler. Répartir en pots de 25 g."],
      },
    ],
    cuisine: [
      "Former les steaks crus : P1 130 g / P2 100 g / P3 90 g. Cuire sans huile.",
      "Préparer la sauce et remplir les pots de 25 g ({pot} au total).",
      "Couper les pommes de terre. Mélanger avec l'huile.",
      "Cuire au four puis peser les portions cuites ({pdt} au total). Préparer les crudités.",
      "Monter les box selon la fiche montage. Ajouter la tostinette et le pot de sauce.",
    ],
    montage: [
      "Peser les pommes de terre, puis déposer le steak haché entier.",
      "Déposer la tostinette sur le steak. Ajouter les crudités.",
      "Ajouter le pot de sauce de 25 g, fermé, à côté.",
    ],
    notes: [
      "Bœuf : poids CRU, servir la portion préparée sans compléter son poids après cuisson. Pommes de terre : poids CUIT.",
      "Pas de +20 % sur les pommes de terre : huile déjà comprise. Même yaourt et mêmes marques à chaque production.",
    ],
    allergenes: "Lait, œuf, moutarde. Vérifier les étiquettes des produits.",
  },
  {
    id: "burger-wrap",
    nom: "Burger Wrap",
    sousTitre: "Bœuf 5 % & tostinette",
    description: "Galette, bœuf 5 %, tostinette, salade et sauce burger. Sauce dans le wrap + un pot à côté. Aucune autre crudité.",
    elements: [
      { id: "galette", nom: "Galette à 300 kcal", portions: pP(1, 1, 1), unite: "u" },
      { id: "boeuf", nom: "Bœuf 5 % (poids CRU)", portions: pP(130, 100, 90) },
      { id: "tostinette", nom: "Tostinette (≈ 60 kcal)", portions: pP(1, 1, 1), unite: "u" },
      { id: "salade", nom: "Salade uniquement", portions: pP(0, 0, 0), texte: "Au montage" },
      { id: "sauceWrap", nom: "Sauce dans le wrap (1 c. à s.)", portions: pP(15, 15, 15) },
      { id: "pot", nom: "Pot de sauce à côté", portions: pP(25, 25, 25) },
      { id: "pdt", nom: "Pommes de terre (P1 seulement)", portions: pP(50, 0, 0) },
    ],
    aliments: [
      { nom: "Bœuf haché 5 %", suit: "boeuf", cru: 1000, note: "pesé CRU : 130 / 100 / 90 g par palier" },
      { nom: "Tostinettes", suit: "tostinette", cru: 10, unite: "unité(s)", note: "1 par box" },
      { nom: "Galettes wrap", suit: "galette", cru: 10, unite: "unité(s)", note: "300 kcal / galette" },
      { nom: "Salade", suit: "salade", texte: "Selon montage", note: "sans grammage imposé" },
      { nom: "Pommes de terre", suit: "pdt", cru: 620, cuit: 500, note: "net ; 50 g cuits par P1, sans huile" },
    ],
    preparations: [
      {
        titre: "Sauce burger",
        suit: [
          { id: "sauceWrap", part: 150 },
          { id: "pot", part: 250 },
        ],
        ingredients: [
          { nom: "Yaourt", qte: 197, unite: "g" },
          { nom: "Mayonnaise", qte: 98, unite: "g" },
          { nom: "Ketchup", qte: 52, unite: "g" },
          { nom: "Moutarde", qte: 20, unite: "g" },
          { nom: "Cornichons hachés", qte: 23, unite: "g" },
          { nom: "Jus de cornichons", qte: 10, unite: "g" },
        ],
        etapes: [
          "Hacher les cornichons. Mélanger tous les ingrédients. Assaisonnement habituel, à goûter avant de saler.",
          "1 c. à soupe ≈ 15 g, à étalonner.",
        ],
      },
    ],
    cuisine: [
      "Peser le bœuf cru par palier : 130 / 100 / 90 g. Cuire sans huile, en lots séparés.",
      "Préparer la sauce : {sauceWrap} pour garnir les wraps, {pot} pour les pots de 25 g.",
      "Laver et essorer la salade. Garnir les galettes selon la fiche montage.",
      "Fondre la tostinette avec le bœuf, fermer puis toaster sans huile ni beurre.",
      "Pommes de terre pour les P1 : {pdt} cuites au total, sans huile ajoutée.",
    ],
    montage: [
      "Étaler 1 c. à soupe de sauce dans la galette.",
      "Ajouter la salade, le bœuf et la tostinette. Fermer et toaster.",
      "Ajouter le pot de sauce fermé et les pommes de terre prévues (P1).",
    ],
    notes: [
      "Bœuf : poids CRU, servir la portion préparée sans compléter son poids après cuisson. Pommes de terre : poids CUIT.",
      "P2 et P3 : pas de pommes de terre. Même yaourt et mêmes marques à chaque production.",
    ],
    allergenes: "Lait, œuf, moutarde ; blé pour le wrap. Vérifier les étiquettes des produits.",
  },
  {
    id: "salade-nicoise",
    nom: "Salade Niçoise",
    sousTitre: "Riz, thon & œuf",
    description: "Riz, pommes de terre, thon, œuf, haricots verts, tomates et salade. Vinaigrette maison servie dans un pot séparé.",
    elements: [
      { id: "riz", nom: "Riz cuit", portions: pP(250, 200, 180) },
      { id: "pdt", nom: "Pommes de terre cuites", portions: pP(80, 70, 60) },
      { id: "thon", nom: "Thon égoutté", portions: pP(100, 90, 80) },
      { id: "oeuf", nom: "Œuf dur", portions: pP(1, 1, 1), unite: "u" },
      { id: "haricots", nom: "Haricots verts cuits", portions: pP(80, 80, 80) },
      { id: "tomates", nom: "Tomates", portions: pP(50, 50, 50) },
      { id: "salade", nom: "Salade", portions: pP(0, 0, 0), texte: "Au montage" },
      { id: "vinaigrette", nom: "Pot de vinaigrette", portions: pP(30, 25, 20) },
    ],
    aliments: [
      { nom: "Riz", suit: "riz", cru: 670, cuit: 2000, note: "sec ≈ cuit ÷ 3" },
      { nom: "Pommes de terre", suit: "pdt", cru: 840, cuit: 700, note: "net" },
      { nom: "Thon au naturel", suit: "thon", cuit: 900, note: "égoutté, selon les boîtes" },
      { nom: "Œufs", suit: "oeuf", cru: 10, unite: "unité(s)", note: "durs, coupés en deux" },
      { nom: "Haricots verts", suit: "haricots", cru: 900, cuit: 800, note: "net" },
      { nom: "Tomates", suit: "tomates", cru: 500, cuit: 500 },
      { nom: "Salade", suit: "salade", texte: "Au montage", note: "sans grammage imposé" },
    ],
    preparations: [
      {
        titre: "Vinaigrette (pots)",
        suit: "vinaigrette",
        ingredients: [
          { nom: "Huile d'olive", qte: 115, unite: "g" },
          { nom: "Vinaigre", qte: 63, unite: "g" },
          { nom: "Jus de citron", qte: 38, unite: "g" },
          { nom: "Moutarde", qte: 30, unite: "g" },
          { nom: "Eau", qte: 4, unite: "g" },
        ],
        etapes: [
          "Fouetter la moutarde, le vinaigre et le jus de citron. Incorporer l'huile puis l'eau.",
          "Poivrer, saler au goût. Remuer avant de remplir les pots (30 / 25 / 20 g).",
        ],
      },
    ],
    cuisine: [
      "Cuire le riz sans huile, puis égoutter ({riz} de riz cuit).",
      "Cuire les pommes de terre à l'eau ou à la vapeur, sans huile. Couper.",
      "Cuire et égoutter les haricots verts. Cuire les œufs durs, écaler et couper en deux.",
      "Égoutter le thon. Laver et couper les tomates et la salade.",
      "Garder les éléments séparés et monter les box selon la fiche montage.",
    ],
    montage: [
      "Déposer le riz et les pommes de terre.",
      "Ajouter les haricots verts, les tomates, le thon et l'œuf.",
      "Ajouter la salade et le pot de vinaigrette fermé à côté.",
    ],
    notes: [
      "Féculents et haricots verts : poids CUIT. Thon : poids égoutté.",
      "Pas de +20 % sur le riz : la sauce reste à côté. Aucune huile en dehors de la vinaigrette.",
    ],
    allergenes: "Poisson, œuf, moutarde. Vérifier également les étiquettes des produits.",
  },
  {
    id: "harissa-chicken",
    nom: "Harissa Chicken",
    sousTitre: "Bowl",
    description: "Poulet harissa, riz, poivrons et tomates rôtis, sauce yaourt citronnée servie dans un pot séparé.",
    elements: [
      { id: "poulet", nom: "Poulet harissa cuit", portions: pP(140, 120, 100) },
      { id: "riz", nom: "Riz cuit", portions: pP(300, 260, 220) },
      { id: "legumes", nom: "Poivrons + tomates rôtis", portions: pP(100, 100, 100) },
      { id: "pot", nom: "Pot de sauce citronnée", portions: pP(25, 25, 25) },
    ],
    aliments: [
      { nom: "Filet de poulet", suit: "poulet", cru: 1600, cuit: 1200, note: "cru ≈ cuit ÷ 0,75" },
      { nom: "Riz", suit: "riz", cru: 870, cuit: 2600, note: "sec ≈ cuit ÷ 3" },
      { nom: "Poivrons + tomates", suit: "legumes", cru: 1250, cuit: 1000, note: "net, moitié de chaque" },
      { nom: "Huile d'olive des légumes", suit: "legumes", cru: 3.5, unite: "c. à s.", note: "en plus de la marinade" },
    ],
    preparations: [
      {
        titre: "Marinade du poulet",
        suit: "poulet",
        ingredients: [
          { nom: "Yaourt grec nature", qte: 240, unite: "g" },
          { nom: "Harissa", qte: 55, unite: "g" },
          { nom: "Huile d'olive", qte: 32, unite: "ml" },
          { nom: "Jus de citron", qte: 25, unite: "ml" },
          { nom: "Sel", qte: 13, unite: "g" },
          { nom: "Ail écrasé", qte: 4, max: 5, unite: "gousse(s)" },
          { nom: "Paprika fumé", qte: 1.6, unite: "c. à c." },
          { nom: "Cumin", qte: 1.6, unite: "c. à c." },
          { nom: "Coriandre moulue", qte: 0.8, unite: "c. à c." },
          { nom: "Curcuma", qte: 0.8, unite: "c. à c." },
          { nom: "Poivre noir", qte: 0.7, unite: "c. à c." },
        ],
        etapes: ["Mélanger la marinade, enrober le poulet et laisser mariner au réfrigérateur."],
      },
      {
        titre: "Sauce citronnée (pots)",
        suit: "pot",
        ingredients: [
          { nom: "Yaourt grec nature", qte: 225, unite: "g" },
          { nom: "Jus de citron", qte: 15, unite: "g" },
          { nom: "Eau", qte: 7.5, unite: "g" },
          { nom: "Ail râpé", qte: 2.5, unite: "g" },
        ],
        etapes: ["Mélanger à part de la marinade. Sel et poivre au goût. Répartir en pots de 25 g."],
      },
    ],
    cuisine: [
      "Cuire le poulet mariné au four à 200 °C jusqu'à cuisson complète à cœur. Découper ({poulet} de poulet cuit).",
      "Couper les légumes, ajouter leur huile, assaisonner et rôtir à 200 °C ({legumes} cuits).",
      "Cuire le riz sans huile ni beurre ({riz} de riz cuit). Préparer la sauce citronnée à part.",
      "Peser les éléments cuits et monter les box selon la fiche montage.",
    ],
    montage: [
      "Peser le riz, puis déposer les légumes rôtis.",
      "Ajouter la portion de poulet cuit.",
      "Placer le pot fermé de sauce citronnée à côté. Aucun ajout d'huile.",
    ],
    notes: [
      "Poulet, riz et légumes : poids CUITS. Riz pesé seul.",
      "Macros estimées par box : P1 ≈ 785 kcal (57 P / 94 G / 17 L), P2 ≈ 690 kcal (50 / 83 / 15), P3 ≈ 595 kcal (42 / 71 / 14).",
    ],
    allergenes: "Lait. Vérifier les ingrédients de la harissa et les étiquettes des produits.",
  },
];
