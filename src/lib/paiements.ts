// Calcul des montants à payer à partir de la fiche cuisine.
// Formules à la semaine (du lundi au vendredi) : 1 repas par jour ou 2 repas
// par jour (midi et soir). Une semaine compte dans le mois de son lundi.

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
  fin.setUTCDate(fin.getUTCDate() + 4);
  return { lundis, debut: lundis[0], fin: iso(fin) };
}

// Lundi de la semaine d'une date.
export function lundiDe(date: string) {
  const d = jour(date);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
}

// Semaines d'une personne à partir de ses repas (date → nombre de repas ce jour).
export function semainesDe(repasParJour: Map<string, number>): SemaineRepas[] {
  const parSemaine = new Map<string, SemaineRepas>();
  for (const [date, n] of repasParJour) {
    const j = jour(date).getUTCDay();
    if (j === 0 || j === 6 || n <= 0) continue; // week-end : hors formule
    const lundi = lundiDe(date);
    const s = parSemaine.get(lundi) ?? { lundi, jours: 0, formule: 1 as const };
    s.jours++;
    if (n >= 2) s.formule = 2;
    parSemaine.set(lundi, s);
  }
  return [...parSemaine.values()].sort((a, b) => a.lundi.localeCompare(b.lundi));
}

// Prix d'une semaine : l'offre de la personne (prix par semaine) sinon le tarif.
export const prixSemaine = (s: SemaineRepas, tarifs: Tarifs, offre: number | null) =>
  offre ?? (s.formule === 2 ? tarifs.deux_repas : tarifs.un_repas);

export const montantAuto = (semaines: SemaineRepas[], tarifs: Tarifs, offre: number | null) =>
  semaines.reduce((t, s) => t + prixSemaine(s, tarifs, offre), 0);
