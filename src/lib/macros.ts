import type { RepasJournal, RepasType } from "@/lib/types";

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
  collation: "Collation",
  diner: "Dîner",
};

export const ORDRE_REPAS: RepasType[] = ["petit_dejeuner", "dejeuner", "collation", "diner"];

export function repasSelonHeure(date = new Date()): RepasType {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 10.5) return "petit_dejeuner";
  if (h < 15) return "dejeuner";
  if (h < 18.5) return "collation";
  return "diner";
}
