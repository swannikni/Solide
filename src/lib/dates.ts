// Les clients sont à Marrakech : "aujourd'hui" suit l'heure du Maroc, pas
// celle du serveur (UTC).
export const FUSEAU = "Africa/Casablanca";

export function dateDuJour(maintenant = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU }).format(maintenant);
}

export function estDateValide(texte: string | undefined | null): texte is string {
  return !!texte && /^\d{4}-\d{2}-\d{2}$/.test(texte) && !Number.isNaN(Date.parse(`${texte}T12:00:00Z`));
}

export function decalerDate(date: string, jours: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

export function libelleDate(date: string, aujourdhui = dateDuJour()): string {
  if (date === aujourdhui) return "Aujourd'hui";
  if (date === decalerDate(aujourdhui, -1)) return "Hier";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

// Instant (ISO, UTC) où commence la journée `date` à Marrakech.
export function debutDuJour(date: string): string {
  const midiUtc = new Date(`${date}T12:00:00Z`);
  const decalage = new Intl.DateTimeFormat("en-US", { timeZone: FUSEAU, timeZoneName: "longOffset" })
    .formatToParts(midiUtc)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT+01:00" ou "GMT"
  const m = decalage?.match(/GMT([+-])(\d{2}):(\d{2})/);
  const minutes = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(Date.parse(`${date}T00:00:00Z`) - minutes * 60_000).toISOString();
}
