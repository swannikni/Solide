// Réglages des tournées de livraison (table application_livraison_reglages).

export interface ReglagesLivraison {
  depart: { adresse: string; lat: number; lng: number } | null;
  livreurs: { nom: string; telephone: string; tarif: number }[]; // tarif : DH par livraison
  nbLivreurs: number;
  heureMidi: string;
  heureSoir: string;
  vitesseKmh: number;
  minutesParArret: number;
}

export const REGLAGES_DEFAUT: ReglagesLivraison = {
  depart: null,
  livreurs: [
    { nom: "Moi", telephone: "", tarif: 0 },
    { nom: "Livreur 2", telephone: "", tarif: 0 },
    { nom: "Livreur 3", telephone: "", tarif: 0 },
  ],
  nbLivreurs: 2,
  heureMidi: "11:30",
  heureSoir: "18:30",
  vitesseKmh: 22,
  minutesParArret: 4,
};

// Réglages enregistrés complétés par les valeurs par défaut (3 livreurs).
export function completerReglages(enregistres: Partial<ReglagesLivraison> | null | undefined): ReglagesLivraison {
  const r = { ...REGLAGES_DEFAUT, ...(enregistres ?? {}) };
  const livreurs = REGLAGES_DEFAUT.livreurs.map((defaut, i) => ({ ...defaut, ...(r.livreurs?.[i] ?? {}) }));
  return { ...r, livreurs };
}
