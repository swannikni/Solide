// « Ma semaine » : le client choisit ses repas depuis un lien WhatsApp.
// Zones de livraison (carte Chef2Box Marrakech), prix et délais.

import { FUSEAU, dateDuJour, decalerDate } from "@/lib/dates";
import { prixParJour, type Tarifs } from "@/lib/paiements";

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

// Prix de la semaine : chaque jour au prix de sa formule (1 repas : 690 / 5,
// midi + soir : 1 290 / 5) + livraison par jour livré selon la zone.
// Conditions du client (fiche) : remise en % sur les repas, livraison offerte.
export interface Conditions {
  remise?: number;
  livraisonOfferte?: boolean;
}

export function prixDemande(repas: RepasChoisi[], zone: Zone | null, tarifs: Tarifs, conditions: Conditions = {}) {
  const parJour = new Map<string, Set<Service>>();
  for (const r of repas) parJour.set(r.date, (parJour.get(r.date) ?? new Set()).add(r.service));
  const jours = parJour.size;
  const jours2 = [...parJour.values()].filter((s) => s.size >= 2).length;
  const deux = jours2 > 0;
  const brut = prixParJour(jours - jours2, jours2, tarifs);
  const remise = Math.min(100, Math.max(0, conditions.remise ?? 0));
  const prixRepas = Math.round((brut * (100 - remise)) / 100);
  // Livraison par jour livré selon la zone ; offerte les jours midi + soir
  // (dans la zone de la carte ; au-delà, sur devis).
  const parJourLivraison = conditions.livraisonOfferte ? 0 : prixZone(zone);
  const prixLivraison = parJourLivraison == null ? null : parJourLivraison * (jours - jours2);
  return {
    jours,
    jours1: jours - jours2,
    jours2,
    formule: deux ? 2 : 1,
    brut,
    remise,
    prixRepas,
    prixLivraison,
    total: prixLivraison == null ? null : prixRepas + prixLivraison,
  };
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

// Premier jour affiché dans « À venir » : aujourd'hui, mais la semaine
// s'arrête le vendredi à 15 h (livraisons faites) → lundi suivant.
export function debutAVenir(maintenant = new Date()) {
  const aujourdhui = dateDuJour(maintenant);
  const j = new Date(`${aujourdhui}T12:00:00Z`).getUTCDay();
  const heure = Number(new Intl.DateTimeFormat("en-GB", { timeZone: FUSEAU, hour: "numeric", hour12: false }).format(maintenant));
  if (j === 5 && heure >= 15) return decalerDate(aujourdhui, 3);
  return aujourdhui;
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
