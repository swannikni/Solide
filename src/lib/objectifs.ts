// Calcul des objectifs : repris à l'identique du questionnaire de
// chef2box.com (fonction genererBilan), pour que l'appli donne les mêmes
// chiffres que le bilan reçu par le client.

export const PALIERS = ["P1", "P2", "P3", "P4", "P5", "P6"] as const;

export const OBJECTIFS = [
  "Perte de poids",
  "Prise de muscle",
  "Maintien / Équilibre",
  "Performance sportive",
  "Manger plus sainement",
] as const;
export const SEANCES = ["0", "1-2", "3-4", "5+"] as const;
export const METIERS = [
  "Principalement assis",
  "Debout une partie",
  "Physiquement actif",
  "Travail très physique",
] as const;
export const GRIGNOTAGE = [
  "Rarement / jamais",
  "Occasionnellement",
  "Plusieurs fois/semaine",
  "Presque tous les jours",
] as const;

export interface Profil {
  sexe: "Homme" | "Femme";
  age: number;
  taille: number; // cm
  poids: number; // kg
  objectifs: string[];
  seances: (typeof SEANCES)[number];
  job: (typeof METIERS)[number];
  grignotage: (typeof GRIGNOTAGE)[number];
}

export function calculerObjectifs(p: Profil) {
  // BMR Mifflin-St Jeor
  const bmr =
    p.sexe === "Femme"
      ? 10 * p.poids + 6.25 * p.taille - 5 * p.age - 161
      : 10 * p.poids + 6.25 * p.taille - 5 * p.age + 5;

  // Facteur d'activité (travail + séances de sport)
  const jobTresPhysique = p.job === "Travail très physique";
  const jobPhysique = p.job === "Physiquement actif";
  const jobDebout = p.job === "Debout une partie";
  const sportEleve = p.seances === "5+";
  const sportActif = p.seances === "3-4";

  let facteur = 1.35;
  if (jobTresPhysique && sportEleve) facteur = 1.9;
  else if (jobTresPhysique) facteur = 1.8;
  else if (jobPhysique && sportEleve) facteur = 1.75;
  else if (jobPhysique && sportActif) facteur = 1.65;
  else if (sportEleve) facteur = 1.65;
  else if (p.seances === "3-4") facteur = 1.5;
  else if (p.seances === "1-2" && jobDebout) facteur = 1.45;
  else if (p.seances === "1-2") facteur = 1.4;
  else if (jobDebout) facteur = 1.4;

  const tdee = Math.round(bmr * facteur);

  const objectif = p.objectifs.join(", ");
  const pertePoids = objectif.includes("Perte");
  const priseMuscle = objectif.includes("Prise");

  let ajust = 0;
  if (pertePoids) {
    // Perte de poids prime toujours : déficit selon le grignotage.
    // (Même test que le questionnaire : "plusieurs" en minuscule ne
    // correspond jamais à "Plusieurs fois/semaine", qui prend donc -17 %.)
    if (p.grignotage.includes("tous les jours")) ajust = -0.07;
    else if (p.grignotage.includes("plusieurs")) ajust = -0.12;
    else ajust = -0.17;
  } else if (priseMuscle) {
    ajust = 0.08;
  }

  let kcal = Math.round(tdee * (1 + ajust));
  const protF = priseMuscle ? 2.1 : pertePoids ? 2.0 : 1.8;
  const proteines = Math.round(p.poids * protF);
  const lipides = Math.round(p.poids * (pertePoids && !priseMuscle ? 0.85 : 0.9));
  const glucides = Math.max(50, Math.round((kcal - proteines * 4 - lipides * 9) / 4));
  kcal = proteines * 4 + glucides * 4 + lipides * 9;

  return { calories: kcal, proteines, glucides, lipides };
}

export function profilComplet(p: Partial<Profil>): p is Profil {
  return (
    (p.sexe === "Homme" || p.sexe === "Femme") &&
    !!p.age &&
    p.age > 0 &&
    !!p.taille &&
    p.taille > 0 &&
    !!p.poids &&
    p.poids > 0 &&
    Array.isArray(p.objectifs) &&
    p.objectifs.length > 0 &&
    !!p.seances &&
    !!p.job &&
    !!p.grignotage
  );
}
