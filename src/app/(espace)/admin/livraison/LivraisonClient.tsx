"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { jsPDF as JsPDF } from "jspdf";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  FileText,
  Map as IconeCarte,
  ChevronRight,
  Crosshair,
  MapPin,
  Navigation,
  Pencil,
  RotateCcw,
  Send,
  Settings,
  X,
} from "lucide-react";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import { createClient } from "@/lib/supabase/client";
import { decalerDate, libelleDate } from "@/lib/dates";
import type { ReglagesLivraison } from "@/lib/livraison";
import { genererFeuillePdf } from "@/lib/tournee-pdf";
import { CarteTournees, ChoixSurCarte, type GroupeCarte } from "@/components/CarteLivraison";
import {
  distanceKm,
  duree,
  estUnLien,
  heure,
  lienPoint,
  lienWaze,
  liensGoogleMaps,
  lireCoordonnees,
  meilleurePlace,
  mesurer,
  planifier,
  separerLien,
  type Arret,
  type Point,
} from "@/lib/tournees";

export type RepasLivre = "dejeuner" | "diner";

export interface ArretLivraison {
  cle: string; // « c:<client> » ou « a:<nom ajouté à la main> »
  source: "client" | "ajout";
  id: string;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  lat: number | null;
  lng: number | null;
  complement: string | null; // bât., porte, étage… (gardé d'un jour à l'autre)
  repas: RepasLivre[]; // repas du jour livrés ensemble à midi
  notes: { repas: RepasLivre; note: string }[]; // consignes du jour
}

// « 2 boîtes (midi + soir) », « 1 boîte (soir) »…
function libelleBoites(a: ArretLivraison) {
  const n = a.repas.length;
  const quels = a.repas.map((r) => (r === "dejeuner" ? "midi" : "soir")).join(" + ");
  return `${n} boîte${n > 1 ? "s" : ""} (${quels})`;
}

// Consignes, précédées du repas quand la personne en a deux.
function consignes(a: ArretLivraison) {
  return a.notes.map((n) => (a.repas.length > 1 ? `${n.repas === "dejeuner" ? "Midi" : "Soir"} : ${n.note}` : n.note));
}

type ArretPlace = Arret & ArretLivraison & { lat: number; lng: number };

const COULEURS = ["#c9973a", "#3e6e96", "#b5603f"];

function nomCourt(nom: string) {
  const [prenom, ...reste] = nom.trim().split(/\s+/);
  const initiale = reste.at(-1)?.[0];
  const p = prenom.charAt(0).toUpperCase() + prenom.slice(1);
  return initiale ? `${p} ${initiale.toUpperCase()}.` : p;
}

const dateLongue = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// Numéro marocain → format international pour wa.me (0612… → 212612…).
function numeroWhatsApp(telephone: string) {
  let n = telephone.replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  else if (n.length === 10 && n.startsWith("0")) n = `212${n.slice(1)}`;
  return n.length >= 8 ? n : "";
}

// Position d'un texte collé : coordonnées ou lien lus sur place, sinon le
// serveur (liens courts Google / Waze / Plans, adresse écrite).
async function localiser(texte: string): Promise<{ point: Point; libelle?: string } | { erreur: string }> {
  const direct = lireCoordonnees(texte);
  if (direct) return { point: direct };
  const res = await fetch(`/api/admin/lieu?texte=${encodeURIComponent(texte.trim())}`).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (res?.ok && data?.lat != null) return { point: { lat: data.lat, lng: data.lng }, libelle: data.libelle };
  return { erreur: data?.erreur ?? "Adresse introuvable." };
}

// Une ligne « Nom : [coller l'adresse ou le lien] », enregistrée dès le collage.
// Position tombée sur la cuisine : presque toujours une erreur (⊕ touché à la
// cuisine, lien non lu…).
const surLaCuisine = (a: { lat: number | null; lng: number | null }, depart: Point | null) =>
  !!depart && a.lat != null && a.lng != null && distanceKm(depart, { lat: a.lat, lng: a.lng }) < 0.08;

