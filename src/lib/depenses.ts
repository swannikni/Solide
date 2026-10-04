// Catégories de dépenses (table application_depenses).
export type CategorieDepense = "courses" | "emballage" | "livraison" | "marketing" | "autres";

export const CATEGORIES: { cle: CategorieDepense; libelle: string; emoji: string; couleur: string }[] = [
  { cle: "courses", libelle: "Courses", emoji: "🛒", couleur: "#4f7d4a" },
  { cle: "emballage", libelle: "Emballage", emoji: "📦", couleur: "#c9973a" },
  { cle: "livraison", libelle: "Livraison", emoji: "🛵", couleur: "#3e6e96" },
  { cle: "marketing", libelle: "Marketing", emoji: "📣", couleur: "#b5603f" },
  { cle: "autres", libelle: "Autres", emoji: "🧾", couleur: "#6d5a96" },
];

export const categorie = (cle: CategorieDepense) => CATEGORIES.find((c) => c.cle === cle) ?? CATEGORIES[4];

export interface Depense {
  id: string;
  date: string;
  categorie: CategorieDepense;
  montant: number;
  libelle: string | null;
  moyen: "especes" | "virement" | "carte" | "autre" | null;
}
