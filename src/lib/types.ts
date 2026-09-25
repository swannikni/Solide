export type Palier = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";
export type RepasType = "petit_dejeuner" | "dejeuner" | "diner" | "collation";
export type SourceRepas = "chef2box" | "code_barres" | "manuel";

export interface Client {
  id: string;
  nom: string;
  telephone: string | null;
  palier: Palier | null;
  objectif_calories: number;
  objectif_proteines: number;
  objectif_glucides: number;
  objectif_lipides: number;
  est_admin: boolean;
  profil?: import("@/lib/objectifs").Profil | null;
  poids_objectif?: number | null;
  created_at: string;
}

export interface Plat {
  id: string;
  nom: string;
  description: string | null;
  qr_code: string;
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
  photo_url: string | null;
  actif: boolean;
  created_at: string;
}

export interface Aliment {
  id: number;
  code_ciqual: string | null;
  nom: string;
  groupe: string | null;
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
}

export interface RepasJournal {
  id: string;
  client_id: string;
  date: string;
  repas_type: RepasType;
  source: SourceRepas;
  nom: string;
  quantite: number;
  unite: "g" | "portion" | null; // "g" : quantite = grammes / 100
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
  photo_url: string | null;
  plat_id: string | null;
  commande_id: string | null;
  cree_par: "client" | "admin";
  created_at: string;
}

export interface Message {
  id: string;
  client_id: string;
  expediteur: "client" | "admin";
  contenu: string;
  lu: boolean;
  created_at: string;
}

export interface Favori {
  id: string;
  client_id: string;
  nom: string;
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
  unite: "g" | "portion";
  quantite: number;
  source: SourceRepas;
  plat_id: string | null;
  // Repas complet enregistré en favori (sinon null : un seul aliment).
  elements?: ElementRepas[] | null;
  created_at: string;
}

export interface ElementRepas {
  nom: string;
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
  unite: "g" | "portion";
  quantite: number;
  source: SourceRepas;
  plat_id: string | null;
}

export interface Poids {
  id: string;
  client_id: string;
  date: string;
  poids_kg: number;
  created_at: string;
}

// Produit d'une chaîne de restauration, valeurs officielles par portion.
export interface ProduitRestaurant {
  id: number;
  enseigne: string;
  nom: string;
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
  portion_g: number | null;
  pays: string;
  source_url: string;
}

// Questionnaire rempli sur chef2box.com (ou repris de l'ancien outil),
// en attente de création du compte client.
export interface Questionnaire {
  id: string;
  created_at: string;
  source: "site" | "ancien_outil";
  nom: string;
  email: string | null;
  telephone: string | null;
  calories: number | null;
  proteines: number | null;
  glucides: number | null;
  lipides: number | null;
  palier: Palier | null;
  profil: import("@/lib/objectifs").Profil | null;
  reponses: Record<string, string | number | null>;
  statut: "nouveau" | "compte_cree" | "ignore";
  client_id: string | null;
}

export interface Points {
  jours: number;
  jours_calories: number;
  jours_proteines: number;
  bonus_series: number;
  defis: number;
  gagnes: number;
  depenses: number;
  solde: number;
}

export interface Recompense {
  id: string;
  emoji: string;
  titre: string;
  cout: number;
  actif: boolean;
  ordre: number;
}

export interface DemandeRecompense {
  id: string;
  client_id: string;
  recompense_id: string | null;
  titre: string;
  cout: number;
  statut: "en_attente" | "remise" | "refusee";
  created_at: string;
  traite_le: string | null;
}

export type TypeDefi = "jours_notes" | "jours_calories" | "jours_proteines";

export interface Defi {
  id: string;
  titre: string;
  type: TypeDefi;
  cible: number;
  date_debut: string;
  date_fin: string;
  points: number;
  // Avancement du client (jours validés sur la période).
  fait?: number;
}