function LigneAdresse({
  arret,
  depart,
  onEnregistrer,
  onComplement,
}: {
  arret: ArretLivraison;
  depart: Point | null;
  onEnregistrer: (adresse: string | null, point: Point | null, telephone?: string | null) => Promise<boolean>;
  onComplement?: (complement: string | null) => Promise<boolean>;
}) {
  const place = arret.lat != null && arret.lng != null;
  const [texte, setTexte] = useState(arret.adresse ?? "");
  const [etat, setEtat] = useState<{ type: "ok" | "erreur" | "encours"; message: string } | null>(null);
  const dernier = useRef(arret.adresse ?? "");
  const champ = useRef<HTMLInputElement>(null);
  const [carteOuverte, setCarteOuverte] = useState(false);
  const aVerifier = surLaCuisine(arret, depart);
  // Texte à garder comme repère : jamais un lien brut.
  const repere = () => {
    const { lien, texte: nom } = separerLien(texte);
    return (lien ? nom : texte.trim()) || arret.adresse || null;
  };

  async function traiter(valeur: string) {
    const t = valeur.trim();
    if (!t || t === dernier.current) return;
    dernier.current = t;
    setEtat({ type: "encours", message: "Recherche de la position..." });
    const { lien, texte: nomLieu } = separerLien(t);
    const r = await localiser(t);
    if ("erreur" in r) {
      // Adresse écrite introuvable : on la garde comme repère pour le livreur.
      if (!lien) await onEnregistrer(t, place && !aVerifier ? { lat: arret.lat!, lng: arret.lng! } : null);
      else if (nomLieu) setTexte(nomLieu);
      return setEtat({ type: "erreur", message: r.erreur });
    }
    // Lien collé : on garde l'adresse écrite si elle sert de repère au même
    // endroit ; si la position change (déménagement, erreur), elle est remplacée.
    const memeEndroit = !place || distanceKm({ lat: arret.lat!, lng: arret.lng! }, r.point) < 0.3;
    const libelle = r.libelle?.split(",").slice(0, 3).join(",") || null;
    const adresse = lien ? nomLieu || (memeEndroit && !estUnLien(arret.adresse ?? "") && arret.adresse) || libelle : t;
    if (lien) setTexte(adresse ?? "");
    if (surLaCuisine(r.point, depart)) {
      await onEnregistrer(adresse, r.point);
      return setEtat({ type: "erreur", message: "Ce lien donne la position de la cuisine : vérifiez-le, ou placez l'adresse sur la carte." });
    }
    const ok = await onEnregistrer(adresse, r.point);
    setEtat(ok ? { type: "ok", message: "Position enregistrée" } : { type: "erreur", message: "Non enregistré, réessayez." });
  }

  function maPosition() {
    if (!navigator.geolocation) return setEtat({ type: "erreur", message: "Position indisponible sur cet appareil." });
    if (!window.confirm(`Enregistrer l'endroit où vous êtes MAINTENANT comme position de « ${arret.nom} » ?\n\nÀ faire seulement quand vous êtes sur place.`)) return;
    setEtat({ type: "encours", message: "Recherche de votre position..." });
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const ok = await onEnregistrer(repere(), { lat: p.coords.latitude, lng: p.coords.longitude });
        setEtat(ok ? { type: "ok", message: `Position enregistrée (à ${Math.round(p.coords.accuracy)} m près)` } : { type: "erreur", message: "Non enregistré." });
      },
      () => setEtat({ type: "erreur", message: "Localisation refusée pour ce site." }),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  return (
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-c2b-green">
          {arret.nom}
          {arret.telephone && <span className="ml-1.5 text-xs font-normal text-c2b-muted">{arret.telephone}</span>}
        </p>
        {place && aVerifier ? (
          <span className="flex items-center gap-1 text-xs font-bold text-red-700">⚠️ sur la cuisine</span>
        ) : place ? (
          <a href={lienPoint({ lat: arret.lat!, lng: arret.lng! })} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-emerald-700">
            <Check size={14} /> sur la carte
          </a>
        ) : (
          <span className="flex items-center gap-1 text-xs font-bold text-red-700">
            <MapPin size={13} /> à localiser
          </span>
        )}
      </div>
      <div className="mt-1.5 flex gap-2">
        <div className="relative flex-1">
          <input
            ref={champ}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onPaste={(e) => {
              const colle = e.clipboardData.getData("text");
              if (colle) {
                e.preventDefault();
                setTexte(colle);
                traiter(colle);
              }
            }}
            onBlur={() => traiter(texte)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            placeholder="Coller l'adresse ou un lien Waze, Google Maps, Plans…"
            maxLength={500}
            className={`champ py-2 pr-9 text-sm ${place && !aVerifier ? "" : "border-red-200"}`}
          />
          {texte && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setTexte("");
                setEtat(null);
                champ.current?.focus();
              }}
              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-c2b-muted"
              aria-label="Effacer pour coller une nouvelle adresse"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <button
          onClick={maPosition}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-c2b-green/15 bg-white text-c2b-green"
          aria-label={`Ma position pour ${arret.nom}`}
          title="Je suis devant chez lui"
        >
          <Crosshair size={17} />
        </button>
        <button
          onClick={() => setCarteOuverte(!carteOuverte)}
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${
            carteOuverte ? "border-c2b-green bg-c2b-green text-c2b-cream" : "border-c2b-green/15 bg-white text-c2b-green"
          }`}
          aria-label={`Placer ${arret.nom} sur la carte`}
          title="Placer sur la carte"
        >
          <IconeCarte size={17} />
        </button>
      </div>
      {aVerifier && !etat && (
        <p className="mt-1 text-xs font-semibold text-red-700">
          Même position que la cuisine : collez le bon lien, ou placez l&apos;adresse sur la carte.
        </p>
      )}
      {carteOuverte && (
        <ChoixSurCarte
          depart={depart}
          point={place && !aVerifier ? { lat: arret.lat!, lng: arret.lng! } : null}
          onAnnuler={() => setCarteOuverte(false)}
          onValider={async (p) => {
            const ok = await onEnregistrer(repere(), p);
            setCarteOuverte(false);
            setEtat(ok ? { type: "ok", message: "Position placée sur la carte" } : { type: "erreur", message: "Non enregistré, réessayez." });
          }}
        />
      )}
      {onComplement && (
        <input
          defaultValue={arret.complement ?? ""}
          onBlur={async (e) => {
            const complement = e.target.value.trim().slice(0, 150) || null;
            if (complement === arret.complement) return;
            const ok = await onComplement(complement);
            setEtat(ok ? { type: "ok", message: "Complément enregistré" } : { type: "erreur", message: "Non enregistré, réessayez." });
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder="Complément : bât. 39, porte 7, étage, code…"
          maxLength={150}
          className="champ mt-1.5 py-1.5 text-xs"
        />
      )}
      {arret.source === "ajout" && (
        <input
          defaultValue={arret.telephone ?? ""}
          onBlur={(e) => {
            const tel = e.target.value.trim().slice(0, 30) || null;
            if (tel !== arret.telephone) onEnregistrer(arret.adresse, place ? { lat: arret.lat!, lng: arret.lng! } : null, tel);
          }}
          placeholder="Téléphone (facultatif)"
          inputMode="tel"
          className="champ mt-1.5 py-1.5 text-xs"
        />
      )}
      {etat && (
        <p
          className={`mt-1 text-xs ${
            etat.type === "ok" ? "text-emerald-700" : etat.type === "erreur" ? "text-red-700" : "text-c2b-muted"
          }`}
        >
          {etat.message}
        </p>
      )}
    </li>
  );
}

export function LivraisonClient({
  date,
  aujourdhui,
  arretsInitiaux,
  reglagesInitiaux,
  planInitial,
  departsInitiaux,
}: {
  date: string;
  aujourdhui: string;
  arretsInitiaux: ArretLivraison[];
  reglagesInitiaux: ReglagesLivraison;
  planInitial: string[][] | null;
  departsInitiaux: (string | null)[];
}) {
  const supabase = createClient();
  const [arrets, setArrets] = useState(arretsInitiaux);
  const [reglages, setReglages] = useState(reglagesInitiaux);
  const [reglagesOuverts, setReglagesOuverts] = useState(!reglagesInitiaux.depart);
  const [adressesOuvertes, setAdressesOuvertes] = useState(
    arretsInitiaux.some((a) => a.lat == null || surLaCuisine(a, reglagesInitiaux.depart))
  );
  const [carteVisible, setCarteVisible] = useState(true);
  // Répartition choisie à la main (clés par livreur) ; null = calcul automatique.
  const [plan, setPlan] = useState<string[][] | null>(planInitial);
  const [departs, setDeparts] = useState<(string | null)[]>(departsInitiaux);
  const [message, setMessage] = useState("");
  const [enEdition, setEnEdition] = useState<string | null>(null); // adresse modifiée depuis une tournée
  // Bibliothèque PDF et logo chargés d'avance : le PDF se fabrique sans
  // attente au toucher, ce qu'exige le partage sur iPhone.
  const [JsPdf, setJsPdf] = useState<typeof JsPDF | null>(null);
  const [logo, setLogo] = useState<{ data: string; ratio: number } | null>(null);
  useEffect(() => {
    import("jspdf").then((m) => setJsPdf(() => m.jsPDF)).catch(() => {});
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      setLogo({ data: canvas.toDataURL("image/png"), ratio: image.naturalWidth / image.naturalHeight });
    };
    image.src = "/logo-fiche.png";
  }, []);

  const nb = Math.min(Math.max(reglages.nbLivreurs, 1), 3);
  const heureParDefaut = reglages.heureMidi;
  const departDe = (i: number) => departs[i] || heureParDefaut;
  const depart = reglages.depart;
  // Arrêts sans position, ou placés sur la cuisine (erreur) : hors tournées.
  const places = arrets.filter((a): a is ArretPlace => a.lat != null && a.lng != null && !surLaCuisine(a, depart));
  const aLocaliser = arrets.filter((a) => a.lat == null || a.lng == null || surLaCuisine(a, depart));
  const params = { vitesseKmh: reglages.vitesseKmh, minutesParArret: reglages.minutesParArret };

  const tournees = useMemo(() => {
    if (!depart) return [];
    if (plan && plan.length === nb) {
      // Plan enregistré : on retire les absents, on ajoute les nouveaux là
      // où ils rallongent le moins une tournée.
      const parCle = new Map(places.map((a) => [a.cle, a]));
      const groupes = plan.map((cles) => cles.map((c) => parCle.get(c)).filter((a): a is ArretPlace => !!a));
      const deja = new Set(groupes.flat().map((a) => a.cle));
      for (const a of places.filter((x) => !deja.has(x.cle))) {
        const choix = groupes.map((g) => meilleurePlace(depart, g, a));
        const i = choix.reduce((m, c, k) => (c.detour < choix[m].detour ? k : m), 0);
        groupes[i].splice(choix[i].index, 0, a);
      }
      return groupes.map((g) => mesurer(depart, g, params));
    }
    return planifier(depart, places, nb, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depart, plan, nb, reglages.vitesseKmh, reglages.minutesParArret, arrets]);

  const groupesCarte = useMemo<GroupeCarte[]>(
    () =>
      tournees.map((t, i) => ({
        couleur: COULEURS[i],
        nom: reglages.livreurs[i]?.nom ?? "",
        arrets: t.arrets.map((a) => ({ cle: a.cle, nom: a.nom, lat: a.lat, lng: a.lng })),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tournees]
  );

  // Enregistre la répartition et les heures de départ du jour.
  const premierRendu = useRef(true);
  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }
    supabase
      .from("application_livraison_plans")
      .upsert({ date, repas_type: "dejeuner", tournees: plan, departs }, { onConflict: "date,repas_type" })
      .then(({ error }) => error && setMessage("Tournées non enregistrées, réessayez."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, departs]);

  const planActuel = () => tournees.map((t) => t.arrets.map((a) => a.cle));
  function deplacer(livreur: number, index: number, sens: -1 | 1) {
    const p = planActuel();
    const cible = index + sens;
    if (cible < 0 || cible >= p[livreur].length) return;
    [p[livreur][index], p[livreur][cible]] = [p[livreur][cible], p[livreur][index]];
    setPlan(p);
  }
  function donnerA(livreur: number, index: number, vers: number) {
    if (vers === livreur) return;
    const p = planActuel();
    const [cle] = p[livreur].splice(index, 1);
    // Insérée là où elle rallonge le moins la tournée du livreur choisi.
    const parCle = new Map(places.map((x) => [x.cle, x]));
    const arret = parCle.get(cle);
    const position = depart && arret ? meilleurePlace(depart, p[vers].map((c) => parCle.get(c)!).filter(Boolean), arret).index : p[vers].length;
    p[vers].splice(position, 0, cle);
    setPlan(p);
  }
  // Réordonne la tournée d'un livreur au plus court (après des changements à la main).
  function optimiser(livreur: number) {
    if (!depart) return;
    const p = planActuel();
    const parCle = new Map(places.map((a) => [a.cle, a]));
    const groupe = p[livreur].map((c) => parCle.get(c)!).filter(Boolean);
    p[livreur] = planifier(depart, groupe, 1, params)[0].arrets.map((a) => a.cle);
    setPlan(p);
  }

  async function enregistrerReglages(maj: Partial<ReglagesLivraison>) {
    const nouveaux = { ...reglages, ...maj };
    setReglages(nouveaux);
    const { error } = await supabase.from("application_livraison_reglages").upsert({ id: 1, valeur: nouveaux });
    setMessage(error ? "Réglages non enregistrés, réessayez." : "");
  }

  async function enregistrerAdresse(a: ArretLivraison, adresse: string | null, point: Point | null, telephone?: string | null) {
    const maj = { adresse: adresse?.slice(0, 200) || null, lat: point?.lat ?? null, lng: point?.lng ?? null };
    const tel = telephone === undefined ? a.telephone : telephone;
    const { error } =
      a.source === "client"
        ? await supabase
            .from("application_clients")
            .update({ livraison_adresse: maj.adresse, livraison_lat: maj.lat, livraison_lng: maj.lng })
            .eq("id", a.id)
        : // Personne ajoutée à la main : ses lignes du midi et du soir.
          await supabase
            .from("application_cuisine_extras")
            .update({ ...maj, telephone: tel })
            .eq("date", date)
            .eq("nom", a.nom);
    if (error) return false;
    setArrets((prev) => prev.map((x) => (x.cle === a.cle ? { ...x, ...maj, telephone: tel } : x)));
    // Répartition choisie à la main : l'arrêt déplacé reprend la meilleure
    // place dans la tournée de son livreur (le reste de l'ordre ne bouge pas).
    if (plan && point && depart && !surLaCuisine(point, depart)) {
      const p = planActuel();
      const i = p.findIndex((g) => g.includes(a.cle));
      if (i >= 0) {
        const parCle = new Map(places.map((x) => [x.cle, x]));
        p[i] = p[i].filter((c) => c !== a.cle);
        const { index } = meilleurePlace(depart, p[i].map((c) => parCle.get(c)!).filter(Boolean), point);
        p[i].splice(index, 0, a.cle);
        setPlan(p);
      }
    }
    return true;
  }

  async function enregistrerComplement(a: ArretLivraison, complement: string | null) {
    const { error } =
      a.source === "client"
        ? await supabase.from("application_clients").update({ livraison_complement: complement }).eq("id", a.id)
        : await supabase.from("application_cuisine_extras").update({ complement }).eq("date", date).eq("nom", a.nom);
    if (error) return false;
    setArrets((prev) => prev.map((x) => (x.cle === a.cle ? { ...x, complement } : x)));
    return true;
  }

  // Feuille de route PDF du livreur, partagée (WhatsApp…) ou téléchargée.
  async function envoyerPdf(i: number) {
    if (!JsPdf || !depart) return setMessage("Préparation du PDF, réessayez dans une seconde.");
    const t = tournees[i];
    const livreur = reglages.livreurs[i];
    const h = departDe(i);
    const boites = t.arrets.reduce((n, a) => n + (a as ArretPlace).repas.length, 0);
    const blob = genererFeuillePdf(
      JsPdf,
      {
        titreDate: dateLongue(date),
        livreur: livreur.nom,
        depart: h,
        fin: heure(h, t.dureeMin),
        dureeTexte: duree(t.dureeMin),
        distanceKm: t.distanceKm,
        totalBoites: boites,
        remuneration: livreur.tarif > 0 ? `${t.arrets.length} × ${livreur.tarif} DH = ${t.arrets.length * livreur.tarif} DH` : null,
        itineraires: liensGoogleMaps(depart, t.arrets),
        arrets: t.arrets.map((a, k) => {
          const x = a as ArretPlace;
          return {
            heure: heure(h, t.arrivees[k]),
            nom: x.nom,
            boites: libelleBoites(x),
            telephone: x.telephone,
            adresse: x.adresse,
            complement: x.complement,
            consignes: consignes(x),
            google: lienPoint(x),
            waze: lienWaze(x),
          };
        }),
      },
      logo
    );
    const nomFichier = `tournee-${livreur.nom.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-")}-${date}.pdf`;
    const fichier = new File([blob], nomFichier, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier], title: `Tournée de ${livreur.nom}` });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(blob);
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = fichier.name;
    lien.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function texteTournee(i: number) {
    const t = tournees[i];
    const livreur = reglages.livreurs[i];
    const h = departDe(i);
    const boites = t.arrets.reduce((n, a) => n + (a as ArretPlace).repas.length, 0);
    const lignes = [
      `*🛵 Tournée du midi — ${dateLongue(date)}*`,
      `*${livreur.nom}* · ${t.arrets.length} livraison${t.arrets.length > 1 ? "s" : ""} · départ *${h}* · fin vers ${heure(h, t.dureeMin)} (~${duree(t.dureeMin)})`,
    ];
    if (boites > t.arrets.length) lignes.push(`📦 ${boites} boîtes à emporter (midi + soir)`);
    if (livreur.tarif > 0) lignes.push(`Rémunération : ${t.arrets.length} × ${livreur.tarif} DH = *${t.arrets.length * livreur.tarif} DH*`);
    lignes.push("");
    t.arrets.forEach((a, k) => {
      const x = a as ArretPlace;
      lignes.push(`${k + 1}. ${heure(h, t.arrivees[k])} — *${nomCourt(x.nom)}* · ${libelleBoites(x)}${x.telephone ? ` 📞 ${x.telephone}` : ""}`);
      if (x.adresse) lignes.push(`   ${x.adresse}`);
      if (x.complement) lignes.push(`   🚪 *${x.complement}*`);
      lignes.push(`   Google Maps : ${lienPoint(x)}`, `   Waze : ${lienWaze(x)}`);
      consignes(x).forEach((c) => lignes.push(`   → ${c}`));
    });
    const liens = depart ? liensGoogleMaps(depart, t.arrets) : [];
    if (liens.length) {
      lignes.push("", liens.length > 1 ? "*Itinéraire (en plusieurs parties) :*" : "*Itinéraire :*");
      liens.forEach((l, k) => lignes.push(liens.length > 1 ? `Partie ${k + 1} : ${l}` : l));
    }
    return lignes.join("\n");
  }

  const libelleJour =
    libelleDate(date, aujourdhui) === "Aujourd'hui" || libelleDate(date, aujourdhui) === "Hier"
      ? libelleDate(date, aujourdhui)
      : date === decalerDate(aujourdhui, 1)
        ? "Demain"
        : new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const lien = (d: string) => `/admin/livraison?date=${d}`;
  const totalPaye = tournees.reduce((t, x, i) => t + x.arrets.length * (reglages.livreurs[i]?.tarif ?? 0), 0);

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
      <AdminOnglets />
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="lbl mb-2">Espace admin</span>
          <h1 className="titre text-[34px]">
            Tournées de <em>livraison</em>
          </h1>
        </div>
        <div className="flex items-center gap-1 pb-1">
          <Link
            href={lien(decalerDate(date, -1))}
            className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
            aria-label="Jour précédent"
          >
            <ChevronLeft size={20} />
          </Link>
          <span className="min-w-[80px] text-center text-sm font-bold text-c2b-green first-letter:uppercase">{libelleJour}</span>
          <Link
            href={lien(decalerDate(date, 1))}
            className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
            aria-label="Jour suivant"
          >
            <ChevronRight size={20} />
          </Link>
        </div>
      </div>

      <p className="-mt-2 text-sm text-c2b-muted">
        ☀️ Une tournée à midi : les repas du midi et du soir partent ensemble.
      </p>

      {message && <p className="text-sm font-semibold text-red-700">{message}</p>}

      {arrets.length === 0 ? (
        <p className="carte p-5 text-center text-sm text-c2b-muted">
          Personne à livrer ce jour-là. Les noms viennent de la{" "}
          <Link href={`/admin/cuisine?date=${date}`} className="font-bold text-c2b-green underline">
            fiche cuisine
          </Link>{" "}
          du {dateLongue(date)}.
        </p>
      ) : (
        /* Adresses : les noms de la fiche cuisine, chacun avec son champ à coller. */
        <section className={`carte p-4 ${aLocaliser.length ? "border-red-200" : ""}`}>
          <button onClick={() => setAdressesOuvertes(!adressesOuvertes)} className="flex w-full items-center justify-between gap-2 text-left">
            <span className="font-bold text-c2b-green first-letter:uppercase">
              Adresses · {dateLongue(date)}
            </span>
            <span className={`text-xs font-bold ${aLocaliser.length ? "text-red-700" : "text-emerald-700"}`}>
              {aLocaliser.length ? `${aLocaliser.length} à localiser ou vérifier` : `${arrets.length}/${arrets.length} ✓`}
            </span>
          </button>
          {adressesOuvertes && (
            <>
              <p className="mt-1 text-xs text-c2b-muted">
                Les noms de la fiche cuisine. Collez l&apos;adresse ou le lien (Waze, Google Maps, Plans, position WhatsApp) :
                c&apos;est enregistré tout de suite, et gardé pour les jours suivants.
              </p>
              <ul className="mt-1 divide-y divide-black/5">
                {[...aLocaliser, ...arrets.filter((a) => !aLocaliser.includes(a))].map((a) => (
                  <LigneAdresse
                    key={a.cle}
                    arret={a}
                    depart={depart}
                    onEnregistrer={(adresse, point, tel) => enregistrerAdresse(a, adresse, point, tel)}
                    onComplement={(c) => enregistrerComplement(a, c)}
                  />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* Réglages : cuisine, livreurs, tarifs, heures, vitesse */}
      <section className="carte p-4">
        <button onClick={() => setReglagesOuverts(!reglagesOuverts)} className="flex w-full items-center justify-between text-left">
          <span className="flex items-center gap-2 font-bold text-c2b-green">
            <Settings size={17} /> Réglages
          </span>
          <span className="text-xs text-c2b-muted">
            {nb} livreur{nb > 1 ? "s" : ""}
            {!depart && " · cuisine à indiquer"}
          </span>
        </button>
        {reglagesOuverts && (
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-xs font-bold text-c2b-muted mb-1">Point de départ : la cuisine</p>
              <ul>
                <LigneAdresse
                  depart={null}
                  arret={{
                    cle: "depart",
                    source: "client",
                    id: "depart",
                    nom: "Cuisine Chef2Box",
                    telephone: null,
                    adresse: depart?.adresse ?? null,
                    lat: depart?.lat ?? null,
                    lng: depart?.lng ?? null,
                    complement: null,
                    repas: [],
                    notes: [],
                  }}
                  onEnregistrer={async (adresse, point) => {
                    if (!point) return false;
                    await enregistrerReglages({ depart: { adresse: adresse ?? "", lat: point.lat, lng: point.lng } });
                    setPlan(null);
                    return true;
                  }}
                />
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold text-c2b-muted mb-1">Nombre de livreurs</p>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setPlan(null);
                      enregistrerReglages({ nbLivreurs: n });
                    }}
                    className={`rounded-full py-2 text-sm font-bold ${
                      nb === n ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-green"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-c2b-muted">Livreurs : nom, WhatsApp, prix par livraison (DH)</p>
              {reglages.livreurs.slice(0, nb).map((l, i) => {
                const maj = (champ: Partial<ReglagesLivraison["livreurs"][number]>) => {
                  const livreurs = [...reglages.livreurs];
                  livreurs[i] = { ...livreurs[i], ...champ };
                  enregistrerReglages({ livreurs });
                };
                return (
                  <div key={i} className="grid grid-cols-[1fr_1fr_72px] gap-2">
                    <input
                      defaultValue={l.nom}
                      onBlur={(e) => maj({ nom: e.target.value.trim().slice(0, 40) || `Livreur ${i + 1}` })}
                      placeholder={`Livreur ${i + 1}`}
                      className="champ py-2 text-sm"
                      style={{ borderLeft: `4px solid ${COULEURS[i]}` }}
                    />
                    <input
                      defaultValue={l.telephone}
                      onBlur={(e) => maj({ telephone: e.target.value.trim().slice(0, 30) })}
                      placeholder="06…"
                      inputMode="tel"
                      className="champ py-2 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      defaultValue={l.tarif || ""}
                      onBlur={(e) => maj({ tarif: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                      placeholder="DH"
                      className="champ px-2 py-2 text-sm"
                      aria-label={`Prix par livraison pour ${l.nom}`}
                    />
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 block text-xs font-bold text-c2b-muted">
                Départ habituel (midi)
                <input
                  type="time"
                  defaultValue={reglages.heureMidi}
                  onBlur={(e) => e.target.value && enregistrerReglages({ heureMidi: e.target.value })}
                  className="champ mt-1 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-bold text-c2b-muted">
                Vitesse moyenne (km/h)
                <input
                  type="number"
                  min={8}
                  max={60}
                  defaultValue={reglages.vitesseKmh}
                  onBlur={(e) => enregistrerReglages({ vitesseKmh: Math.min(60, Math.max(8, Number(e.target.value) || 22)) })}
                  className="champ mt-1 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-bold text-c2b-muted">
                Minutes par arrêt
                <input
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={reglages.minutesParArret}
                  onBlur={(e) => enregistrerReglages({ minutesParArret: Math.min(20, Math.max(1, Number(e.target.value) || 4)) })}
                  className="champ mt-1 py-2 text-sm"
                />
              </label>
            </div>
            <p className="text-[11px] text-c2b-muted">
              Temps estimé avec les distances et la vitesse moyenne (sans les bouchons) : ajustez la vitesse après quelques
              tournées.
            </p>
          </div>
        )}
      </section>

      {!depart && places.length > 0 && (
        <p className="carte p-4 text-sm font-semibold text-c2b-green">
          Indiquez la position de la cuisine dans les réglages pour calculer les tournées.
        </p>
      )}

      {/* Tournées */}
      {depart && places.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-2xl text-c2b-green">
              {places.length} livraison{places.length > 1 ? "s" : ""}
              {totalPaye > 0 && <span className="ml-2 font-sans text-sm font-bold text-c2b-muted">· {totalPaye} DH</span>}
            </h2>
            {plan && (
              <button onClick={() => setPlan(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-c2b-gold">
                <RotateCcw size={14} /> Répartition auto
              </button>
            )}
          </div>
          {aLocaliser.length > 0 && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              ⚠️ {aLocaliser.length} personne{aLocaliser.length > 1 ? "s" : ""} pas encore dans les tournées (
              {aLocaliser.map((a) => a.nom).join(", ")}) : adresse à localiser ou à vérifier dans « Adresses ».
            </p>
          )}
          <div className="carte overflow-hidden p-2">
            <button
              onClick={() => setCarteVisible(!carteVisible)}
              className="flex w-full items-center justify-between px-2 py-1 text-left text-sm font-bold text-c2b-green"
            >
              <span className="flex items-center gap-2">
                <IconeCarte size={16} /> Carte des tournées
              </span>
              <span className="text-xs font-semibold text-c2b-muted">{carteVisible ? "Masquer" : "Afficher"}</span>
            </button>
            {carteVisible && (
              <div className="mt-2">
                <CarteTournees depart={depart} groupes={groupesCarte} />
                <p className="px-2 pt-2 text-[11px] text-c2b-muted">
                  Un numéro mal placé ? Touchez « Adresse » sous son nom, puis le bouton carte pour le remettre au bon endroit.
                </p>
              </div>
            )}
          </div>
          <p className="text-xs text-c2b-muted">
            Touchez la pastille d&apos;un livreur pour lui donner une livraison ; les flèches changent l&apos;ordre. C&apos;est
            enregistré.
          </p>
          {tournees.map((t, i) => {
            const livreur = reglages.livreurs[i];
            const liens = liensGoogleMaps(depart, t.arrets);
            const numero = livreur.telephone ? numeroWhatsApp(livreur.telephone) : "";
            const h = departDe(i);
            return (
              <div key={i} className="carte overflow-hidden">
                <div className="px-4 py-3 text-white" style={{ backgroundColor: COULEURS[i] }}>
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-bold">🛵 {livreur.nom}</span>
                    <span className="text-sm font-bold">
                      {t.arrets.length} livraison{t.arrets.length > 1 ? "s" : ""}
                      {(() => {
                        const boites = t.arrets.reduce((n, x) => n + (x as ArretPlace).repas.length, 0);
                        return boites > t.arrets.length ? ` · ${boites} boîtes` : "";
                      })()}
                      {livreur.tarif > 0 && ` · ${t.arrets.length * livreur.tarif} DH`}
                    </span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/95">
                    <label className="flex items-center gap-1.5">
                      Départ
                      <input
                        type="time"
                        value={h}
                        onChange={(e) => {
                          const d = [...departs];
                          d[i] = e.target.value || null;
                          setDeparts(d);
                        }}
                        className="rounded-lg bg-white/20 px-1.5 py-0.5 font-bold text-white [color-scheme:dark]"
                        aria-label={`Heure de départ de ${livreur.nom}`}
                      />
                    </label>
                    <span>
                      → fin vers <strong>{heure(h, t.dureeMin)}</strong> · ~{duree(t.dureeMin)} · {t.distanceKm.toFixed(1)} km
                    </span>
                  </div>
                </div>
                {t.arrets.length === 0 ? (
                  <p className="p-4 text-sm text-c2b-muted">Aucune livraison.</p>
                ) : (
                  <ol className="divide-y divide-black/5">
                    {t.arrets.map((a, k) => {
                      const x = a as ArretPlace;
                      return (
                        <li key={x.cle} className="flex items-start gap-3 px-4 py-2.5">
                          <span
                            className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: COULEURS[i] }}
                          >
                            {k + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">
                              <span className="font-bold tabular-nums text-c2b-green">{heure(h, t.arrivees[k])}</span>{" "}
                              <span className="font-bold text-c2b-green">{x.nom}</span>{" "}
                              <span className={`text-xs font-bold ${x.repas.length > 1 ? "text-c2b-gold" : "text-c2b-muted"}`}>
                                · {libelleBoites(x)}
                              </span>
                            </p>
                            {x.adresse && <p className="truncate text-xs text-c2b-muted">{x.adresse}</p>}
                            {x.complement && <p className="text-xs font-bold text-c2b-green">🚪 {x.complement}</p>}
                            {consignes(x).map((c) => (
                              <p key={c} className="text-xs italic text-c2b-text">
                                → {c}
                              </p>
                            ))}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                              <a href={lienPoint(x)} target="_blank" rel="noopener noreferrer" className="mr-1 text-c2b-green underline">
                                Carte
                              </a>
                              <button
                                onClick={() => setEnEdition(enEdition === x.cle ? null : x.cle)}
                                className="mr-1 inline-flex items-center gap-0.5 text-c2b-green underline"
                              >
                                <Pencil size={11} /> Adresse
                              </button>
                              {x.telephone && (
                                <a href={`tel:${x.telephone.replace(/\s/g, "")}`} className="mr-1 text-c2b-green underline">
                                  Appeler
                                </a>
                              )}
                              {nb > 1 &&
                                tournees.map((_, j) => (
                                  <button
                                    key={j}
                                    onClick={() => donnerA(i, k, j)}
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                      j === i ? "text-white" : "border bg-white"
                                    }`}
                                    style={j === i ? { backgroundColor: COULEURS[j] } : { borderColor: COULEURS[j], color: COULEURS[j] }}
                                    aria-pressed={j === i}
                                  >
                                    {reglages.livreurs[j]?.nom}
                                  </button>
                                ))}
                            </div>
                            {enEdition === x.cle && (
                              <div className="mt-2 rounded-xl bg-c2b-cream/60 px-3 pb-1">
                                <ul>
                                  <LigneAdresse
                                    arret={arrets.find((a) => a.cle === x.cle) ?? x}
                                    depart={depart}
                                    onEnregistrer={(adresse, point, tel) => enregistrerAdresse(x, adresse, point, tel)}
                                    onComplement={(c) => enregistrerComplement(x, c)}
                                  />
                                </ul>
                                <p className="pb-2 text-[11px] text-c2b-muted">
                                  Effacez (✕) puis collez la nouvelle adresse ou le lien : gardée pour les prochaines livraisons.{" "}
                                  <button onClick={() => setEnEdition(null)} className="font-bold text-c2b-green underline">
                                    Fermer
                                  </button>
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-shrink-0 flex-col">
                            <button
                              onClick={() => deplacer(i, k, -1)}
                              disabled={k === 0}
                              className="p-1 text-c2b-muted disabled:opacity-20"
                              aria-label={`Monter ${x.nom}`}
                            >
                              <ArrowUp size={16} />
                            </button>
                            <button
                              onClick={() => deplacer(i, k, 1)}
                              disabled={k === t.arrets.length - 1}
                              className="p-1 text-c2b-muted disabled:opacity-20"
                              aria-label={`Descendre ${x.nom}`}
                            >
                              <ArrowDown size={16} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {t.arrets.length > 0 && (
                  <div className="space-y-2 border-t border-black/5 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={liens[0]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 rounded-full bg-c2b-green px-3 py-2.5 text-sm font-bold text-c2b-cream"
                      >
                        <Navigation size={15} /> Itinéraire{liens.length > 1 ? ` 1/${liens.length}` : ""}
                      </a>
                      <a
                        href={`https://wa.me/${numero}?text=${encodeURIComponent(texteTournee(i))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-3 py-2.5 text-sm font-bold text-white"
                      >
                        <Send size={15} /> {numero ? `Envoyer à ${livreur.nom}` : "WhatsApp"}
                      </a>
                    </div>
                    <button
                      onClick={() => envoyerPdf(i)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-full border border-c2b-green/20 bg-white py-2.5 text-sm font-bold text-c2b-green"
                    >
                      <FileText size={15} /> Feuille de route PDF
                    </button>
                    {liens.slice(1).map((l, k) => (
                      <a
                        key={l}
                        href={l}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-full border border-c2b-green/15 py-2 text-center text-xs font-bold text-c2b-green"
                      >
                        Itinéraire, partie {k + 2}/{liens.length}
                      </a>
                    ))}
                    {plan && t.arrets.length > 2 && (
                      <button onClick={() => optimiser(i)} className="w-full text-xs font-semibold text-c2b-gold">
                        Remettre cette tournée dans l&apos;ordre le plus court
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
