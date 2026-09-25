// Calcul des objectifs : repris à l'identique du questionnaire en ligne de
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

export const PLAISIR = [
  "—",
  "Je peux me limiter facilement",
  "Plaisir de temps en temps",
  "Selon humeur / fatigue",
  "J'ai du mal à m'arrêter",
] as const;

// Paliers du repas Chef2Box, choisis selon les calories du jour (identique au site).
export const C2B_PALIERS = [
  { n: 1, min: 3800, kcal: 1000, prot: 50, lip: 30, gluc: 132 },
  { n: 2, min: 3000, kcal: 950, prot: 50, lip: 30, gluc: 120 },
  { n: 3, min: 2500, kcal: 800, prot: 45, lip: 27, gluc: 94 },
  { n: 4, min: 2000, kcal: 680, prot: 40, lip: 24, gluc: 76 },
  { n: 5, min: 1500, kcal: 550, prot: 35, lip: 20, gluc: 57 },
  { n: 6, min: 0, kcal: 450, prot: 30, lip: 17, gluc: 44 },
] as const;

export interface Profil {
  sexe: "Homme" | "Femme";
  age: number;
  taille: number; // cm
  poids: number; // kg
  objectifs: string[];
  seances: (typeof SEANCES)[number];
  job: (typeof METIERS)[number];
  grignotage: (typeof GRIGNOTAGE)[number] | "—";
  plaisir?: (typeof PLAISIR)[number];
}

// Copie fidèle de genererBilan() sur chef2box.com (version en ligne).
export function calculerObjectifs(p: Profil) {
  const poids = p.poids;
  const job = p.job;
  const seances = p.seances;
  const objectif = p.objectifs.join(", ");
  const grigno = p.grignotage || "—";
  const plaisir = p.plaisir || "—";

  // BMR Mifflin-St Jeor
  const bmr =
    p.sexe === "Femme"
      ? 10 * poids + 6.25 * p.taille - 5 * p.age - 161
      : 10 * poids + 6.25 * p.taille - 5 * p.age + 5;

  // Facteur d'activité
  const jobTresPhysique =
    job.indexOf("tres physique") !== -1 || job.indexOf("très physique") !== -1 || job.indexOf("Travail tr") !== -1;
  const jobPhysique = job.indexOf("Physiquement") !== -1 || job.indexOf("physique") !== -1;
  const jobDebout = job.indexOf("Debout") !== -1;
  const sportEleve = seances === "5+";
  const sportActif = seances === "3-4" || seances === "5+";

  let facteur: number;
  if (jobTresPhysique && sportEleve) facteur = 1.78;
  else if (jobTresPhysique) facteur = 1.68;
  else if (jobPhysique && sportEleve) facteur = 1.62;
  else if (jobPhysique && sportActif) facteur = 1.58;
  else if (sportEleve) facteur = 1.6;
  else if (seances === "3-4") facteur = 1.45;
  else if (seances === "1-2" && jobDebout) facteur = 1.4;
  else if (seances === "1-2") facteur = 1.35;
  else if (jobDebout) facteur = 1.35;
  else facteur = 1.25;
  const tdee = Math.round(bmr * facteur);

  // Ajustement selon l'objectif : la perte de poids prime toujours
  const pertePoids = objectif.indexOf("Perte") !== -1;
  const priseMuscle = objectif.indexOf("Prise") !== -1;
  const performance = objectif.indexOf("Performance") !== -1;
  const recompo = objectif.indexOf("recompo") !== -1;
  let ajust = 0;
  if (pertePoids) {
    if (
      grigno.toLowerCase().indexOf("tous les jours") !== -1 ||
      plaisir.indexOf("mal a m'arreter") !== -1 ||
      plaisir.indexOf("mal à m'arrêter") !== -1 ||
      plaisir.indexOf("humeur") !== -1
    )
      ajust = -0.12;
    else if (grigno.toLowerCase().indexOf("plusieurs") !== -1 || plaisir.indexOf("temps en temps") !== -1) ajust = -0.15;
    else ajust = -0.18;
  } else if (recompo || (pertePoids && performance)) {
    ajust = -0.07;
  } else if (priseMuscle) {
    ajust = 0.08;
  }
  let kcal = Math.round(tdee * (1 + ajust));

  // Plancher de sécurité
  const kcalMin = Math.max(Math.round(bmr), p.sexe === "Femme" ? 1200 : 1500);
  if (kcal < kcalMin) kcal = kcalMin;

  // Macros
  const protF = priseMuscle ? 2.1 : pertePoids || recompo ? 2.0 : 1.8;
  const proteines = Math.round(poids * protF);
  const lipides = Math.round(poids * (pertePoids ? 0.85 : 0.9));
  const glucides = Math.max(50, Math.round((kcal - proteines * 4 - lipides * 9) / 4));
  kcal = proteines * 4 + glucides * 4 + lipides * 9;

  const palier = C2B_PALIERS.find((x) => kcal >= x.min) ?? C2B_PALIERS[C2B_PALIERS.length - 1];

  return { calories: kcal, proteines, glucides, lipides, palier: `P${palier.n}` as (typeof PALIERS)[number] };
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
    !!p.job
  );
}
