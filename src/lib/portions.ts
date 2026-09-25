// Portions du quotidien pour les aliments au poids (valeurs pour 100 g) :
// « 1 œuf », « 1 c. à soupe »… au lieu de deviner les grammes.
// Poids moyens (parties comestibles), arrondis.

export interface PortionUsuelle {
  libelle: string;
  grammes: number;
}

// Chaque motif est ancré au début du nom (« Oeuf, cuit dur », « Poulet, filet ») :
// « Brick à l'oeuf » ou « Tajine de poulet » ne reçoivent pas la portion d'un œuf
// ou d'un filet. Les plus précis d'abord (« huile d'olive » avant « olive »).
const REGLES: { motif: RegExp; portions: PortionUsuelle[] }[] = [
  { motif: /^huile/, portions: [{ libelle: "1 c. à café", grammes: 4 }, { libelle: "1 c. à soupe", grammes: 10 }] },
  { motif: /^oeufs?\b/, portions: [{ libelle: "1 œuf", grammes: 55 }, { libelle: "2 œufs", grammes: 110 }] },
  { motif: /^banane/, portions: [{ libelle: "1 banane", grammes: 120 }] },
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
  { motif: /^lait\b/, portions: [{ libelle: "1 verre", grammes: 200 }, { libelle: "1 bol", grammes: 250 }] },
  { motif: /^jus\b/, portions: [{ libelle: "1 verre", grammes: 200 }] },
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
