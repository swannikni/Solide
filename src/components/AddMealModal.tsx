"use client";

import { useEffect, useState } from "react";
import { X, QrCode, Barcode, PenLine, Camera, Search, Loader2, Star, History, UtensilsCrossed } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Scanner } from "@/components/Scanner";
import { Pastille } from "@/components/Pastille";
import { chercherProduitParCodeBarres, rechercherProduitsParNom } from "@/lib/openfoodfacts";
import { ALIMENTS_POPULAIRES } from "@/lib/aliments-populaires";
import { codeDepuisScan } from "@/lib/qr";
import { BUCKET_PHOTOS } from "@/lib/photos";
import { ORDRE_REPAS, REPAS_TYPE_LABELS } from "@/lib/macros";
import type { Aliment, Favori, ProduitRestaurant, RepasJournal, RepasType, SourceRepas } from "@/lib/types";

type Etape = "choix" | "mon_plat" | "scan_chef2box" | "scan_barcode" | "recherche_code" | "manuel" | "confirmation" | "erreur";

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
  const [ajoutes, setAjoutes] = useState<{ nom: string; kcal: number }[]>([]);
  // « Mon plat Chef2Box » : macros recopiées de l'étiquette de la box.
  const [messageMonPlat, setMessageMonPlat] = useState("");
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
  const aDesCrus = resultatsAliments.some((a) => RE_CRU.test(a.nom));
  const aDesCuits = resultatsAliments.some((a) => RE_CUIT.test(a.nom));
  const tauxGras = Array.from(
    new Set(resultatsAliments.map((a) => a.nom.match(RE_GRAS)?.[1]).filter((t): t is string => !!t))
  ).sort((x, y) => Number(x) - Number(y));
  const alimentsAffiches = resultatsAliments.filter(
    (a) =>
      (filtreCuisson === "tous" || (filtreCuisson === "cru" ? RE_CRU : RE_CUIT).test(a.nom)) &&
      (filtreGras === null || a.nom.match(RE_GRAS)?.[1] === filtreGras)
  );

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

  function choisirPour100g(
    nom: string,
    valeurs: { calories: number; proteines: number; glucides: number; lipides: number },
    source: SourceRepas,
    grammesPreremplis: number | null = null
  ) {
    setTrouve({
      nom,
      calories: Math.round(valeurs.calories),
      proteines: valeurs.proteines,
      glucides: valeurs.glucides,
      lipides: valeurs.lipides,
      source,
      quantiteParDefaut: 1,
      paGrammes: true,
    });
    setGrammes(grammesPreremplis ?? 100);
    setEtape("confirmation");
  }

  // Saisie 100% manuelle (aliment absent de la base)
  const [nomLibre, setNomLibre] = useState("");
  const [caloriesLibre, setCaloriesLibre] = useState("");
  const [proteinesLibre, setProteinesLibre] = useState("");
  const [glucidesLibre, setGlucidesLibre] = useState("");
  const [lipidesLibre, setLipidesLibre] = useState("");

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

    choisirPour100g(produit.nom, produit, "code_barres");
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

    const { error } = await supabase.from("application_repas_journal").insert({
      client_id: clientId,
      date,
      repas_type: repasType,
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
      cree_par: "client",
    });

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
      onAjoute();
      setAjoutes((prev) => [
        ...prev,
        { nom: nomAffiche.trim() || trouve.nom, kcal: Math.round(trouve.calories * quantiteFinale) },
      ]);
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
          <li key={r.id}>
            <button onClick={() => choisirRestaurant(r)} className="w-full text-left px-4 py-3">
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
    // Plein écran sur mobile : ancrée en haut, la barre de recherche reste
    // visible au-dessus du clavier iOS.
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
          {ajoutes.length > 0 && etape !== "confirmation" && (
            <div className="mb-4 rounded-2xl bg-c2b-green/[0.06] px-4 py-3">
              <p className="text-sm font-bold text-c2b-green">
                ✓ {ajoutes.length} aliment{ajoutes.length > 1 ? "s" : ""} ajouté{ajoutes.length > 1 ? "s" : ""} au{" "}
                {REPAS_TYPE_LABELS[repasType].toLowerCase()} ·{" "}
                <span className="text-c2b-gold">{ajoutes.reduce((t, a) => t + a.kcal, 0)} kcal</span>
              </p>
              <p className="text-xs text-c2b-muted mt-0.5 line-clamp-2">{ajoutes.map((a) => a.nom).join(" · ")}</p>
              <p className="text-xs text-c2b-green/70 mt-1.5">
                Ajoutez l&apos;aliment suivant, ou touchez « Terminer ».
              </p>
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

              {!rechercheActive && favoris.length > 0 && (
                <div className="space-y-2">
                  <p className="lbl flex items-center gap-1.5">
                    <Star size={12} fill="currentColor" /> Favoris
                  </p>
                  <div className="carte overflow-hidden divide-y divide-black/5">
                    {favoris.map((f) => (
                      <LigneMemorisee
                        key={f.id}
                        nom={f.nom}
                        detail={`${libelleQuantiteMemo(f.unite, Number(f.quantite))} · ${Math.round(
                          Number(f.calories) * Number(f.quantite)
                        )} kcal`}
                        onClick={() => choisirMemorise(f)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {!rechercheActive && recents.length > 0 && (
                <div className="space-y-2">
                  <p className="lbl flex items-center gap-1.5">
                    <History size={12} /> Récents
                  </p>
                  <div className="carte overflow-hidden divide-y divide-black/5">
                    {recents.map((r) => (
                      <LigneMemorisee
                        key={r.id}
                        nom={r.nom}
                        detail={`${libelleQuantiteMemo(r.unite, Number(r.quantite))} · ${Math.round(
                          Number(r.calories) * Number(r.quantite)
                        )} kcal`}
                        onClick={() => choisirMemorise(r)}
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
                      <button
                        key={a.nom}
                        onClick={() => choisirAlimentPopulaire(a.nom, a.calories, a.proteines, a.glucides, a.lipides)}
                        className="carte p-3 text-left transition hover:border-c2b-gold/40"
                      >
                        <p className="text-sm font-medium text-c2b-green">{a.nom}</p>
                        <p className="text-[11px] text-c2b-muted">
                          {a.portion} · {a.calories} kcal
                        </p>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {restaurantsEnPremier && blocRestaurants}

              {rechercheActive && (
                <div className="space-y-2">
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
                          <li key={a.id}>
                            <button
                              onClick={() => choisirPour100g(a.nom, a, "manuel", grammesSaisis)}
                              className="w-full text-left px-4 py-3"
                            >
                              <p className="text-[15px] font-semibold text-c2b-green">{a.nom}</p>
                              <p className="text-[11px] text-c2b-muted">
                                100 g · {Math.round(a.calories)} kcal · {a.proteines}g P · {a.glucides}g G ·{" "}
                                {a.lipides}g L
                              </p>
                            </button>
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

                  <p className="lbl pt-3">Produits de marque</p>
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
                      {resultatsMarques.map((p, i) => (
                        <li key={`${p.nom}-${p.marque}-${i}`}>
                          <button
                            onClick={() =>
                              choisirPour100g(p.marque ? `${p.nom} (${p.marque})` : p.nom, p, "manuel", grammesSaisis)
                            }
                            className="w-full text-left px-4 py-3"
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
                              100 g · {p.calories} kcal · {p.proteines}g P · {p.glucides}g G · {p.lipides}g L
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
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
                  {trouve.paGrammes ? " pour 100 g" : " par portion"}
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
                  {trouve.paGrammes ? "Quantité (grammes)" : "Quantité (portions)"}
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
                        {g} g
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
    </div>
  );
}

function libelleQuantiteMemo(unite: "g" | "portion" | null, quantite: number) {
  if (unite === "g") return `${Math.round(quantite * 100)} g`;
  const q = Math.round(quantite * 100) / 100;
  return `${String(q).replace(".", ",")} portion${q > 1 ? "s" : ""}`;
}

function LigneMemorisee({ nom, detail, onClick }: { nom: string; detail: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-c2b-cream/60">
      <span className="text-sm font-medium text-c2b-green truncate">{nom}</span>
      <span className="text-[11px] text-c2b-muted flex-shrink-0">{detail}</span>
    </button>
  );
}

const PAYS: Record<string, string> = { FR: "France", CH: "Suisse", MA: "Maroc", UK: "Royaume-Uni" };

function sourcesRestaurants(produits: ProduitRestaurant[]) {
  return Array.from(new Set(produits.map((p) => `${p.enseigne} ${PAYS[p.pays] ?? p.pays}`))).join(", ");
}

