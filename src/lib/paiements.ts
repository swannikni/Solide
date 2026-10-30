// Calcul des montants à payer à partir de la fiche cuisine.
// Formules à la semaine (du lundi au vendredi) : 1 repas par jour ou 2 repas
// par jour (midi et soir), multipliées par le nombre de boîtes (×2 : deux
// portions). Les repas du samedi s'ajoutent au prix d'un repas (formule
// 1 repas / 5). Une semaine compte dans le mois de son lundi.

export interface Tarifs {
  un_repas: number; // DH par semaine
  deux_repas: number;
}
export const TARIFS_DEFAUT: Tarifs = { un_repas: 690, deux_repas: 1290 };

export function completerTarifs(t: Partial<Tarifs> | null | undefined): Tarifs {
  const n = (v: unknown, d: number) => (typeof v === "number" && v >= 0 ? v : d);
  return { un_repas: n(t?.un_repas, TARIFS_DEFAUT.un_repas), deux_repas: n(t?.deux_repas, TARIFS_DEFAUT.deux_repas) };
}

export interface SemaineRepas {
  lundi: string; // AAAA-MM-JJ
  jours: number; // jours du lundi au vendredi avec au moins un repas
  formule: 1 | 2; // 2 si midi et soir au moins un jour
  boites: number; // portions par repas (le plus grand nombre de la semaine)
  samedi: number; // boîtes du samedi, comptées à part
}

const jour = (d: string) => new Date(`${d}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

// Lundis du mois (AAAA-MM) et période couverte : du premier lundi au
// vendredi de la semaine du dernier lundi.
export function periodeDuMois(mois: string) {
  const d = jour(`${mois}-01`);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  const lundis: string[] = [];
  while (iso(d).startsWith(mois)) {
    lundis.push(iso(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  const fin = jour(lundis[lundis.length - 1]);
  fin.setUTCDate(fin.getUTCDate() + 5); // jusqu'au samedi
  return { lundis, debut: lundis[0], fin: iso(fin) };
}

// Lundi de la semaine d'une date.
export function lundiDe(date: string) {
  const d = jour(date);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
}

// Repas d'une personne un jour donné : services (midi, soir) et boîtes.
export interface RepasDuJour {
  services: number; // 1 ou 2
  boites: number; // total des boîtes du jour
  max: number; // plus grand nombre de boîtes pour un même repas
}

// Semaines d'une personne à partir de ses repas, jour par jour.
export function semainesDe(repasParJour: Map<string, RepasDuJour>): SemaineRepas[] {
  const parSemaine = new Map<string, SemaineRepas>();
  for (const [date, r] of repasParJour) {
    const j = jour(date).getUTCDay();
    if (j === 0 || r.services <= 0) continue; // dimanche : pas de livraison
    const lundi = lundiDe(date);
    const s = parSemaine.get(lundi) ?? { lundi, jours: 0, formule: 1 as const, boites: 1, samedi: 0 };
    if (j === 6) s.samedi += r.boites;
    else {
      s.jours++;
      if (r.services >= 2) s.formule = 2;
      s.boites = Math.max(s.boites, r.max);
    }
    parSemaine.set(lundi, s);
  }
  return [...parSemaine.values()].sort((a, b) => a.lundi.localeCompare(b.lundi));
}

// Prix d'un repas du samedi : celui de la formule 1 repas par jour.
export const prixRepasSamedi = (tarifs: Tarifs) => Math.round(tarifs.un_repas / 5);

// Prix d'une semaine : l'offre de la personne (prix par semaine) sinon le
// tarif, multiplié par les boîtes ; plus les repas du samedi.
export const prixSemaine = (s: SemaineRepas, tarifs: Tarifs, offre: number | null) =>
  (s.jours > 0 ? (offre ?? (s.formule === 2 ? tarifs.deux_repas : tarifs.un_repas)) * (s.boites ?? 1) : 0) +
  (s.samedi ?? 0) * prixRepasSamedi(tarifs);

export const montantAuto = (semaines: SemaineRepas[], tarifs: Tarifs, offre: number | null) =>
  semaines.reduce((t, s) => t + prixSemaine(s, tarifs, offre), 0);
