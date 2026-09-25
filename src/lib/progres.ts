import { decalerDate } from "@/lib/dates";

// Totaux d'une journée à partir des repas notés.
export interface Journee {
  date: string;
  calories: number;
  proteines: number;
  repas: number;
}

export function totauxParJour(
  lignes: { date: string; calories: number; proteines: number; quantite: number }[]
): Map<string, Journee> {
  const jours = new Map<string, Journee>();
  for (const l of lignes) {
    const j = jours.get(l.date) ?? { date: l.date, calories: 0, proteines: 0, repas: 0 };
    j.calories += Number(l.calories) * Number(l.quantite);
    j.proteines += Number(l.proteines) * Number(l.quantite);
    j.repas += 1;
    jours.set(l.date, j);
  }
  return jours;
}

// Série en cours : jours d'affilée avec au moins un repas noté. Elle n'est pas
// cassée tant que la journée d'aujourd'hui n'est pas finie.
export function serieActuelle(dates: Set<string>, aujourdhui: string): number {
  let jour = dates.has(aujourdhui) ? aujourdhui : decalerDate(aujourdhui, -1);
  let serie = 0;
  while (dates.has(jour)) {
    serie++;
    jour = decalerDate(jour, -1);
  }
  return serie;
}

export function meilleureSerie(dates: Set<string>): number {
  let meilleure = 0;
  for (const d of dates) {
    if (dates.has(decalerDate(d, -1))) continue; // pas le début d'une série
    let n = 0;
    let jour = d;
    while (dates.has(jour)) {
      n++;
      jour = decalerDate(jour, 1);
    }
    meilleure = Math.max(meilleure, n);
  }
  return meilleure;
}

// Journée « dans l'objectif » : calories à ±10 % de l'objectif.
export const dansObjectifCalories = (j: Journee, objectif: number) =>
  objectif > 0 && Math.abs(j.calories - objectif) <= objectif * 0.1;

// Protéines atteintes : au moins 90 % de l'objectif.
export const proteinesAtteintes = (j: Journee, objectif: number) => objectif > 0 && j.proteines >= objectif * 0.9;

export interface Badge {
  id: string;
  emoji: string;
  titre: string;
  detail: string;
  // Avancement : valeur actuelle sur la cible (ex. 5 jours sur 7).
  valeur: number;
  cible: number;
  unite: string;
  obtenu: boolean;
}

export function calculerBadges({
  jours,
  record,
  objectifCalories,
  objectifProteines,
  pesees,
  kilosVersObjectif,
  objectifAtteint,
}: {
  jours: Journee[];
  record: number;
  objectifCalories: number;
  objectifProteines: number;
  pesees: number;
  kilosVersObjectif: number;
  objectifAtteint: boolean;
}): Badge[] {
  const totalRepas = jours.reduce((t, j) => t + j.repas, 0);
  const joursProteines = jours.filter((j) => proteinesAtteintes(j, objectifProteines)).length;
  const joursCalories = jours.filter((j) => dansObjectifCalories(j, objectifCalories)).length;
  const kilos = Math.floor(kilosVersObjectif * 10) / 10;
  const b = (id: string, emoji: string, titre: string, detail: string, valeur: number, cible: number, unite: string) => ({
    id, emoji, titre, detail, valeur: Math.min(valeur, cible), cible, unite, obtenu: valeur >= cible,
  });
  return [
    b("premier", "🍽️", "Premier pas", "Noter un premier repas", totalRepas, 1, "repas"),
    b("serie3", "🔥", "Lancé", "3 jours d'affilée", record, 3, "jours"),
    b("serie7", "⚡", "Semaine parfaite", "7 jours d'affilée", record, 7, "jours"),
    b("serie30", "👑", "Inarrêtable", "30 jours d'affilée", record, 30, "jours"),
    b("pesee", "⚖️", "Point de départ", "Première pesée", pesees, 1, "pesée"),
    b("prot5", "💪", "Protéiné", "5 jours d'objectif protéines", joursProteines, 5, "jours"),
    b("cal7", "🎯", "Dans le mille", "7 jours dans l'objectif calories", joursCalories, 7, "jours"),
    b("kilo1", "📉", "Premier kilo", "1 kg vers l'objectif", kilos, 1, "kg"),
    b("kilo5", "🚀", "5 kilos", "5 kg vers l'objectif", kilos, 5, "kg"),
    b("repas100", "📒", "Centurion", "100 repas notés", totalRepas, 100, "repas"),
    b("but", "🏆", "Objectif atteint", "Poids objectif atteint", objectifAtteint ? 1 : 0, 1, ""),
  ];
}
