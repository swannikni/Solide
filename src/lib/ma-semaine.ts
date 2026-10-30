// « Ma semaine » : le client choisit ses repas depuis un lien WhatsApp.
// Zones de livraison (carte Chef2Box Marrakech), prix et délais.

import { FUSEAU, dateDuJour, decalerDate } from "@/lib/dates";
import type { Tarifs } from "@/lib/paiements";

export type Zone = "retrait" | "z10" | "z15" | "z20" | "devis";
export type Service = "dejeuner" | "diner";
export interface RepasChoisi {
  date: string; // AAAA-MM-JJ
  service: Service;
}

// Prix de livraison par jour livré (null : sur devis).
export const ZONES: { cle: Zone; libelle: string; prix: number | null; quartiers: string[] }[] = [
  { cle: "retrait", libelle: "Retrait gratuit · Sweat On (Victor Hugo)", prix: 0, quartiers: ["Retrait Sweat On (Victor Hugo)"] },
  {
    cle: "z10",
    libelle: "10 DH / jour",
    prix: 10,
    quartiers: ["Guéliz", "Victor Hugo", "Route de Casa", "Semlalia", "Sidi Abbad", "Assif", "Izdihar", "Amerchich", "Majorelle"],
  },
  {
    cle: "z15",
    libelle: "15 DH / jour",
    prix: 15,
    quartiers: [
      "Targa",
      "Azzouzia",
      "Sidi Ghanem",
      "Mabrouka",
      "Hay Charaf",
      "Camp El Ghoul",
      "Massira 1 · 2 · 3",
      "Gare",
      "M Avenue",
      "Hivernage",
      "Médina",
      "Bab Doukkala",
      "Mellah / Kasbah",
      "Daoudiate",
      "Palmeraie",
      "Aïn Itti",
    ],
  },
  {
    cle: "z20",
    libelle: "20 DH / jour",
    prix: 20,
    quartiers: ["Azli", "Ménara", "Aéroport", "Bouakaz", "M'Hamid", "Prestigia", "Chrifia", "Agdal", "Sidi Youssef Ben Ali", "Amelkis", "Al Maaden"],
  },
  { cle: "devis", libelle: "Autre quartier · sur devis", prix: null, quartiers: ["Autre quartier"] },
];

export const zoneDuQuartier = (quartier: string): Zone | null => ZONES.find((z) => z.quartiers.includes(quartier))?.cle ?? null;
export const prixZone = (zone: Zone | null | undefined) => ZONES.find((z) => z.cle === zone)?.prix ?? null;

// Prix de la semaine : formule (1 repas par jour, ou 2 si midi et soir un
// même jour) + livraison par jour livré selon la zone.
export function prixDemande(repas: RepasChoisi[], zone: Zone | null, tarifs: Tarifs) {
  const parJour = new Map<string, Set<Service>>();
  for (const r of repas) parJour.set(r.date, (parJour.get(r.date) ?? new Set()).add(r.service));
  const jours = parJour.size;
  const deux = [...parJour.values()].some((s) => s.size >= 2);
  const prixRepas = jours === 0 ? 0 : deux ? tarifs.deux_repas : tarifs.un_repas;
  const parJourLivraison = prixZone(zone);
  const prixLivraison = parJourLivraison == null ? null : parJourLivraison * jours;
  return { jours, formule: deux ? 2 : 1, prixRepas, prixLivraison, total: prixLivraison == null ? null : prixRepas + prixLivraison };
}

// Un repas se commande jusqu'à la veille 20 h (heure du Maroc), du lundi au vendredi.
export function encoreModifiable(date: string, maintenant = new Date()) {
  const j = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (j === 0 || j === 6) return false;
  const aujourdhui = dateDuJour(maintenant);
  const veille = decalerDate(date, -1);
  if (aujourdhui < veille) return true;
  if (aujourdhui > veille) return false;
  const heure = Number(new Intl.DateTimeFormat("en-GB", { timeZone: FUSEAU, hour: "numeric", hour12: false }).format(maintenant));
  return heure < 20;
}

// Lundi de la semaine d'une date.
export function lundiDe(date: string) {
  const j = new Date(`${date}T12:00:00Z`).getUTCDay();
  return decalerDate(date, j === 0 ? -6 : 1 - j);
}

// Jeton de lien personnel (24 caractères, sans ambiguïté).
export function nouveauJeton() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const octets = new Uint8Array(24);
  crypto.getRandomValues(octets);
  return Array.from(octets, (o) => alphabet[o % alphabet.length]).join("");
}
