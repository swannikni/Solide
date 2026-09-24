import type { RepasJournal } from "@/lib/types";

export interface Totaux {
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
}

export function totauxDuJour(repas: RepasJournal[]): Totaux {
  return repas.reduce(
    (acc, r) => ({
      calories: acc.calories + r.calories * r.quantite,
      proteines: acc.proteines + r.proteines * r.quantite,
      glucides: acc.glucides + r.glucides * r.quantite,
      lipides: acc.lipides + r.lipides * r.quantite,
    }),
    { calories: 0, proteines: 0, glucides: 0, lipides: 0 }
  );
}

export const REPAS_TYPE_LABELS: Record<string, string> = {
  petit_dejeuner: "Petit-déjeuner",
  dejeuner: "Déjeuner",
  diner: "Dîner",
  collation: "Collation",
};
