"use client";

import { useEffect, useState } from "react";
import { X, QrCode, Barcode, PenLine, Camera, Search, Loader2, Star, History, UtensilsCrossed, Pencil, Trash2, Plus, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Scanner } from "@/components/Scanner";
import { Pastille } from "@/components/Pastille";
import { Portail } from "@/components/Portail";
import { chercherProduitParCodeBarres, rechercherProduitsParNom } from "@/lib/openfoodfacts";
import { ALIMENTS_POPULAIRES } from "@/lib/aliments-populaires";
import { codeDepuisScan } from "@/lib/qr";
import { estLiquide, portionsPour, type PortionUsuelle } from "@/lib/portions";
import { nomSimple } from "@/lib/noms-aliments";
import { BUCKET_PHOTOS } from "@/lib/photos";
import { ORDRE_REPAS, REPAS_TYPE_LABELS } from "@/lib/macros";
import type { Aliment, ElementRepas, Favori, ProduitRestaurant, RepasJournal, RepasType, SourceRepas } from "@/lib/types";

type Etape = "choix" | "mon_plat" | "favori_repas" | "favori_edition" | "scan_chef2box" | "scan_barcode" | "recherche_code" | "manuel" | "confirmation" | "erreur";

type ProduitMarque = Awaited<ReturnType<typeof rechercherProduitsParNom>>[number];

export const GRAMMES_RAPIDES = [50, 100, 150, 200, 250];

const RE_CRU = /\bcrue?s?\b/i;
const RE_CUIT = /(cuit|rôti|poêlé|sauté|grillé|bouilli|vapeur|au four|frit)/i;
const RE_GRAS = /(\d+)\s?% MG/i;

const UNITES_GRAMMES =/^(kg|g|gr|grs|gramme|grammes)$/i;
const NOMBRE_AVEC_UNITE = /^(\d+(?:[.,]\d+)?)(kg|g|gr|grs|gramme|grammes)?$/i;

// "compote 45gr", "45 g compote", "riz 150" -> recherche sans le poids + grammes.
// Un nombre sans unité n'est un poids qu'en fin de recherche ("pain 7 céréales"
// garde son 7).
function analyserRecherche(texte: string): { termes: string; grammes: number | null } {
  const mots = texte.trim().split(/\s+/).filter(Boolean);
  const versGrammes = (nombre: string, unite?: string) => {
    const valeur = Number(nombre.replace(",", "."));
    return unite?.toLowerCase() === "kg" ? valeur * 1000 : valeur;
  };

  for (let i = 0; i < mots.length; i++) {
    const m = mots[i].match(NOMBRE_AVEC_UNITE);
    if (!m) continue;
    const uniteSeparee = !m[2] && mots[i + 1] && UNITES_GRAMMES.test(mots[i + 1]);
    if (m[2] || uniteSeparee) {
      const grammes = versGrammes(m[1], m[2] ?? mots[i + 1]);
      const termes = mots.filter((_, j) => j !== i && !(uniteSeparee && j === i + 1));
      return { termes: termes.join(" "), grammes: grammes > 0 ? grammes : null };
    }
  }

  const dernier = mots.length > 1 ? mots[mots.length - 1].match(/^\d+(?:[.,]\d+)?$/) : null;
  if (dernier) {
    const grammes = versGrammes(dernier[0]);
    return { termes: mots.slice(0, -1).join(" "), grammes: grammes > 0 ? grammes : null };
  }
  return { termes: mots.join(" "), grammes: null };
}

// Mots qui montrent qu'on cherche un plat de fast-food (texte sans accents).
const MOTS_ENSEIGNES = [
  "mcdo", "macdo", "mc do", "mcdonald", "burger king", " bk ", "big mac", "mcflurry", "mcmuffin",
  "mcchicken", "big tasty", "whopper", "kingbox", "king nuggets", "sundae", "happy meal",
];

const MOTS_VIDES = new Set(["de", "du", "des", "la", "le", "les", "au", "aux", "et", "en", "un", "une", "avec", "a"]);

function sansAccents(texte: string) {
  return texte.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe");
}

type ContextePortion = { groupe?: string | null; portionProduit?: PortionUsuelle | null };

interface Ajoute {
  id: string;
  nom: string;
  unite: "g" | "portion";
  quantite: number;
  calories: number; // pour 100 g ou pour 1 portion
  repas: RepasType;
}

interface Trouve {
  nom: string;
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
  source: SourceRepas;
  plat_id?: string;
  quantiteParDefaut: number;
  paGrammes?: boolean; // true si quantite = grammes / 100 (produit du commerce)
  portions?: PortionUsuelle[]; // portions proposées (fabricant, nom ou famille)
  liquide?: boolean; // boisson : quantités en ml
}

export function AddMealModal({
  clientId,
  repasTypeParDefaut = "dejeuner",
  prefillTrouve,
  date,
  favoris = [],
  recents = [],
  onClose,
  onAjoute,
}: {
  clientId: string;
  date: string;
  favoris?: Favori[];
  recents?: RepasJournal[];
  repasTypeParDefaut?: RepasType;
  prefillTrouve?: Trouve;
  onClose: () => void;
  onAjoute: () => void;
}) {
  const supabase = createClient();
  const [etape, setEtape] = useState<Etape>(prefillTrouve ? "confirmation" : "choix");
  const [messageErreur, setMessageErreur] = useState("");
  const [trouve, setTrouve] = useState<Trouve | null>(prefillTrouve ?? null);
  const [repasType, setRepasType] = useState<RepasType>(repasTypeParDefaut);
  const [quantite, setQuantite] = useState(1);
  const [grammes, setGrammes] = useState(100);
  const [saisieQuantite, setSaisieQuantite] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [rechercheManuelle, setRechercheManuelle] = useState("");
  const [resultatsAliments, setResultatsAliments] = useState<Aliment[]>([]);
  const [resultatsRestaurants, setResultatsRestaurants] = useState<ProduitRestaurant[]>([]);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [resultatsMarques, setResultatsMarques] = useState<ProduitMarque[] | null>(null);
  const [rechercheMarquesEnCours, setRechercheMarquesEnCours] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [nomAffiche, setNomAffiche] = useState(prefillTrouve?.nom ?? "");
  // Aliments ajoutés depuis l'ouverture : restent modifiables et supprimables ici.
  const [ajoutes, setAjoutes] = useState<Ajoute[]>([]);
  const [edition, setEdition] = useState<{ id: string; valeur: string } | null>(null);
  // Bandeau « ✓ ajouté · Annuler » après un ajout rapide.
  const [bandeau, setBandeau] = useState<{ id: string; texte: string } | null>(null);
  // « Mon plat Chef2Box » : macros recopiées de l'étiquette de la box.
  const [messageMonPlat, setMessageMonPlat] = useState("");
  // Favoris : liste locale (modifiable), repas complet choisi, favori en cours d'édition.
  const [listeFavoris, setListeFavoris] = useState(favoris);
  const [gererFavoris, setGererFavoris] = useState(false);
  const [favoriRepas, setFavoriRepas] = useState<{ favori: Favori; choix: { coche: boolean; valeur: string }[] } | null>(
    null
  );
  const [favoriEdite, setFavoriEdite] = useState<{
    favori: Favori;
    nom: string;
    calories: string;
    proteines: string;
    glucides: string;
    lipides: string;
    quantite: string;
  } | null>(null);
  const [monPlat, setMonPlat] = useState({ nom: "", calories: "", proteines: "", glucides: "", lipides: "" });
  const [origine, setOrigine] = useState<Etape>("choix");

  // Écran où revenir après un ajout ou un "Retour" depuis la confirmation.
  useEffect(() => {
    if (etape === "choix" || etape === "manuel") setOrigine(etape);
  }, [etape]);
  const [filtreCuisson, setFiltreCuisson] = useState<"tous" | "cru" | "cuit">("tous");
  const [filtreGras, setFiltreGras] = useState<string | null>(null);
  const [tousLesAliments, setTousLesAliments] = useState(false);
  const [tousLesRestaurants, setTousLesRestaurants] = useState(false);

  const { termes: termesRecherche, grammes: grammesSaisis } = analyserRecherche(rechercheManuelle);
  const rechercheActive = termesRecherche.length >= 2;

  // Variantes proposées en pastilles quand la recherche en contient plusieurs.
  // Cru / cuit n'a pas de sens pour les fruits : on ne regarde que les autres aliments.
  const horsFruits = resultatsAliments.filter((a) => a.groupe !== "fruits");
  const aDesCrus = horsFruits.some((a) => RE_CRU.test(a.nom));
  const aDesCuits = horsFruits.some((a) => RE_CUIT.test(a.nom));
  const tauxGras = Array.from(
    new Set(resultatsAliments.map((a) => a.nom.match(RE_GRAS)?.[1]).filter((t): t is string => !!t))
  ).sort((x, y) => Number(x) - Number(y));
  // Filtres sur le nom officiel, puis affichage du nom simplifié (sans doublons :
  // « Pomme, pulpe, crue » et « Pomme, pulpe et peau, crue » deviennent « Pomme »).
  const nomsVusAliments = new Set<string>();
  const alimentsAffiches = resultatsAliments
    .filter(
      (a) =>
        (filtreCuisson === "tous" || (filtreCuisson === "cru" ? RE_CRU : RE_CUIT).test(a.nom)) &&
        (filtreGras === null || a.nom.match(RE_GRAS)?.[1] === filtreGras)
    )
    .map((a) => ({ ...a, nom: nomSimple(a.nom, a.groupe) }))
    .filter((a) => {
      const cle = a.nom.toLowerCase();
      if (nomsVusAliments.has(cle)) return false;
      nomsVusAliments.add(cle);
      return true;
    });

  const nomsFavoris = new Set(favoris.map((f) => f.nom.toLowerCase()));
  const [favoriCoche, setFavoriCoche] = useState(false);
  useEffect(() => {
    setFavoriCoche(!!trouve && nomsFavoris.has(trouve.nom.toLowerCase()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trouve]);

  useEffect(() => {
    setNomAffiche(trouve?.nom ?? "");
    setSaisieQuantite(null);
  }, [trouve]);

  useEffect(() => {
    setFiltreCuisson("tous");
    setFiltreGras(null);
    setResultatsMarques(null);
    setTousLesAliments(false);
    setTousLesRestaurants(false);
    if (!rechercheActive) {
      setResultatsAliments([]);
      setResultatsRestaurants([]);
      setRechercheMarquesEnCours(false);
      return;
    }
    let annule = false;
    setRechercheEnCours(true);
    const minuteur = setTimeout(async () => {
      const [{ data }, { data: restaurants }] = await Promise.all([
        supabase.rpc("application_rechercher_aliments", { q: termesRecherche, limite: 30 }),
        supabase.rpc("application_rechercher_restaurants", { q: termesRecherche, limite: 8 }),
      ]);
      if (!annule) {
        setResultatsAliments((data as Aliment[] | null) ?? []);
        setResultatsRestaurants((restaurants as ProduitRestaurant[] | null) ?? []);
        setRechercheEnCours(false);
      }
    }, 300);
    // Produits de marque : lancés automatiquement, un peu plus tard que la
    // base générique pour ne pas interroger Open Food Facts à chaque lettre.
    const controleur = new AbortController();
    setRechercheMarquesEnCours(true);
    const minuteurMarques = setTimeout(async () => {
      try {
        const produits = await rechercherProduitsParNom(termesRecherche, controleur.signal);
        if (!annule) setResultatsMarques(produits);
      } catch {
        if (!annule) setResultatsMarques([]);
      } finally {
        if (!annule) setRechercheMarquesEnCours(false);
      }
    }, 600);

    return () => {
      annule = true;
      clearTimeout(minuteur);
      clearTimeout(minuteurMarques);
      controleur.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termesRecherche]);

  // Enregistre une ligne du journal et la garde dans la liste « Dans ce repas ».
  async function insererLigne(l: {
    nom: string;
    unite: "g" | "portion";
    quantite: number;
    calories: number;
    proteines: number;
    glucides: number;
    lipides: number;
    source: SourceRepas;
    plat_id?: string | null;
    photo_url?: string | null;
  }): Promise<string | null> {
    const { data, error } = await supabase
      .from("application_repas_journal")
      .insert({
        client_id: clientId,
        date,
        repas_type: repasType,
        cree_par: "client",
        ...l,
        plat_id: l.plat_id ?? null,
        photo_url: l.photo_url ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) return null;
    setAjoutes((prev) => [
      ...prev,
      { id: data.id, nom: l.nom, unite: l.unite, quantite: l.quantite, calories: l.calories, repas: repasType },
    ]);
    onAjoute();
    return data.id;
  }

  // Ajout en un geste (bouton +), avec la quantité habituelle ; « Annuler » juste après.
  async function ajoutRapide(l: Parameters<typeof insererLigne>[0]) {
    const id = await insererLigne(l);
    if (!id) {
      setBandeau({ id: "", texte: "Ajout impossible, réessayez." });
      return;
    }
    setBandeau({ id, texte: `✓ ${l.nom} · ${libelleQuantiteMemo(l.unite, l.quantite, l.nom)}` });
  }

  function ajoutRapideMemorise(m: {
    nom: string;
    calories: number;
    proteines: number;
    glucides: number;
    lipides: number;
    quantite: number;
    unite: "g" | "portion" | null;
    source: SourceRepas;
    plat_id: string | null;
  }) {
    return ajoutRapide({
      nom: m.nom,
      unite: m.unite === "g" ? "g" : "portion",
      quantite: Number(m.quantite) || 1,
      calories: Number(m.calories),
      proteines: Number(m.proteines),
      glucides: Number(m.glucides),
      lipides: Number(m.lipides),
      source: m.source,
      plat_id: m.plat_id,
    });
  }

  // Quantité utilisée par le bouton + (affichée sous le bouton) : poids tapé dans
  // la recherche, sinon la première portion (fabricant, nom ou famille), sinon 100 g.
  const quantiteRapide = (nom: string, contexte: ContextePortion = {}) => {
    const p = portionsPour(nom, contexte)[0];
    const unite = p?.ml ? "ml" : "g";
    if (grammesSaisis) return `${grammesSaisis} ${unite}`;
    return p ? p.libelle : `100 ${unite}`;
  };

  // Ligne de résultat : valeurs pour la portion que le + ajoutera (comme MyFitnessPal).
  const resumePortion = (
    nom: string,
    v: { calories: number; proteines: number; glucides: number; lipides: number },
    contexte: ContextePortion = {}
  ) => {
    const p = portionsPour(nom, contexte)[0];
    const unite = p?.ml ? "ml" : "g";
    const grammes = grammesSaisis ?? p?.grammes ?? 100;
    const f = grammes / 100;
    const arrondi = (x: number) => Math.round(x * f * 10) / 10;
    const quantite = !grammesSaisis && p ? `${p.libelle} (${grammes} ${unite})` : `${grammes} ${unite}`;
    return `${quantite} · ${Math.round(v.calories * f)} kcal · ${arrondi(v.proteines)}g P · ${arrondi(v.glucides)}g G · ${arrondi(v.lipides)}g L`;
  };

  function ajoutRapide100g(
    nom: string,
    v: { calories: number; proteines: number; glucides: number; lipides: number },
    source: SourceRepas,
    contexte: ContextePortion = {}
  ) {
    const grammes = grammesSaisis ?? portionsPour(nom, contexte)[0]?.grammes ?? 100;
    return ajoutRapide({
      nom,
      unite: "g",
      quantite: grammes / 100,
      calories: Math.round(v.calories),
      proteines: v.proteines,
      glucides: v.glucides,
      lipides: v.lipides,
      source,
    });
  }

  async function supprimerAjoute(id: string) {
    const { error } = await supabase.from("application_repas_journal").delete().eq("id", id);
    if (error) return;
    setAjoutes((prev) => prev.filter((a) => a.id !== id));
    setBandeau((b) => (b?.id === id ? null : b));
    onAjoute();
  }

  async function validerEdition(a: Ajoute) {
    if (!edition) return;
    const valeur = parseFloat(edition.valeur.replace(",", "."));
    if (!Number.isFinite(valeur) || valeur <= 0) return setEdition(null);
    const quantite = a.unite === "g" ? valeur / 100 : valeur;
    const { error } = await supabase.from("application_repas_journal").update({ quantite }).eq("id", a.id);
    if (!error) {
      setAjoutes((prev) => prev.map((x) => (x.id === a.id ? { ...x, quantite } : x)));
      onAjoute();
    }
    setEdition(null);
  }

  useEffect(() => {
    if (!bandeau) return;
    const minuteur = setTimeout(() => setBandeau(null), 4500);
    return () => clearTimeout(minuteur);
  }, [bandeau]);

  function choisirPour100g(
    nom: string,
    valeurs: { calories: number; proteines: number; glucides: number; lipides: number },
    source: SourceRepas,
    grammesPreremplis: number | null = null,
    contexte: ContextePortion = {}
  ) {
    const portions = portionsPour(nom, contexte);
    setTrouve({
      nom,
      calories: Math.round(valeurs.calories),
      proteines: valeurs.proteines,
      glucides: valeurs.glucides,
      lipides: valeurs.lipides,
      source,
      quantiteParDefaut: 1,
      paGrammes: true,
      portions,
      liquide: portions[0]?.ml === true,
    });
    // Poids tapé dans la recherche, sinon la première portion (fabricant, 1 œuf, 1 pot...), sinon 100 g.
    setGrammes(grammesPreremplis ?? portions[0]?.grammes ?? 100);
    setEtape("confirmation");
  }

  // Saisie 100% manuelle (aliment absent de la base)
  const [nomLibre, setNomLibre] = useState("");
  const [caloriesLibre, setCaloriesLibre] = useState("");
  const [proteinesLibre, setProteinesLibre] = useState("");
  const [glucidesLibre, setGlucidesLibre] = useState("");
  const [lipidesLibre, setLipidesLibre] = useState("");

  const lireNombre = (t: string) => {
    const n = parseFloat(t.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  // Quantité affichée : grammes pour les aliments au poids, portions sinon.
  const versAffichage = (e: ElementRepas) =>
    String(e.unite === "g" ? Math.round(e.quantite * 100) : Math.round(e.quantite * 100) / 100).replace(".", ",");
  const depuisAffichage = (e: ElementRepas, t: string) => (e.unite === "g" ? lireNombre(t) / 100 : lireNombre(t));

  function choisirFavori(f: Favori) {
    if (f.elements?.length) {
      setFavoriRepas({ favori: f, choix: f.elements.map((e) => ({ coche: true, valeur: versAffichage(e) })) });
      setEtape("favori_repas");
    } else {
      choisirMemorise(f);
    }
  }

  async function ajouterFavoriRepas() {
    if (!favoriRepas?.favori.elements) return;
    const lignes = favoriRepas.favori.elements
      .map((e, i) => ({ e, c: favoriRepas.choix[i] }))
      .filter(({ e, c }) => c.coche && depuisAffichage(e, c.valeur) > 0)
      .map(({ e, c }) => ({
        client_id: clientId,
        date,
        repas_type: repasType,
        source: e.source,
        nom: e.nom,
        quantite: depuisAffichage(e, c.valeur),
        unite: e.unite,
        calories: e.calories,
        proteines: e.proteines,
        glucides: e.glucides,
        lipides: e.lipides,
        plat_id: e.plat_id,
        cree_par: "client",
      }));
    if (!lignes.length) return;
    setEnregistrement(true);
    const { error } = await supabase.from("application_repas_journal").insert(lignes);
    setEnregistrement(false);
    if (error) {
      setMessageErreur("Erreur lors de l'enregistrement, réessayez.");
      setEtape("erreur");
      return;
    }
    onAjoute();
    onClose();
  }

  function editerFavori(f: Favori) {
    setFavoriEdite({
      favori: f,
      nom: f.nom,
      calories: String(Math.round(Number(f.calories))),
      proteines: String(Number(f.proteines)),
      glucides: String(Number(f.glucides)),
      lipides: String(Number(f.lipides)),
      quantite: f.unite === "g" ? String(Math.round(Number(f.quantite) * 100)) : String(Number(f.quantite)),
    });
    setEtape("favori_edition");
  }

  async function enregistrerFavoriEdite() {
    if (!favoriEdite) return;
    const f = favoriEdite.favori;
    const composite = !!f.elements?.length;
    const maj = composite
      ? { nom: favoriEdite.nom.trim() || f.nom }
      : {
          nom: favoriEdite.nom.trim() || f.nom,
          calories: Math.round(lireNombre(favoriEdite.calories)),
          proteines: lireNombre(favoriEdite.proteines),
          glucides: lireNombre(favoriEdite.glucides),
          lipides: lireNombre(favoriEdite.lipides),
          quantite: Math.max(0.01, f.unite === "g" ? lireNombre(favoriEdite.quantite) / 100 : lireNombre(favoriEdite.quantite)),
        };
    setEnregistrement(true);
    const { data, error } = await supabase.from("application_favoris").update(maj).eq("id", f.id).select("*").single<Favori>();
    setEnregistrement(false);
    if (error || !data) {
      setMessageErreur(/duplicate|unique/i.test(error?.message ?? "") ? "Un favori porte déjà ce nom." : "Enregistrement impossible, réessayez.");
      setEtape("erreur");
      return;
    }
    setListeFavoris((l) => l.map((x) => (x.id === data.id ? data : x)));
    setFavoriEdite(null);
    setEtape("manuel");
    onAjoute();
  }

  async function supprimerFavori(f: Favori) {
    const { error } = await supabase.from("application_favoris").delete().eq("id", f.id);
    if (!error) {
      setListeFavoris((l) => l.filter((x) => x.id !== f.id));
      onAjoute();
    }
  }

  function ouvrirMonPlat() {
    if (repasType !== "dejeuner" && repasType !== "diner") setRepasType(new Date().getHours() < 16 ? "dejeuner" : "diner");
    setEtape("mon_plat");
  }

  async function ajouterMonPlat() {
    const valeur = (t: string) => {
      const n = parseFloat(t.replace(",", "."));
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const calories = Math.round(valeur(monPlat.calories));
    if (!calories) {
      setMessageMonPlat("Indiquez au moins les calories écrites sur la box.");
      return;
    }
    setEnregistrement(true);
    const nom = monPlat.nom.trim() || "Plat Chef2Box";
    const { error } = await supabase.from("application_repas_journal").insert({
      client_id: clientId,
      date,
      repas_type: repasType,
      unite: "portion",
      source: "chef2box",
      nom,
      quantite: 1,
      calories,
      proteines: valeur(monPlat.proteines),
      glucides: valeur(monPlat.glucides),
      lipides: valeur(monPlat.lipides),
      cree_par: "client",
    });
    setEnregistrement(false);
    if (error) {
      setMessageMonPlat("Erreur lors de l'enregistrement, réessayez.");
      return;
    }
    onAjoute();
    onClose();
  }

  async function onScanChef2Box(texteScanne: string) {
    const { data, error } = await supabase
      .from("application_plats")
      .select("*")
      .eq("qr_code", codeDepuisScan(texteScanne))
      .eq("actif", true)
      .maybeSingle();

    if (error || !data) {
      setMessageErreur("Ce code n'est reconnu dans aucun plat Chef2Box.");
      setEtape("erreur");
      return;
    }

    setTrouve({
      nom: data.nom,
      calories: data.calories,
      proteines: data.proteines,
      glucides: data.glucides,
      lipides: data.lipides,
      source: "chef2box",
      plat_id: data.id,
      quantiteParDefaut: 1,
    });
    setQuantite(1);
    setEtape("confirmation");
  }

  async function onScanBarcode(code: string) {
    setEtape("recherche_code");
    let produit = null;
    try {
      produit = await chercherProduitParCodeBarres(code);
    } catch {
      setMessageErreur("Impossible de joindre la base produits. Vérifiez votre connexion et réessayez.");
      setEtape("erreur");
      return;
    }
    if (!produit || produit.calories === 0) {
      setMessageErreur(
        `Produit ${code} introuvable ou sans valeurs nutritionnelles. Recherchez-le par son nom dans la saisie manuelle.`
      );
      setEtape("erreur");
      return;
    }

    choisirPour100g(produit.nom, produit, "code_barres", null, { portionProduit: produit.portion });
  }

  // Favori ou aliment récent : mêmes valeurs et même quantité que la dernière fois.
  function choisirMemorise(m: Pick<Favori, "nom" | "calories" | "proteines" | "glucides" | "lipides" | "quantite" | "source"> & {
    unite: "g" | "portion" | null;
    plat_id: string | null;
  }) {
    const enGrammes = m.unite === "g";
    setTrouve({
      nom: m.nom,
      calories: Number(m.calories),
      proteines: Number(m.proteines),
      glucides: Number(m.glucides),
      lipides: Number(m.lipides),
      source: m.source,
      plat_id: m.plat_id ?? undefined,
      quantiteParDefaut: 1,
      paGrammes: enGrammes,
    });
    if (enGrammes) setGrammes(Math.round(Number(m.quantite) * 100));
    else setQuantite(Number(m.quantite) || 1);
    setSaisieQuantite(null);
    setEtape("confirmation");
  }

  function choisirRestaurant(r: ProduitRestaurant) {
    setTrouve({
      nom: `${r.nom} (${r.enseigne})`,
      calories: Math.round(Number(r.calories)),
      proteines: Number(r.proteines),
      glucides: Number(r.glucides),
      lipides: Number(r.lipides),
      source: "manuel",
      quantiteParDefaut: 1,
    });
    setQuantite(1);
    setSaisieQuantite(null);
    setEtape("confirmation");
  }

  function choisirAlimentPopulaire(nom: string, cal: number, prot: number, gluc: number, lip: number) {
    setTrouve({
      nom,
      calories: cal,
      proteines: prot,
      glucides: gluc,
      lipides: lip,
      source: "manuel",
      quantiteParDefaut: 1,
    });
    setQuantite(1);
    setEtape("confirmation");
  }

  function validerSaisieLibre() {
    if (!nomLibre || !caloriesLibre) return;
    setTrouve({
      nom: nomLibre,
      calories: Number(caloriesLibre) || 0,
      proteines: Number(proteinesLibre) || 0,
      glucides: Number(glucidesLibre) || 0,
      lipides: Number(lipidesLibre) || 0,
      source: "manuel",
      quantiteParDefaut: 1,
    });
    setQuantite(1);
    setEtape("confirmation");
  }

  function surChangementPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setPhoto(fichier);
    setPreviewPhoto(URL.createObjectURL(fichier));
  }

  async function enregistrerRepas() {
    if (!trouve) return;
    setEnregistrement(true);

    let photoUrl: string | null = null;
    if (photo) {
      // Nom de fichier neutre : le nom d'origine peut contenir n'importe quoi.
      const extension = (photo.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
      const chemin = `${clientId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const { data, error } = await supabase.storage
        .from(BUCKET_PHOTOS)
        .upload(chemin, photo, { contentType: photo.type || undefined });
      if (!error && data) photoUrl = data.path; // chemin privé, signé à l'affichage
    }

    const quantiteFinale = trouve.paGrammes ? grammes / 100 : quantite;

    const idAjoute = await insererLigne({
      unite: trouve.paGrammes ? "g" : "portion",
      source: trouve.source,
      nom: nomAffiche.trim() || trouve.nom,
      quantite: quantiteFinale,
      calories: trouve.calories,
      proteines: trouve.proteines,
      glucides: trouve.glucides,
      lipides: trouve.lipides,
      photo_url: photoUrl,
      plat_id: trouve.plat_id ?? null,
    });
    const error = !idAjoute;

    if (!error) {
      const nomFinal = nomAffiche.trim() || trouve.nom;
      const etaitFavori = nomsFavoris.has(nomFinal.toLowerCase());
      if (favoriCoche) {
        await supabase.from("application_favoris").upsert(
          {
            client_id: clientId,
            nom: nomFinal,
            calories: trouve.calories,
            proteines: trouve.proteines,
            glucides: trouve.glucides,
            lipides: trouve.lipides,
            unite: trouve.paGrammes ? "g" : "portion",
            quantite: quantiteFinale,
            source: trouve.source,
            plat_id: trouve.plat_id ?? null,
          },
          { onConflict: "client_id,nom" }
        );
      } else if (etaitFavori) {
        await supabase.from("application_favoris").delete().eq("client_id", clientId).eq("nom", nomFinal);
      }
    }
    setEnregistrement(false);
    if (!error) {
      // On reste dans la fenêtre pour enchaîner les aliments du même repas.
      setTrouve(null);
      setPhoto(null);
      setPreviewPhoto(null);
      setQuantite(1);
      setGrammes(100);
      setRechercheManuelle("");
      setEtape(origine);
    } else {
      setMessageErreur("Erreur lors de l'enregistrement, réessayez.");
      setEtape("erreur");
    }
  }

  const facteur = trouve ? (trouve.paGrammes ? grammes / 100 : quantite) : 0;

  // Pertinence : tous les mots cherchés sont au début d'un mot du nom.
  const motsCherches = sansAccents(termesRecherche)
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length >= 2 && !MOTS_VIDES.has(m));
  const estPertinent = (nom: string) => {
    const n = sansAccents(nom);
    return motsCherches.length > 0 && motsCherches.every((m) => new RegExp(`(^|[^a-z0-9])${m}`).test(n));
  };
  const marquesTriees = [...(resultatsMarques ?? [])].sort(
    (a, b) => Number(estPertinent(`${b.nom} ${b.marque}`)) - Number(estPertinent(`${a.nom} ${a.marque}`))
  );
  const marquesEnPremier =
    !rechercheEnCours &&
    marquesTriees.some((p) => estPertinent(`${p.nom} ${p.marque}`)) &&
    !alimentsAffiches.some((a) => estPertinent(a.nom));

  // Restaurants en tête seulement si la recherche vise une enseigne (« mcdo »,
  // « big mac »…) ; sinon après les aliments et produits de marque, réduits à 3.
  const rechercheNormalisee = ` ${termesRecherche.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")} `;
  const visUneEnseigne = MOTS_ENSEIGNES.some((m) => rechercheNormalisee.includes(m));
  const restaurantsEnPremier =
    visUneEnseigne || (!rechercheEnCours && resultatsAliments.length === 0 && resultatsRestaurants.length > 0);
  const restaurantsAffiches =
    restaurantsEnPremier || tousLesRestaurants ? resultatsRestaurants : resultatsRestaurants.slice(0, 3);
  const blocRestaurants = rechercheActive && !rechercheEnCours && resultatsRestaurants.length > 0 && (
    <div className="space-y-2">
      <p className="lbl pt-1">Restaurants &amp; fast-food</p>
      <ul className="carte overflow-hidden divide-y divide-black/5">
        {restaurantsAffiches.map((r) => (
          <li key={r.id} className="flex items-center">
            <button onClick={() => choisirRestaurant(r)} className="flex-1 min-w-0 text-left pl-4 py-3">
              <p className="text-[15px] font-semibold text-c2b-green">
                {r.nom}
                <span className="font-medium text-c2b-muted"> · {r.enseigne}</span>
              </p>
              <p className="text-[11px] text-c2b-muted">
                1 portion{r.portion_g ? ` (${Math.round(Number(r.portion_g))} g)` : ""} ·{" "}
                {Math.round(Number(r.calories))} kcal · {Number(r.proteines)}g P · {Number(r.glucides)}g G ·{" "}
                {Number(r.lipides)}g L
              </p>
            </button>
            <BoutonPlus
              libelle={`Ajouter ${r.nom}`}
              detail="1 portion"
              onClick={() =>
                ajoutRapide({
                  nom: `${r.nom} (${r.enseigne})`,
                  unite: "portion",
                  quantite: 1,
                  calories: Math.round(Number(r.calories)),
                  proteines: Number(r.proteines),
                  glucides: Number(r.glucides),
                  lipides: Number(r.lipides),
                  source: "manuel",
                })
              }
            />
          </li>
        ))}
      </ul>
      {restaurantsAffiches.length < resultatsRestaurants.length && (
        <button
          onClick={() => setTousLesRestaurants(true)}
          className="w-full py-1.5 text-sm font-semibold text-c2b-green"
        >
          Voir les {resultatsRestaurants.length} plats de restaurant
        </button>
      )}
      <p className="text-[11px] text-c2b-muted">
        Valeurs officielles publiées par l&apos;enseigne ({sourcesRestaurants(resultatsRestaurants)}). Les
        recettes au Maroc peuvent légèrement varier.
      </p>
    </div>
  );

  return (
    <Portail>
    {/* Plein écran sur mobile : ancrée en haut, la barre de recherche reste
        visible au-dessus du clavier iOS. */}
    <div className="fixed inset-0 !mt-0 bg-c2b-green/60 backdrop-blur-sm z-30 flex items-stretch md:items-center justify-center">
      <div className="bg-c2b-cream w-full h-[100dvh] md:h-auto md:max-w-md md:rounded-[24px] md:max-h-[90vh] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 sticky top-0 z-10 bg-c2b-cream">
          <h2 className="titre text-2xl">Ajouter un <em>repas</em></h2>
          {ajoutes.length > 0 ? (
            <button onClick={onClose} className="btn-primary px-5 py-2 text-sm">
              Terminer
            </button>
          ) : (
            <button onClick={onClose} className="text-c2b-green/60" aria-label="Fermer">
              <X size={20} />
            </button>
          )}
        </div>

        <div className="p-5">
          {/* Repas visé, choisi dès le début : les ajouts rapides (+) y vont directement. */}
          {(etape === "choix" || etape === "manuel") && (
            <div className="mb-4 grid grid-cols-4 gap-1.5">
              {ORDRE_REPAS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRepasType(r)}
                  className={`rounded-full px-1 py-1.5 text-[12px] font-bold transition ${
                    repasType === r ? "bg-c2b-green text-c2b-cream" : "bg-white text-c2b-green border border-c2b-green/15"
                  }`}
                  aria-pressed={repasType === r}
                >
                  {r === "petit_dejeuner" ? "Petit-déj." : REPAS_TYPE_LABELS[r]}
                </button>
              ))}
            </div>
          )}

          {ajoutes.length > 0 && etape !== "confirmation" && (
            <div className="mb-4 rounded-2xl bg-c2b-green/[0.06] p-3">
              <p className="px-1 text-sm font-bold text-c2b-green">
                Ajouté{ajoutes.length > 1 ? "s" : ""} ·{" "}
                <span className="text-c2b-gold">
                  {Math.round(ajoutes.reduce((t, a) => t + a.calories * a.quantite, 0))} kcal
                </span>
              </p>
              <ul className="mt-2 space-y-1">
                {ajoutes.map((a) => (
                  <li key={a.id} className="rounded-xl bg-white px-3 py-2">
                    {edition?.id === a.id ? (
                      <div className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 truncate text-sm font-semibold text-c2b-green">{a.nom}</span>
                        <input
                          autoFocus
                          inputMode="decimal"
                          value={edition.valeur}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setEdition({ id: a.id, valeur: e.target.value.replace(/[^0-9.,]/g, "") })}
                          onKeyDown={(e) => e.key === "Enter" && validerEdition(a)}
                          className="champ w-20 px-2.5 py-1.5 text-right text-sm"
                          aria-label={`Quantité de ${a.nom}`}
                        />
                        <span className="text-xs text-c2b-muted">{a.unite === "g" ? "g" : "port."}</span>
                        <button
                          onClick={() => validerEdition(a)}
                          className="w-8 h-8 rounded-full bg-c2b-green text-c2b-cream flex items-center justify-center"
                          aria-label="Valider la quantité"
                        >
                          <Check size={15} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setEdition({
                              id: a.id,
                              valeur: String(
                                a.unite === "g" ? Math.round(a.quantite * 100) : Math.round(a.quantite * 100) / 100
                              ).replace(".", ","),
                            })
                          }
                          className="flex-1 min-w-0 text-left"
                          aria-label={`Modifier ${a.nom}`}
                        >
                          <span className="block truncate text-sm font-semibold text-c2b-green">{a.nom}</span>
                          <span className="text-[11px] text-c2b-muted">
                            {libelleQuantiteMemo(a.unite, a.quantite, a.nom)} · {Math.round(a.calories * a.quantite)} kcal
                            {a.repas !== repasType && ` · ${REPAS_TYPE_LABELS[a.repas].toLowerCase()}`} ·{" "}
                            <span className="font-semibold text-c2b-gold">modifier</span>
                          </span>
                        </button>
                        <button
                          onClick={() => supprimerAjoute(a.id)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-c2b-muted hover:bg-red-50 hover:text-red-600"
                          aria-label={`Retirer ${a.nom}`}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {etape === "choix" && (
            <div className="space-y-3">
              <button
                onClick={ouvrirMonPlat}
                className="carte w-full flex items-center gap-4 border-c2b-gold/40 p-5 text-left transition hover:border-c2b-gold"
              >
                <UtensilsCrossed className="text-c2b-gold" />
                <div>
                  <p className="font-bold text-c2b-green">Mon plat Chef2Box</p>
                  <p className="text-xs text-c2b-muted">Recopiez les macros écrites sur votre box</p>
                </div>
              </button>

              <button
                onClick={() => setEtape("scan_chef2box")}
                className="carte w-full flex items-center gap-4 border-c2b-gold/40 p-5 text-left transition hover:border-c2b-gold"
              >
                <QrCode className="text-c2b-gold" />
                <div>
                  <p className="font-bold text-c2b-green">Scanner une étiquette Chef2Box</p>
                  <p className="text-xs text-c2b-muted">Macros exactes, ajout instantané</p>
                </div>
              </button>

              <button
                onClick={() => setEtape("scan_barcode")}
                className="carte w-full flex items-center gap-4 p-5 text-left transition hover:border-c2b-gold/40"
              >
                <Barcode className="text-c2b-green" />
                <div>
                  <p className="font-bold text-c2b-green">Scanner un code-barres</p>
                  <p className="text-xs text-c2b-muted">Produit du commerce</p>
                </div>
              </button>

              <button
                onClick={() => setEtape("manuel")}
                className="carte w-full flex items-center gap-4 p-5 text-left transition hover:border-c2b-gold/40"
              >
                <PenLine className="text-c2b-green" />
                <div>
                  <p className="font-bold text-c2b-green">Saisie manuelle</p>
                  <p className="text-xs text-c2b-muted">Recherche, favoris et aliments récents</p>
                </div>
              </button>

              {listeFavoris.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="lbl flex items-center gap-1.5">
                    <Star size={12} fill="currentColor" /> Vos favoris
                  </p>
                  <div className="carte overflow-hidden divide-y divide-black/5">
                    {listeFavoris.slice(0, 5).map((f) => (
                      <LigneMemorisee
                        key={f.id}
                        nom={f.nom}
                        detail={
                          f.elements?.length
                            ? `${f.elements.length} aliments · ${Math.round(Number(f.calories))} kcal`
                            : `${Math.round(Number(f.calories) * Number(f.quantite))} kcal`
                        }
                        onClick={() => choisirFavori(f)}
                        onAjoutRapide={f.elements?.length ? undefined : () => ajoutRapideMemorise(f)}
                      />
                    ))}
                  </div>
                  {listeFavoris.length > 5 && (
                    <button onClick={() => setEtape("manuel")} className="w-full py-1 text-sm font-semibold text-c2b-green">
                      Tous les favoris →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {etape === "mon_plat" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {(["dejeuner", "diner"] as const).map((r) => (
                  <Pastille key={r} active={repasType === r} onClick={() => setRepasType(r)} large>
                    {REPAS_TYPE_LABELS[r]}
                  </Pastille>
                ))}
              </div>
              <label className="block">
                <span className="block text-xs font-bold uppercase tracking-wider text-c2b-muted mb-2">Nom du plat</span>
                <input
                  value={monPlat.nom}
                  onChange={(e) => setMonPlat({ ...monPlat, nom: e.target.value })}
                  placeholder="Ex : Poulet tikka, riz basmati"
                  className="champ"
                />
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {(
                  [
                    ["calories", "Calories (kcal)"],
                    ["proteines", "Protéines (g)"],
                    ["glucides", "Glucides (g)"],
                    ["lipides", "Lipides (g)"],
                  ] as const
                ).map(([cle, label]) => (
                  <label key={cle} className="block">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-c2b-muted mb-1.5">
                      {label}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={monPlat[cle]}
                      onChange={(e) => {
                        setMonPlat({ ...monPlat, [cle]: e.target.value.replace(/[^0-9.,]/g, "") });
                        setMessageMonPlat("");
                      }}
                      className="champ"
                    />
                  </label>
                ))}
              </div>
              {messageMonPlat && <p className="text-sm font-semibold text-red-600">{messageMonPlat}</p>}
              <button onClick={ajouterMonPlat} disabled={enregistrement} className="btn-primary w-full py-4">
                {enregistrement ? "Ajout..." : "Ajouter à ma journée"}
              </button>
              <button onClick={() => setEtape("choix")} className="w-full text-sm font-semibold text-c2b-muted">
                ← Retour
              </button>
            </div>
          )}

          {etape === "favori_repas" && favoriRepas?.favori.elements && (
            <div className="space-y-4">
              <div>
                <p className="lbl mb-1">Repas favori</p>
                <p className="font-serif text-2xl text-c2b-green">{favoriRepas.favori.nom}</p>
                <p className="text-xs text-c2b-muted mt-1">Décochez ou changez les quantités si besoin.</p>
              </div>
              <ul className="carte overflow-hidden divide-y divide-black/5">
                {favoriRepas.favori.elements.map((e, i) => {
                  const c = favoriRepas.choix[i];
                  const q = depuisAffichage(e, c.valeur);
                  return (
                    <li key={i} className={`flex items-center gap-3 px-4 py-2.5 ${c.coche ? "" : "opacity-45"}`}>
                      <input
                        type="checkbox"
                        checked={c.coche}
                        onChange={() => {
                          const choix = [...favoriRepas.choix];
                          choix[i] = { ...c, coche: !c.coche };
                          setFavoriRepas({ ...favoriRepas, choix });
                        }}
                        className="h-5 w-5 accent-c2b-green flex-shrink-0"
                        aria-label={e.nom}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-c2b-green truncate">{e.nom}</p>
                        <p className="text-[11px] text-c2b-muted">{Math.round(e.calories * q)} kcal</p>
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={c.valeur}
                        onFocus={(ev) => ev.target.select()}
                        onChange={(ev) => {
                          const choix = [...favoriRepas.choix];
                          choix[i] = { ...c, valeur: ev.target.value.replace(/[^0-9.,]/g, "") };
                          setFavoriRepas({ ...favoriRepas, choix });
                        }}
                        className="champ w-[72px] px-2.5 py-2 text-right text-sm"
                        aria-label={`Quantité de ${e.nom}`}
                      />
                      <span className="w-8 text-[11px] text-c2b-muted flex-shrink-0">{e.unite === "g" ? "g" : "port."}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                {ORDRE_REPAS.map((r) => (
                  <Pastille key={r} active={repasType === r} onClick={() => setRepasType(r)} large>
                    {REPAS_TYPE_LABELS[r]}
                  </Pastille>
                ))}
              </div>
              {(() => {
                const choisis = favoriRepas.favori.elements
                  .map((e, i) => ({ e, c: favoriRepas.choix[i] }))
                  .filter(({ c }) => c.coche);
                const kcal = choisis.reduce((t, { e, c }) => t + e.calories * depuisAffichage(e, c.valeur), 0);
                return (
                  <button
                    onClick={ajouterFavoriRepas}
                    disabled={enregistrement || choisis.length === 0}
                    className="btn-primary w-full py-4"
                  >
                    {enregistrement
                      ? "Ajout..."
                      : `Ajouter ${choisis.length} aliment${choisis.length > 1 ? "s" : ""} · ${Math.round(kcal)} kcal`}
                  </button>
                );
              })()}
              <button onClick={() => setEtape(origine)} className="w-full text-sm font-semibold text-c2b-muted">
                ← Retour
              </button>
            </div>
          )}

          {etape === "favori_edition" && favoriEdite && (
            <div className="space-y-4">
              <label className="block">
                <span className="block text-xs font-bold uppercase tracking-wider text-c2b-muted mb-2">Nom du favori</span>
                <input
                  value={favoriEdite.nom}
                  onChange={(e) => setFavoriEdite({ ...favoriEdite, nom: e.target.value })}
                  className="champ font-semibold"
                />
              </label>
              {favoriEdite.favori.elements?.length ? (
                <p className="text-xs text-c2b-muted">
                  Repas de {favoriEdite.favori.elements.length} aliments : les quantités se règlent au moment de l&apos;ajouter.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    {(
                      [
                        ["calories", "Calories (kcal)"],
                        ["proteines", "Protéines (g)"],
                        ["glucides", "Glucides (g)"],
                        ["lipides", "Lipides (g)"],
                      ] as const
                    ).map(([cle, label]) => (
                      <label key={cle} className="block">
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-c2b-muted mb-1.5">
                          {label}
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={favoriEdite[cle]}
                          onChange={(e) => setFavoriEdite({ ...favoriEdite, [cle]: e.target.value.replace(/[^0-9.,]/g, "") })}
                          className="champ"
                        />
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-c2b-muted -mt-2">
                    Valeurs {favoriEdite.favori.unite === "g" ? "pour 100 g" : "pour 1 portion"}.
                  </p>
                  <label className="block">
                    <span className="block text-xs font-bold uppercase tracking-wider text-c2b-muted mb-2">
                      Quantité habituelle ({favoriEdite.favori.unite === "g" ? "grammes" : "portions"})
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={favoriEdite.quantite}
                      onChange={(e) => setFavoriEdite({ ...favoriEdite, quantite: e.target.value.replace(/[^0-9.,]/g, "") })}
                      className="champ"
                    />
                  </label>
                </>
              )}
              <button onClick={enregistrerFavoriEdite} disabled={enregistrement} className="btn-primary w-full py-4">
                {enregistrement ? "Enregistrement..." : "Enregistrer le favori"}
              </button>
              <button
                onClick={() => {
                  setFavoriEdite(null);
                  setEtape("manuel");
                }}
                className="w-full text-sm font-semibold text-c2b-muted"
              >
                ← Retour
              </button>
            </div>
          )}

          {etape === "scan_chef2box" && (
            <Scanner mode="qr" onResult={onScanChef2Box} onClose={() => setEtape("choix")} />
          )}
          {etape === "scan_barcode" && (
            <Scanner mode="code_barres" onResult={onScanBarcode} onClose={() => setEtape("choix")} />
          )}

          {etape === "recherche_code" && (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-c2b-green/70">
              <Loader2 className="animate-spin" />
              Recherche du produit...
            </div>
          )}

          {etape === "erreur" && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-red-700">{messageErreur}</p>
              <button
                onClick={() => setEtape("manuel")}
                className="btn-primary w-full"
              >
                Chercher par nom
              </button>
              <button
                onClick={() => setEtape("choix")}
                className="btn-secondary w-full"
              >
                Retour
              </button>
            </div>
          )}

          {etape === "manuel" && (
            <div className="space-y-4">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-3.5 text-c2b-muted/60" />
                <input
                  value={rechercheManuelle}
                  onChange={(e) => setRechercheManuelle(e.target.value)}
                  placeholder="Ex : compote 45g, riz 150g, poulet rôti..."
                  autoFocus
                  className="champ pl-10"
                />
              </div>
              {grammesSaisis !== null ? (
                <p className="text-xs text-c2b-green/70 -mt-2">
                  Quantité détectée : <span className="font-bold text-c2b-green">{grammesSaisis} g</span>
                </p>
              ) : (
                <p className="text-[11px] text-c2b-green/50 -mt-2">
                  Astuce : ajoutez le poids à la recherche (« compote 45g ») pour le pré-remplir.
                </p>
              )}

              {!rechercheActive && listeFavoris.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="lbl flex items-center gap-1.5">
                      <Star size={12} fill="currentColor" /> Favoris
                    </p>
                    <button
                      onClick={() => setGererFavoris(!gererFavoris)}
                      className="text-xs font-bold text-c2b-green/70 hover:text-c2b-green"
                    >
                      {gererFavoris ? "Terminé" : "Gérer"}
                    </button>
                  </div>
                  <div className="carte overflow-hidden divide-y divide-black/5">
                    {listeFavoris.map((f) => {
                      const detail = f.elements?.length
                        ? `${f.elements.length} aliments · ${Math.round(Number(f.calories))} kcal`
                        : `${libelleQuantiteMemo(f.unite, Number(f.quantite), f.nom)} · ${Math.round(
                            Number(f.calories) * Number(f.quantite)
                          )} kcal`;
                      return gererFavoris ? (
                        <div key={f.id} className="flex items-center gap-2 px-4 py-2.5">
                          <span className="flex-1 min-w-0 text-sm font-medium text-c2b-green truncate">{f.nom}</span>
                          <button
                            onClick={() => editerFavori(f)}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-cream"
                            aria-label={`Modifier ${f.nom}`}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => supprimerFavori(f)}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-red-600/80 hover:bg-red-50"
                            aria-label={`Supprimer ${f.nom}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ) : (
                        <LigneMemorisee
                          key={f.id}
                          nom={f.nom}
                          detail={detail}
                          onClick={() => choisirFavori(f)}
                          onAjoutRapide={f.elements?.length ? undefined : () => ajoutRapideMemorise(f)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {!rechercheActive && recents.length > 0 && (
                <div className="space-y-2">
                  <p className="lbl flex items-center gap-1.5">
                    <History size={12} /> Récents
                  </p>
                  <div className="carte overflow-hidden divide-y divide-black/5">
                    {/* Ceux déjà mangés à ce repas-là d'abord (comme MyFitnessPal). */}
                    {[...recents]
                      .sort((a, b) => Number(b.repas_type === repasType) - Number(a.repas_type === repasType))
                      .map((r) => (
                        <LigneMemorisee
                          key={r.id}
                          nom={r.nom}
                          detail={`${libelleQuantiteMemo(r.unite, Number(r.quantite), r.nom)} · ${Math.round(
                            Number(r.calories) * Number(r.quantite)
                          )} kcal`}
                          onClick={() => choisirMemorise(r)}
                          onAjoutRapide={() => ajoutRapideMemorise(r)}
                        />
                      ))}
                  </div>
                </div>
              )}

              {!rechercheActive && (
                <>
                  <p className="lbl">Ajout rapide</p>
                  <div className="grid grid-cols-2 gap-2">
                    {ALIMENTS_POPULAIRES.map((a) => (
                      <div key={a.nom} className="carte flex items-center transition hover:border-c2b-gold/40">
                        <button
                          onClick={() => choisirAlimentPopulaire(a.nom, a.calories, a.proteines, a.glucides, a.lipides)}
                          className="flex-1 min-w-0 p-3 pr-0 text-left"
                        >
                          <p className="text-sm font-medium text-c2b-green truncate">{a.nom}</p>
                          <p className="text-[11px] text-c2b-muted">
                            {a.portion} · {a.calories} kcal
                          </p>
                        </button>
                        <BoutonPlus
                          libelle={`Ajouter ${a.nom}`}
                          onClick={() =>
                            ajoutRapide({
                              nom: a.nom,
                              unite: "portion",
                              quantite: 1,
                              calories: a.calories,
                              proteines: a.proteines,
                              glucides: a.glucides,
                              lipides: a.lipides,
                              source: "manuel",
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {restaurantsEnPremier && blocRestaurants}

              {rechercheActive && (
                <div className="flex flex-col gap-2">
                  {/* Ordre des deux blocs : les produits de marque passent devant quand ils
                      correspondent mieux à la recherche (« ice latte », « nutella »...). */}
                  <div className={`space-y-2 ${marquesEnPremier ? "order-2 pt-3" : "order-1"}`}>
                  <p className="lbl pt-1">Aliments</p>
                  {rechercheEnCours ? (
                    <div className="flex justify-center py-4 text-c2b-green/50">
                      <Loader2 className="animate-spin" size={20} />
                    </div>
                  ) : resultatsAliments.length === 0 ? (
                    <p className="text-sm text-c2b-muted italic py-1">Aucun aliment générique trouvé.</p>
                  ) : (
                    <>
                      {((aDesCrus && aDesCuits) || tauxGras.length > 1) && (
                        <div className="flex flex-wrap gap-1.5">
                          {aDesCrus && aDesCuits &&
                            (["tous", "cru", "cuit"] as const).map((c) => (
                              <Pastille key={c} active={filtreCuisson === c} onClick={() => setFiltreCuisson(c)}>
                                {c === "tous" ? "Cru & cuit" : c === "cru" ? "Cru" : "Cuit"}
                              </Pastille>
                            ))}
                          {tauxGras.length > 1 &&
                            tauxGras.map((t) => (
                              <Pastille
                                key={t}
                                active={filtreGras === t}
                                onClick={() => setFiltreGras(filtreGras === t ? null : t)}
                              >
                                {t}% MG
                              </Pastille>
                            ))}
                        </div>
                      )}
                      <ul className="carte overflow-hidden divide-y divide-black/5">
                        {(tousLesAliments ? alimentsAffiches : alimentsAffiches.slice(0, 5)).map((a) => (
                          <li key={a.id} className="flex items-center">
                            <button
                              onClick={() => choisirPour100g(a.nom, a, "manuel", grammesSaisis, { groupe: a.groupe })}
                              className="flex-1 min-w-0 text-left pl-4 py-3"
                            >
                              <p className="text-[15px] font-semibold text-c2b-green">{a.nom}</p>
                              <p className="text-[11px] text-c2b-muted">{resumePortion(a.nom, a, { groupe: a.groupe })}</p>
                            </button>
                            <BoutonPlus
                              libelle={`Ajouter ${a.nom}`}
                              detail={quantiteRapide(a.nom, { groupe: a.groupe })}
                              onClick={() => ajoutRapide100g(a.nom, a, "manuel", { groupe: a.groupe })}
                            />
                          </li>
                        ))}
                      </ul>
                      {!tousLesAliments && alimentsAffiches.length > 5 && (
                        <button
                          onClick={() => setTousLesAliments(true)}
                          className="w-full py-1.5 text-sm font-semibold text-c2b-green"
                        >
                          Voir les {alimentsAffiches.length} aliments
                        </button>
                      )}
                    </>
                  )}

                  </div>

                  <div className={`space-y-2 ${marquesEnPremier ? "order-1" : "order-2 pt-3"}`}>
                  <p className="lbl pt-1">Produits de marque</p>
                  {rechercheMarquesEnCours || resultatsMarques === null ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-c2b-muted">
                      <Loader2 className="animate-spin" size={18} /> Recherche dans les marques…
                    </div>
                  ) : resultatsMarques.length === 0 ? (
                    <p className="text-sm text-c2b-muted italic py-1">
                      Aucun produit de marque trouvé. Essayez avec le nom de la marque (ex : « Jaouda yaourt »).
                    </p>
                  ) : (
                    <ul className="carte overflow-hidden divide-y divide-black/5">
                      {marquesTriees.map((p, i) => (
                        <li key={`${p.nom}-${p.marque}-${i}`} className="flex items-center">
                          <button
                            onClick={() =>
                              choisirPour100g(p.marque ? `${p.nom} (${p.marque})` : p.nom, p, "manuel", grammesSaisis, {
                                portionProduit: p.portion,
                              })
                            }
                            className="flex-1 min-w-0 text-left pl-4 py-3"
                          >
                            <p className="text-[15px] font-semibold text-c2b-green">
                              {p.nom}
                              {p.marque && <span className="font-medium text-c2b-muted"> · {p.marque}</span>}
                            </p>
                            <p className="text-[11px] text-c2b-muted">
                              {p.maroc && (
                                <span className="mr-1.5 rounded-full bg-c2b-gold/15 px-1.5 py-0.5 font-bold text-c2b-gold">
                                  Maroc
                                </span>
                              )}
                              {resumePortion(p.nom, p, { portionProduit: p.portion })}
                            </p>
                          </button>
                          <BoutonPlus
                            libelle={`Ajouter ${p.nom}`}
                            detail={quantiteRapide(p.nom, { portionProduit: p.portion })}
                            onClick={() =>
                              ajoutRapide100g(p.marque ? `${p.nom} (${p.marque})` : p.nom, p, "manuel", {
                                portionProduit: p.portion,
                              })
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  </div>
                </div>
              )}

              {!restaurantsEnPremier && blocRestaurants}

              <details className="carte p-4">
                <summary className="text-sm font-medium text-c2b-green cursor-pointer">
                  Aliment introuvable ? Saisir manuellement
                </summary>
                <div className="mt-3 space-y-2">
                  <input
                    value={nomLibre}
                    onChange={(e) => setNomLibre(e.target.value)}
                    placeholder="Nom de l'aliment"
                    className="champ"
                  />
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      value={caloriesLibre}
                      onChange={(e) => setCaloriesLibre(e.target.value)}
                      placeholder="kcal"
                      type="number"
                      className="champ px-2.5"
                    />
                    <input
                      value={proteinesLibre}
                      onChange={(e) => setProteinesLibre(e.target.value)}
                      placeholder="P (g)"
                      type="number"
                      className="champ px-2.5"
                    />
                    <input
                      value={glucidesLibre}
                      onChange={(e) => setGlucidesLibre(e.target.value)}
                      placeholder="G (g)"
                      type="number"
                      className="champ px-2.5"
                    />
                    <input
                      value={lipidesLibre}
                      onChange={(e) => setLipidesLibre(e.target.value)}
                      placeholder="L (g)"
                      type="number"
                      className="champ px-2.5"
                    />
                  </div>
                  <button
                    onClick={validerSaisieLibre}
                    className="btn-primary w-full"
                  >
                    Continuer
                  </button>
                </div>
              </details>
            </div>
          )}

          {etape === "confirmation" && trouve && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-c2b-muted mb-2">Nom</label>
                <div className="flex gap-2">
                  <input
                    value={nomAffiche}
                    onChange={(e) => setNomAffiche(e.target.value)}
                    placeholder={trouve.nom}
                    className="champ font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => setFavoriCoche(!favoriCoche)}
                    className={`flex-shrink-0 w-12 rounded-xl border flex items-center justify-center ${
                      favoriCoche
                        ? "bg-c2b-gold/15 border-c2b-gold text-c2b-gold"
                        : "bg-white border-c2b-cream-2 text-c2b-muted"
                    }`}
                    aria-label={favoriCoche ? "Retirer des favoris" : "Ajouter aux favoris"}
                    aria-pressed={favoriCoche}
                  >
                    <Star size={20} fill={favoriCoche ? "currentColor" : "none"} />
                  </button>
                </div>
                <p className="text-xs text-c2b-muted mt-1.5">
                  {trouve.calories} kcal · {trouve.proteines}g P · {trouve.glucides}g G · {trouve.lipides}g L
                  {trouve.paGrammes ? (trouve.liquide || estLiquide(trouve.nom) ? " pour 100 ml" : " pour 100 g") : " par portion"}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-c2b-muted mb-2">Repas</label>
                <div className="grid grid-cols-2 gap-2">
                  {ORDRE_REPAS.map((r) => (
                    <Pastille key={r} active={repasType === r} onClick={() => setRepasType(r)} large>
                      {REPAS_TYPE_LABELS[r]}
                    </Pastille>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-c2b-muted mb-2">
                  {trouve.paGrammes
                    ? trouve.liquide || estLiquide(trouve.nom)
                      ? "Quantité (ml)"
                      : "Quantité (grammes)"
                    : "Quantité (portions)"}
                </label>
                {/* Champ texte (et non number) : garde la saisie telle quelle,
                    vide possible, virgule acceptée, pas de "0" collé devant. */}
                <input
                  type="text"
                  inputMode="decimal"
                  onFocus={(e) => e.target.select()}
                  value={saisieQuantite ?? String(trouve.paGrammes ? grammes : quantite)}
                  onChange={(e) => {
                    const texte = e.target.value.replace(/[^0-9.,]/g, "");
                    setSaisieQuantite(texte);
                    const valeur = parseFloat(texte.replace(",", "."));
                    const nombre = Number.isFinite(valeur) ? valeur : 0;
                    if (trouve.paGrammes) setGrammes(nombre);
                    else setQuantite(nombre);
                  }}
                  onBlur={() => setSaisieQuantite(null)}
                  placeholder={trouve.paGrammes ? "100" : "1"}
                  className="champ"
                />
                {trouve.paGrammes && (trouve.portions ?? portionsPour(trouve.nom)).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(trouve.portions ?? portionsPour(trouve.nom)).map((pu) => (
                      <button
                        key={pu.libelle}
                        onClick={() => {
                          setGrammes(pu.grammes);
                          setSaisieQuantite(null);
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                          grammes === pu.grammes ? "bg-c2b-gold text-c2b-green" : "bg-c2b-gold/[0.12] text-c2b-green"
                        }`}
                      >
                        {pu.libelle} · {pu.grammes} {pu.ml ? "ml" : "g"}
                      </button>
                    ))}
                  </div>
                )}
                {trouve.paGrammes && (
                  <div className="flex gap-1.5 mt-2">
                    {GRAMMES_RAPIDES.map((g) => (
                      <button
                        key={g}
                        onClick={() => {
                          setGrammes(g);
                          setSaisieQuantite(null);
                        }}
                        className={`flex-1 rounded-full py-1.5 text-xs font-bold ${
                          grammes === g ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-green"
                        }`}
                      >
                        {g} {trouve.liquide || estLiquide(trouve.nom) ? "ml" : "g"}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-sm text-c2b-green mt-2 font-medium">
                  = {Math.round(trouve.calories * facteur)} kcal · {Math.round(trouve.proteines * facteur)}g P ·{" "}
                  {Math.round(trouve.glucides * facteur)}g G · {Math.round(trouve.lipides * facteur)}g L
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-c2b-muted mb-2">
                  Photo du repas (optionnel)
                </label>
                <label className="flex items-center gap-2 justify-center border-2 border-dashed border-c2b-green/20 rounded-2xl py-4 cursor-pointer text-sm font-semibold text-c2b-green/70 hover:border-c2b-gold">
                  <Camera size={18} />
                  {previewPhoto ? "Changer la photo" : "Prendre une photo"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={surChangementPhoto}
                  />
                </label>
                {previewPhoto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewPhoto} alt="Aperçu" className="mt-2 w-full h-36 object-cover rounded-2xl" />
                )}
              </div>

              <button
                onClick={enregistrerRepas}
                disabled={enregistrement || facteur <= 0}
                className="btn-primary w-full py-4"
              >
                {enregistrement ? "Enregistrement..." : "Ajouter"}
              </button>
              <button
                onClick={() => {
                  setTrouve(null);
                  setEtape(origine);
                }}
                className="w-full py-2 text-sm font-semibold text-c2b-muted"
              >
                ← Retour
              </button>
            </div>
          )}
        </div>
      </div>

      {bandeau && (
        <div className="fixed bottom-5 inset-x-4 z-40 mx-auto max-w-md rounded-2xl bg-c2b-green px-4 py-3 text-sm text-c2b-cream shadow-lg flex items-center gap-3 animate-apparition">
          <span className="flex-1 min-w-0 truncate font-semibold">{bandeau.texte}</span>
          {bandeau.id && (
            <button onClick={() => supprimerAjoute(bandeau.id)} className="font-bold text-c2b-gold flex-shrink-0">
              Annuler
            </button>
          )}
        </div>
      )}
    </div>
    </Portail>
  );
}

function libelleQuantiteMemo(unite: "g" | "portion" | null, quantite: number, nom = "") {
  if (unite === "g") return `${Math.round(quantite * 100)} ${estLiquide(nom) ? "ml" : "g"}`;
  const q = Math.round(quantite * 100) / 100;
  return `${String(q).replace(".", ",")} portion${q > 1 ? "s" : ""}`;
}

function LigneMemorisee({
  nom,
  detail,
  onClick,
  onAjoutRapide,
}: {
  nom: string;
  detail: string;
  onClick: () => void;
  onAjoutRapide?: () => void;
}) {
  return (
    <div className="flex items-center hover:bg-c2b-cream/60">
      <button onClick={onClick} className="flex-1 min-w-0 flex items-center justify-between gap-3 pl-4 pr-2 py-3 text-left">
        <span className="text-sm font-medium text-c2b-green truncate">{nom}</span>
        <span className="text-[11px] text-c2b-muted flex-shrink-0">{detail}</span>
      </button>
      {onAjoutRapide ? <BoutonPlus libelle={`Ajouter ${nom}`} onClick={onAjoutRapide} /> : <span className="w-3" />}
    </div>
  );
}

// Bouton rond « + » : ajoute tout de suite avec la quantité indiquée.
function BoutonPlus({ libelle, detail, onClick }: { libelle: string; detail?: string; onClick: () => void }) {
  const [fait, setFait] = useState(false);
  return (
    <button
      onClick={() => {
        setFait(true);
        onClick();
        setTimeout(() => setFait(false), 1200);
      }}
      className="flex-shrink-0 flex flex-col items-center justify-center px-3 py-2"
      aria-label={detail ? `${libelle} (${detail})` : libelle}
    >
      <span
        className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
          fait ? "bg-c2b-gold text-c2b-green" : "bg-c2b-green/[0.08] text-c2b-green"
        }`}
      >
        {fait ? <Check size={17} /> : <Plus size={18} />}
      </span>
      {detail && <span className="mt-0.5 text-[10px] text-c2b-muted whitespace-nowrap">{detail}</span>}
    </button>
  );
}

const PAYS: Record<string, string> = { FR: "France", CH: "Suisse", MA: "Maroc", UK: "Royaume-Uni" };

function sourcesRestaurants(produits: ProduitRestaurant[]) {
  return Array.from(new Set(produits.map((p) => `${p.enseigne} ${PAYS[p.pays] ?? p.pays}`))).join(", ");
}

