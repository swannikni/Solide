"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, Copy, CopyPlus, FileDown, Search, Send, UserPlus, X } from "lucide-react";
import type { jsPDF as JsPDF } from "jspdf";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import { createClient } from "@/lib/supabase/client";
import { decalerDate } from "@/lib/dates";
import { genererFichePdf, libellePalier, type LigneFiche, type ServiceFiche } from "@/lib/fiche-cuisine-pdf";
import type { Palier } from "@/lib/types";

type Service = "dejeuner" | "diner";

export interface ClientCuisine {
  id: string;
  nom: string;
  palier: Palier | null;
  cuisine_allergies: string | null;
  cuisine_refus: string | null;
}

export interface CommandeSemaine {
  id: string;
  client_id: string;
  date_livraison: string;
  repas_type: Service;
  note: string | null;
  palier: Palier | null; // palier du jour, sinon celui du client
}

// Fiche d'une personne ajoutée à la main (sans compte), reprise quand on la
// coche un nouveau jour.
export interface PersonneHistorique {
  nom: string;
  palier: Palier | null;
  allergies: string | null;
  refus: string | null;
  adresse: string | null;
  lat: number | null;
  lng: number | null;
  telephone: string | null;
  complement: string | null;
}

export interface ExtraSemaine extends PersonneHistorique {
  id: string;
  date: string;
  repas_type: Service;
  note: string | null;
}

// Une ligne du planning : client de l'appli ou personne ajoutée à la main.
interface Personne {
  cle: string; // « c:<id> » ou « m:<nom en minuscules> »
  clientId: string | null;
  nom: string;
  palier: Palier | null;
  allergies: string | null;
  refus: string | null;
  note: string | null;
}

// Formulaire « ajouter » ou « modifier » une personne.
interface Formulaire {
  cle: string | null; // personne modifiée (null : nouvelle)
  clientId: string | null;
  nom: string;
  palier: Palier | "";
  allergies: string;
  refus: string;
  note: string;
  cases: string[]; // « date|service » à cocher (ajout seulement)
}

const SERVICES: { cle: Service; libelle: string; court: string; icone: string }[] = [
  { cle: "dejeuner", libelle: "Midi", court: "MIDI", icone: "☀️" },
  { cle: "diner", libelle: "Soir", court: "SOIR", icone: "🌙" },
];
const PALIERS: Palier[] = ["P1", "P2", "P3", "P4", "P5", "P6"];
const CHAMPS_EXTRA = "id, date, repas_type, nom, palier, allergies, refus, note, adresse, lat, lng, telephone, complement";
const CHAMPS_COMMANDE = "id, client_id, date_livraison, repas_type, note, palier";

const cleNom = (nom: string) => nom.trim().toLowerCase();
const sansAccents = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const texte = (t: string, max: number) => t.trim().slice(0, max) || null;
const dateCourte = (date: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { ...o, timeZone: "UTC" });
const jourCourt = (date: string) => dateCourte(date, { weekday: "short" }).replace(".", "");
const dateLongue = (date: string) => dateCourte(date, { weekday: "long", day: "numeric", month: "long" });

// « Rebecca Sturm » → « Rebecca S. » : court, et distingue deux prénoms identiques.
function nomCourt(nom: string) {
  const [prenom, ...reste] = nom.trim().split(/\s+/);
  const initiale = reste.at(-1)?.[0];
  const p = prenom.charAt(0).toUpperCase() + prenom.slice(1);
  return initiale ? `${p} ${initiale.toUpperCase()}.` : p;
}

export function CuisineClient({
  lundi,
  aujourdhui,
  jourChoisi,
  clients: clientsInitiaux,
  commandesInitiales,
  extrasInitiaux,
  personnesConnues,
  platsInitiaux,
}: {
  lundi: string;
  aujourdhui: string;
  jourChoisi: string | null;
  clients: ClientCuisine[];
  commandesInitiales: CommandeSemaine[];
  extrasInitiaux: ExtraSemaine[];
  personnesConnues: PersonneHistorique[];
  platsInitiaux: Record<string, { dejeuner: string; diner: string }>;
}) {
  const supabase = createClient();
  const jours = Array.from({ length: 5 }, (_, i) => decalerDate(lundi, i));
  const vendredi = jours[4];
  const lundiAvant = decalerDate(lundi, -7);
  const cetteSemaine = (d: string) => d >= lundi && d <= vendredi;

  const [clients, setClients] = useState(clientsInitiaux);
  const [commandes, setCommandes] = useState(commandesInitiales);
  const [extras, setExtras] = useState(extrasInitiaux);
  const [plats, setPlats] = useState(platsInitiaux);
  // Personnes affichées dans le planning : celles qui mangent cette semaine à
  // l'ouverture, plus celles ajoutées depuis. Une ligne ne disparaît pas
  // quand on décoche ses cases ; seulement avec « Retirer du planning ».
  const [actifs, setActifs] = useState<Set<string>>(
    () =>
      new Set([
        ...commandesInitiales.filter((c) => cetteSemaine(c.date_livraison)).map((c) => `c:${c.client_id}`),
        ...extrasInitiaux.filter((e) => cetteSemaine(e.date)).map((e) => `m:${cleNom(e.nom)}`),
      ])
  );
  // Fiche des personnes ajoutées ou modifiées à l'instant.
  const [nouvelles, setNouvelles] = useState<Personne[]>([]);
  const [enCours, setEnCours] = useState<Set<string>>(new Set());
  const [formulaire, setFormulaire] = useState<Formulaire | null>(null);
  // Jour déroulé (un seul à la fois).
  const [jourOuvert, setJourOuvert] = useState<string | null>(jourChoisi ?? (cetteSemaine(aujourdhui) ? aujourdhui : lundi));
  const [message, setMessage] = useState("");
  // Recherche dans la liste des clients du jour déroulé.
  const [rechercheJour, setRechercheJour] = useState("");
  // Bibliothèque PDF chargée d'avance : le PDF se fabrique sans attente au
  // toucher, ce qu'exige le partage sur iPhone.
  const [JsPdf, setJsPdf] = useState<typeof JsPDF | null>(null);
  const [logo, setLogo] = useState<{ data: string; ratio: number } | null>(null);
  useEffect(() => {
    import("jspdf").then((m) => setJsPdf(() => m.jsPDF)).catch(() => {});
    // Logo pour l'en-tête du PDF, lu une fois en image (data URL).
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

  const parClient = new Map(clients.map((c) => [c.id, c]));
  const connues = new Map(personnesConnues.map((p) => [cleNom(p.nom), p]));

  const occupe = (id: string) => enCours.has(id);
  const debut = (id: string) => setEnCours((s) => new Set(s).add(id));
  const fin = (id: string) =>
    setEnCours((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  const retirerActif = (cle: string) =>
    setActifs((s) => {
      const n = new Set(s);
      n.delete(cle);
      return n;
    });

  // Toutes les personnes de ces deux semaines (et ajoutées à l'instant). La
  // fiche d'une personne ajoutée à la main : sa ligne la plus récente.
  const personnes = new Map<string, Personne>();
  for (const p of nouvelles) personnes.set(p.cle, p);
  for (const c of commandes) {
    const client = parClient.get(c.client_id);
    const cle = `c:${c.client_id}`;
    if (!client || personnes.has(cle)) continue;
    const ici = commandes.find((x) => x.client_id === c.client_id && cetteSemaine(x.date_livraison));
    personnes.set(cle, {
      cle,
      clientId: client.id,
      nom: client.nom,
      palier: ici?.palier ?? client.palier,
      allergies: client.cuisine_allergies,
      refus: client.cuisine_refus,
      note: ici?.note ?? null,
    });
  }
  for (const e of [...extras].sort((a, b) => b.date.localeCompare(a.date))) {
    const cle = `m:${cleNom(e.nom)}`;
    if (personnes.has(cle)) continue;
    personnes.set(cle, { cle, clientId: null, nom: e.nom, palier: e.palier, allergies: e.allergies, refus: e.refus, note: cetteSemaine(e.date) ? e.note : null });
  }
  const parNom = (a: Personne, b: Personne) => a.nom.localeCompare(b.nom, "fr");
  const liste = Array.from(personnes.values()).filter((p) => actifs.has(p.cle)).sort(parNom);
  // Venus la semaine dernière, pas (encore) dans le planning de cette semaine.
  const absents = Array.from(personnes.values()).filter((p) => !actifs.has(p.cle)).sort(parNom);

  const commandeDe = (p: Personne, date: string, service: Service) =>
    commandes.find((c) => c.client_id === p.clientId && c.date_livraison === date && c.repas_type === service);
  const extraDe = (p: Personne, date: string, service: Service) =>
    extras.find((e) => `m:${cleNom(e.nom)}` === p.cle && e.date === date && e.repas_type === service);
  const coche = (p: Personne, date: string, service: Service) =>
    !!(p.clientId ? commandeDe(p, date, service) : extraDe(p, date, service));
  const lignesSemaine = (p: Personne) =>
    p.clientId
      ? commandes.filter((c) => c.client_id === p.clientId && cetteSemaine(c.date_livraison))
      : extras.filter((e) => `m:${cleNom(e.nom)}` === p.cle && cetteSemaine(e.date));
  // Adresse de livraison la plus récente d'une personne ajoutée à la main.
  function livraisonDe(cle: string) {
    const l = [...extras].sort((a, b) => b.date.localeCompare(a.date)).find((e) => cleNom(e.nom) === cle) ?? connues.get(cle);
    return {
      adresse: l?.adresse ?? null,
      lat: l?.lat ?? null,
      lng: l?.lng ?? null,
      telephone: l?.telephone ?? null,
      complement: l?.complement ?? null,
    };
  }

  const totalJour = (date: string, service: Service) =>
    commandes.filter((c) => c.date_livraison === date && c.repas_type === service && parClient.has(c.client_id)).length +
    extras.filter((e) => e.date === date && e.repas_type === service).length;
  const totalSemaine = jours.reduce((t, d) => t + totalJour(d, "dejeuner") + totalJour(d, "diner"), 0);

  // Ajoute ou retire un repas (une case du planning).
  async function poser(p: Personne, date: string, service: Service, voulu: boolean) {
    const id = `${p.cle}|${date}|${service}`;
    if (occupe(id) || coche(p, date, service) === voulu) return;
    debut(id);
    try {
      if (p.clientId) {
        const existante = commandeDe(p, date, service);
        if (existante) {
          const { error } = await supabase.from("application_commandes").delete().eq("id", existante.id);
          if (error) throw error;
          setCommandes((prev) => prev.filter((c) => c.id !== existante.id));
        } else {
          const client = parClient.get(p.clientId);
          const { data, error } = await supabase
            .from("application_commandes")
            .upsert(
              {
                client_id: p.clientId,
                date_livraison: date,
                repas_type: service,
                statut: "confirmee",
                palier: p.palier && p.palier !== client?.palier ? p.palier : null,
                note: p.note,
              },
              { onConflict: "client_id,date_livraison,repas_type" }
            )
            .select(CHAMPS_COMMANDE)
            .single<CommandeSemaine>();
          if (error || !data) throw error;
          setCommandes((prev) => [...prev, data]);
        }
      } else {
        const existant = extraDe(p, date, service);
        if (existant) {
          const { error } = await supabase.from("application_cuisine_extras").delete().eq("id", existant.id);
          if (error) throw error;
          setExtras((prev) => prev.filter((e) => e.id !== existant.id));
        } else {
          const { data, error } = await supabase
            .from("application_cuisine_extras")
            .insert({
              date,
              repas_type: service,
              nom: p.nom,
              palier: p.palier,
              allergies: p.allergies,
              refus: p.refus,
              note: p.note,
              ...livraisonDe(p.cle.slice(2)),
            })
            .select(CHAMPS_EXTRA)
            .single<ExtraSemaine>();
          if (error || !data) throw error;
          setExtras((prev) => [...prev, data]);
        }
      }
      setMessage("");
    } catch {
      setMessage("Enregistrement impossible, vérifiez la connexion et réessayez.");
    } finally {
      fin(id);
    }
  }

  async function toutLaSemaine(p: Personne, service: Service) {
    for (const d of jours) await poser(p, d, service, true);
  }

  // Retire tous les repas de la semaine et enlève la ligne du planning.
  async function retirer(p: Personne) {
    const lignes = lignesSemaine(p);
    if (lignes.length && !window.confirm(`Retirer ${p.nom} du planning ? Ses ${lignes.length} repas de la semaine seront supprimés.`)) return;
    debut(p.cle);
    const ids = lignes.map((l) => l.id);
    const table = p.clientId ? "application_commandes" : "application_cuisine_extras";
    const { error } = ids.length ? await supabase.from(table).delete().in("id", ids) : { error: null };
    fin(p.cle);
    if (error) return setMessage("Retrait impossible, réessayez.");
    if (p.clientId) setCommandes((prev) => prev.filter((c) => !ids.includes(c.id)));
    else setExtras((prev) => prev.filter((e) => !ids.includes(e.id)));
    retirerActif(p.cle);
    setMessage(`${p.nom} est retiré(e) du planning.`);
  }

  function remettre(p: Personne) {
    setActifs((s) => new Set(s).add(p.cle));
    setMessage(`${p.nom} est dans le planning : cochez ses repas.`);
  }

  // Reprend la semaine précédente, jour par jour (lundi → lundi…), sans
  // toucher à ce qui est déjà coché cette semaine.
  const commandesAReprendre = commandes
    .filter((c) => c.date_livraison < lundi && parClient.has(c.client_id))
    .map((c) => ({ ...c, date_livraison: decalerDate(c.date_livraison, 7) }))
    .filter((c) => !commandes.some((x) => x.client_id === c.client_id && x.repas_type === c.repas_type && x.date_livraison === c.date_livraison));
  const extrasAReprendre = extras
    .filter((e) => e.date < lundi)
    .map((e) => ({ ...e, date: decalerDate(e.date, 7) }))
    .filter((e) => !extras.some((x) => cleNom(x.nom) === cleNom(e.nom) && x.repas_type === e.repas_type && x.date === e.date));
  const aReprendre = commandesAReprendre.length + extrasAReprendre.length;

  async function reprendreSemaineAvant() {
    if (!window.confirm(`Ajouter les ${aReprendre} repas de la semaine dernière (mêmes jours, midi et soir) ? Retirez ensuite les absents.`)) return;
    debut("reprise");
    const [rc, re] = await Promise.all([
      commandesAReprendre.length
        ? supabase
            .from("application_commandes")
            .upsert(
              commandesAReprendre.map(({ id: _id, ...c }) => ({ ...c, statut: "confirmee" })),
              { onConflict: "client_id,date_livraison,repas_type", ignoreDuplicates: true }
            )
            .select(CHAMPS_COMMANDE)
            .returns<CommandeSemaine[]>()
        : { data: [] as CommandeSemaine[], error: null },
      extrasAReprendre.length
        ? supabase
            .from("application_cuisine_extras")
            .insert(extrasAReprendre.map(({ id: _id, ...e }) => e))
            .select(CHAMPS_EXTRA)
            .returns<ExtraSemaine[]>()
        : { data: [] as ExtraSemaine[], error: null },
    ]);
    setCommandes((prev) => [...prev, ...(rc.data ?? [])]);
    setExtras((prev) => [...prev, ...(re.data ?? [])]);
    setActifs((s) => new Set([...s, ...(rc.data ?? []).map((c) => `c:${c.client_id}`), ...(re.data ?? []).map((e) => `m:${cleNom(e.nom)}`)]));
    setMessage(rc.error || re.error ? "Reprise incomplète, réessayez." : "Semaine dernière reprise : retirez les absents et ajustez les cases.");
    fin("reprise");
  }

  // ---- Ajouter / modifier une personne ----

  function ouvrirAjout() {
    setFormulaire({ cle: null, clientId: null, nom: rechercheJour.trim(), palier: "", allergies: "", refus: "", note: "", cases: [] });
  }

  function ouvrirModification(p: Personne) {
    setFormulaire({
      cle: p.cle,
      clientId: p.clientId,
      nom: p.nom,
      palier: p.palier ?? "",
      allergies: p.allergies ?? "",
      refus: p.refus ?? "",
      note: p.note ?? "",
      cases: [],
    });
  }

  async function enregistrerFormulaire() {
    const f = formulaire;
    if (!f) return;
    const nom = f.nom.trim().slice(0, 80);
    if (!nom) return setMessage("Indiquez un nom.");
    const champs = { palier: f.palier || null, allergies: texte(f.allergies, 300), refus: texte(f.refus, 300), note: texte(f.note, 200) };
    // Nom d'une personne déjà venue tapé en entier, sans rien d'autre : on
    // reprend sa fiche (palier, allergies, refus).
    const connue = !f.cle && !f.clientId ? (personnes.get(`m:${cleNom(nom)}`) ?? connues.get(cleNom(nom))) : undefined;
    if (connue && !champs.palier && !champs.allergies && !champs.refus)
      Object.assign(champs, { palier: connue.palier, allergies: connue.allergies, refus: connue.refus });

    if (f.cle) {
      // Modification : fiche du client, ou lignes de la semaine de la personne.
      const p = personnes.get(f.cle);
      if (!p) return setFormulaire(null);
      const ids = lignesSemaine(p).map((l) => l.id);
      debut("formulaire");
      if (p.clientId) {
        const client = parClient.get(p.clientId);
        const prefs = { cuisine_allergies: champs.allergies, cuisine_refus: champs.refus };
        const maj = { palier: champs.palier && champs.palier !== client?.palier ? champs.palier : null, note: champs.note };
        const [r1, r2] = await Promise.all([
          supabase.from("application_clients").update(prefs).eq("id", p.clientId),
          ids.length ? supabase.from("application_commandes").update(maj).in("id", ids) : { error: null },
        ]);
        fin("formulaire");
        if (r1.error || r2.error) return setMessage("Enregistrement impossible, réessayez.");
        setClients((prev) => prev.map((c) => (c.id === p.clientId ? { ...c, ...prefs } : c)));
        setCommandes((prev) => prev.map((c) => (ids.includes(c.id) ? { ...c, ...maj } : c)));
        setNouvelles((prev) => [...prev.filter((x) => x.cle !== p.cle), { ...p, ...champs }]);
      } else {
        const nouvelleCle = `m:${cleNom(nom)}`;
        if (nouvelleCle !== p.cle && personnes.has(nouvelleCle)) {
          fin("formulaire");
          return setMessage("Ce nom est déjà dans la liste.");
        }
        const maj = { nom, ...champs };
        const { error } = ids.length ? await supabase.from("application_cuisine_extras").update(maj).in("id", ids) : { error: null };
        fin("formulaire");
        if (error) return setMessage("Enregistrement impossible, réessayez.");
        setExtras((prev) => prev.map((e) => (ids.includes(e.id) ? { ...e, ...maj } : e)));
        setNouvelles((prev) => [...prev.filter((x) => x.cle !== p.cle), { ...p, cle: nouvelleCle, ...maj }]);
        if (nouvelleCle !== p.cle) {
          retirerActif(p.cle);
          setActifs((s) => new Set(s).add(nouvelleCle));
        }
      }
      setFormulaire(null);
      setMessage("");
      return;
    }

    // Ajout : la personne et les repas cochés dans le formulaire.
    const cle = f.clientId ? `c:${f.clientId}` : `m:${cleNom(nom)}`;
    if (actifs.has(cle)) return setMessage(`${nom} est déjà dans le planning.`);
    const repas = f.cases.map((c) => c.split("|") as [string, Service]);
    debut("formulaire");
    if (f.clientId) {
      const client = parClient.get(f.clientId);
      const palier = champs.palier && champs.palier !== client?.palier ? champs.palier : null;
      const prefs = { cuisine_allergies: champs.allergies, cuisine_refus: champs.refus };
      const [r1, r2] = await Promise.all([
        supabase.from("application_clients").update(prefs).eq("id", f.clientId),
        repas.length
          ? supabase
              .from("application_commandes")
              .upsert(
                repas.map(([date, service]) => ({ client_id: f.clientId, date_livraison: date, repas_type: service, statut: "confirmee", palier, note: champs.note })),
                { onConflict: "client_id,date_livraison,repas_type" }
              )
              .select(CHAMPS_COMMANDE)
              .returns<CommandeSemaine[]>()
          : { data: [] as CommandeSemaine[], error: null },
      ]);
      fin("formulaire");
      if (r1.error || r2.error) return setMessage("Ajout impossible, réessayez.");
      const ajoutees = r2.data ?? [];
      setClients((prev) => prev.map((c) => (c.id === f.clientId ? { ...c, ...prefs } : c)));
      setCommandes((prev) => [...prev.filter((c) => !ajoutees.some((a) => a.id === c.id)), ...ajoutees]);
      setNouvelles((prev) => [...prev.filter((x) => x.cle !== cle), { cle, clientId: f.clientId, nom: client?.nom ?? nom, ...champs }]);
    } else {
      const { data, error } = repas.length
        ? await supabase
            .from("application_cuisine_extras")
            .insert(repas.map(([date, service]) => ({ date, repas_type: service, nom, ...champs, ...livraisonDe(cleNom(nom)) })))
            .select(CHAMPS_EXTRA)
            .returns<ExtraSemaine[]>()
        : { data: [] as ExtraSemaine[], error: null };
      fin("formulaire");
      if (error) return setMessage("Ajout impossible, réessayez.");
      setExtras((prev) => [...prev, ...(data ?? [])]);
      setNouvelles((prev) => [...prev.filter((x) => x.cle !== cle), { cle, clientId: null, nom, ...champs }]);
    }
    setActifs((s) => new Set(s).add(cle));
    setFormulaire(null);
    setMessage(`${nom} est ajouté(e) au planning${repas.length ? ` (${repas.length} repas)` : " : cochez ses repas"}.`);
  }

  // Suggestions pendant la saisie du nom : clients de l'appli et personnes
  // déjà venues, pas encore dans le planning de la semaine.
  const saisie = sansAccents(formulaire && !formulaire.cle && !formulaire.clientId ? formulaire.nom : "");
  const suggestions = saisie
    ? [
        ...clients.map((c) => ({ cle: `c:${c.id}`, clientId: c.id as string | null, nom: c.nom, palier: c.palier, allergies: c.cuisine_allergies, refus: c.cuisine_refus })),
        ...Array.from(personnes.values()).filter((p) => !p.clientId),
        ...personnesConnues.map((p) => ({ cle: `m:${cleNom(p.nom)}`, clientId: null, nom: p.nom, palier: p.palier, allergies: p.allergies, refus: p.refus })),
      ]
        .filter((p, i, t) => !actifs.has(p.cle) && t.findIndex((x) => x.cle === p.cle) === i)
        .filter((p) => sansAccents(p.nom) !== saisie || p.clientId)
        .filter((p) => sansAccents(p.nom).startsWith(saisie) || sansAccents(p.nom).split(/\s+/).some((m) => m.startsWith(saisie)))
        .slice(0, 5)
    : [];

  function choisirSuggestion(s: (typeof suggestions)[number]) {
    setFormulaire((f) => ({
      cle: null,
      clientId: s.clientId,
      nom: s.nom,
      palier: s.palier ?? "",
      allergies: s.allergies ?? "",
      refus: s.refus ?? "",
      note: "",
      cases: f?.cases ?? [],
    }));
  }

  // ---- Fiche du jour (PDF, texte WhatsApp) ----

  function fiche(date: string): (ServiceFiche & { cle: Service; icone: string; libelle: string })[] {
    return SERVICES.map((s) => {
      const lignes: LigneFiche[] = [
        ...commandes
          .filter((c) => c.date_livraison === date && c.repas_type === s.cle && parClient.has(c.client_id))
          .map((c) => {
            const client = parClient.get(c.client_id)!;
            return {
              cle: c.id,
              nom: nomCourt(client.nom),
              palier: c.palier ?? client.palier,
              allergies: client.cuisine_allergies,
              refus: client.cuisine_refus,
              note: c.note,
            };
          }),
        ...extras
          .filter((e) => e.date === date && e.repas_type === s.cle)
          .map((e) => ({ cle: e.id, nom: e.nom, palier: e.palier, allergies: e.allergies, refus: e.refus, note: e.note })),
      ].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
      const paliers = [...PALIERS, null]
        .map((p) => ({ palier: p, lignes: lignes.filter((l) => l.palier === p) }))
        .filter((g) => g.lignes.length > 0);
      return { ...s, plat: (plats[date]?.[s.cle] ?? "").trim(), total: lignes.length, paliers };
    });
  }

  function texteFiche(date: string) {
    const f = fiche(date);
    const total = f.reduce((t, s) => t + s.total, 0);
    const lignes = [`*FICHE CUISINE — ${dateLongue(date)}*`, `Total : ${total} repas (${f.map((s) => `${s.total} ${s.libelle.toLowerCase()}`).join(" · ")})`];
    for (const s of f) {
      lignes.push("", `*${s.icone} ${s.court}${s.plat ? ` (${s.plat})` : ""} : ${s.total} repas*`);
      if (s.total === 0) lignes.push("Aucun repas");
      for (const g of s.paliers) {
        lignes.push(`*${libellePalier(g.palier)}*`);
        for (const l of g.lignes) {
          const details = [l.allergies && `⚠️ ALLERGIE : ${l.allergies}`, l.refus && `sans : ${l.refus}`, l.note && `→ ${l.note}`].filter(Boolean);
          lignes.push(`• ${l.nom}${details.length ? ` — ${details.join(" — ")}` : ""}`);
        }
        lignes.push(`_Total ${libellePalier(g.palier).toLowerCase()} : ${g.lignes.length}_`);
      }
    }
    return lignes.join("\n");
  }

  async function envoyerPdf(date: string) {
    if (!JsPdf) return setMessage("Préparation du PDF, réessayez dans une seconde.");
    const blob = genererFichePdf(JsPdf, { titreDate: dateLongue(date), services: fiche(date), logo });
    const fichier = new File([blob], `fiche-cuisine-${date}.pdf`, { type: "application/pdf" });
    // Téléphone : menu de partage (WhatsApp, mail…). Sinon : téléchargement.
    if (navigator.canShare?.({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier], title: `Fiche cuisine ${dateLongue(date)}` });
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

  async function copierFiche(date: string) {
    try {
      await navigator.clipboard.writeText(texteFiche(date));
      setMessage("Fiche copiée : collez-la dans WhatsApp.");
    } catch {
      setMessage("Copie impossible sur cet appareil.");
    }
  }

  async function enregistrerPlat(date: string, service: Service, valeur: string) {
    const plat = valeur.trim().slice(0, 120) || null;
    const { error } = await supabase.from("application_cuisine_services").upsert({ date, repas_type: service, plat }, { onConflict: "date,repas_type" });
    if (error) setMessage("Plat non enregistré, réessayez.");
  }

  const titreSemaine = `${dateCourte(lundi, { day: "numeric", month: "short" })} – ${dateCourte(vendredi, { day: "numeric", month: "short" })}`;
  const nbAllergies = (f: ReturnType<typeof fiche>) => f.reduce((t, s) => t + s.paliers.reduce((u, g) => u + g.lignes.filter((l) => l.allergies).length, 0), 0);

  // Cases midi/soir × jours du formulaire d'ajout.
  const cases = (estCoche: (d: string, s: Service) => boolean, basculer: (d: string, s: Service) => void) => (
    <div className="mt-2 grid grid-cols-[30px_repeat(5,minmax(0,1fr))] gap-1">
      <span />
      {jours.map((d) => (
        <span key={d} className="text-center text-[10px] font-bold uppercase text-c2b-muted">
          {jourCourt(d)}
        </span>
      ))}
      {SERVICES.map((s) => (
        <Fragment key={s.cle}>
          <span className="flex items-center justify-center text-base" title={s.libelle}>
            {s.icone}
          </span>
          {jours.map((d) => {
            const actif = estCoche(d, s.cle);
            return (
              <button
                key={d}
                type="button"
                onClick={() => basculer(d, s.cle)}
                aria-pressed={actif}
                aria-label={`${s.libelle} ${dateCourte(d, { weekday: "long" })}`}
                className={`h-10 rounded-xl text-sm font-bold transition ${
                  actif ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-transparent"
                }`}
              >
                ✓
              </button>
            );
          })}
        </Fragment>
      ))}
    </div>
  );

  const personneModifiee = formulaire?.cle ? personnes.get(formulaire.cle) : undefined;
  const champsFormulaire = formulaire && (
    <section className="carte p-4 space-y-3 border-c2b-gold/50">
      <p className="flex items-center gap-2 font-bold text-c2b-green">
        <UserPlus size={17} /> {formulaire.cle ? `Modifier ${formulaire.nom}` : "Ajouter une personne"}
      </p>
      {formulaire.clientId ? (
        <p className="text-sm font-bold text-c2b-green">
          {formulaire.nom} <span className="text-xs font-semibold text-c2b-muted">· client de l&apos;appli</span>
        </p>
      ) : (
        <input
          autoFocus={!formulaire.cle}
          value={formulaire.nom}
          onChange={(e) => setFormulaire({ ...formulaire, nom: e.target.value })}
          placeholder="Nom (ex : Yasmine B.)"
          maxLength={80}
          autoComplete="off"
          className="champ py-2.5 font-bold"
        />
      )}
      {suggestions.length > 0 && (
        <ul className="-mt-1 overflow-hidden rounded-xl border border-c2b-green/10 bg-white">
          {suggestions.map((s) => (
            <li key={s.cle}>
              <button
                type="button"
                onClick={() => choisirSuggestion(s)}
                className="w-full border-b border-c2b-green/5 px-3 py-2 text-left last:border-b-0 hover:bg-c2b-cream"
              >
                <span className="text-sm font-bold text-c2b-green">{s.nom}</span>
                <span className="ml-1.5 text-xs text-c2b-muted">
                  {[s.palier && libellePalier(s.palier), s.clientId ? "client de l'appli" : "déjà venu(e)"].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1.5">
        {PALIERS.map((pl) => (
          <button
            key={pl}
            type="button"
            onClick={() => setFormulaire({ ...formulaire, palier: formulaire.palier === pl ? "" : pl })}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              formulaire.palier === pl ? "bg-c2b-gold text-c2b-green" : "bg-white border border-c2b-green/15 text-c2b-green"
            }`}
          >
            {libellePalier(pl)}
          </button>
        ))}
      </div>
      <input
        value={formulaire.allergies}
        onChange={(e) => setFormulaire({ ...formulaire, allergies: e.target.value })}
        placeholder="Allergies (ex : arachides, lactose)"
        maxLength={300}
        className="champ py-2.5 text-sm"
      />
      <input
        value={formulaire.refus}
        onChange={(e) => setFormulaire({ ...formulaire, refus: e.target.value })}
        placeholder="Ne mange pas (ex : parmesan, oignon)"
        maxLength={300}
        className="champ py-2.5 text-sm"
      />
      <input
        value={formulaire.note}
        onChange={(e) => setFormulaire({ ...formulaire, note: e.target.value })}
        placeholder="Consigne pour la cuisine (facultatif)"
        maxLength={200}
        className="champ py-2.5 text-sm"
      />
      {personneModifiee ? (
        <>
          <p className="text-[11px] text-c2b-muted">S&apos;applique à tous ses repas de la semaine.</p>
          <div className="flex flex-wrap gap-1.5">
            {SERVICES.map((s) => (
              <button
                key={s.cle}
                type="button"
                onClick={() => toutLaSemaine(personneModifiee, s.cle)}
                className="rounded-full bg-white border border-c2b-green/15 px-3 py-1.5 text-xs font-bold text-c2b-green"
              >
                {s.icone} {s.libelle} toute la semaine
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setFormulaire(null);
                retirer(personneModifiee);
              }}
              className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700"
            >
              Retirer du planning
            </button>
          </div>
        </>
      ) : (
        <div>
          <p className="text-xs font-bold text-c2b-muted">Ses repas cette semaine</p>
          {cases(
            (d, s) => formulaire.cases.includes(`${d}|${s}`),
            (d, s) => {
              const k = `${d}|${s}`;
              setFormulaire({ ...formulaire, cases: formulaire.cases.includes(k) ? formulaire.cases.filter((x) => x !== k) : [...formulaire.cases, k] });
            }
          )}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={enregistrerFormulaire} disabled={occupe("formulaire")} className="btn-primary flex-1 py-2.5 text-sm">
          {occupe("formulaire") ? "Enregistrement..." : formulaire.cle ? "Enregistrer" : "Ajouter"}
        </button>
        <button onClick={() => setFormulaire(null)} className="btn-secondary flex-1 py-2.5 text-sm">
          Annuler
        </button>
      </div>
    </section>
  );

  // Contenu d'un jour déroulé : plats, clients (midi / soir), fiche à l'écran.
  function contenuJour(date: string) {
    const f = fiche(date);
    const total = f.reduce((t, s) => t + s.total, 0);
    // Ceux qui mangent ce jour-là d'abord, puis le reste du planning.
    const mange = (p: Personne) => SERVICES.some((s) => coche(p, date, s.cle));
    const filtre = sansAccents(rechercheJour);
    const ordre = [...liste.filter(mange), ...liste.filter((p) => !mange(p))].filter((p) => !filtre || sansAccents(p.nom).includes(filtre));
    return (
      <div className="space-y-4 border-t border-c2b-green/10 px-3 pb-4 pt-3">
        <div className="grid grid-cols-2 gap-2">
          {SERVICES.map((s) => (
            <input
              key={`${date}-${s.cle}`}
              defaultValue={plats[date]?.[s.cle] ?? ""}
              onChange={(e) => setPlats((p) => ({ ...p, [date]: { ...(p[date] ?? { dejeuner: "", diner: "" }), [s.cle]: e.target.value } }))}
              onBlur={(e) => enregistrerPlat(date, s.cle, e.target.value)}
              placeholder={`${s.icone} Plat du ${s.libelle.toLowerCase()}`}
              maxLength={120}
              className="champ py-2 text-sm"
            />
          ))}
        </div>

        {/* Clients : midi et soir de ce jour, d'un toucher. */}
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-c2b-muted">Clients</p>
          {liste.length > 6 && (
            <div className="relative mb-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-c2b-muted" />
              <input
                value={rechercheJour}
                onChange={(e) => setRechercheJour(e.target.value)}
                placeholder="Rechercher un nom"
                autoComplete="off"
                className="champ py-2 pl-8 pr-8 text-sm"
              />
              {rechercheJour && (
                <button
                  onClick={() => setRechercheJour("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-c2b-muted"
                  aria-label="Effacer la recherche"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}
          {ordre.length === 0 && (
            <p className="py-2 text-sm text-c2b-muted">
              {filtre ? "Personne de ce nom dans le planning : ajoutez-la ci-dessous." : "Personne dans le planning cette semaine."}
            </p>
          )}
          <ul className="divide-y divide-c2b-green/10">
            {ordre.map((p) =>
              formulaire?.cle === p.cle ? (
                <li key={p.cle} className="py-2">
                  {champsFormulaire}
                </li>
              ) : (
                <li key={p.cle} className="flex items-center gap-2 py-2">
                  <button onClick={() => ouvrirModification(p)} className="min-w-0 flex-1 text-left" aria-label={`Modifier ${p.nom}`}>
                    <p className={`truncate text-sm font-bold ${mange(p) ? "text-c2b-green" : "text-c2b-muted"}`}>
                      {p.nom}
                      <span className="ml-1.5 rounded-full bg-c2b-gold/[0.15] px-1.5 py-0.5 text-[10px] font-bold text-c2b-green">{p.palier ?? "—"}</span>
                    </p>
                    {(p.allergies || p.refus || p.note) && (
                      <p className="truncate text-[11px] text-c2b-muted">
                        {p.allergies && <span className="font-bold text-red-700">⚠️ {p.allergies} </span>}
                        {p.refus && <span>· sans {p.refus} </span>}
                        {p.note && <span className="italic">· {p.note}</span>}
                      </p>
                    )}
                  </button>
                  {SERVICES.map((s) => {
                    const actif = coche(p, date, s.cle);
                    const attente = occupe(`${p.cle}|${date}|${s.cle}`);
                    return (
                      <button
                        key={s.cle}
                        onClick={() => poser(p, date, s.cle, !actif)}
                        disabled={attente}
                        aria-pressed={actif}
                        aria-label={`${p.nom}, ${s.libelle.toLowerCase()}`}
                        className={`flex h-10 w-[60px] flex-shrink-0 items-center justify-center gap-1 rounded-xl text-xs font-bold transition ${
                          actif ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-muted"
                        } ${attente ? "opacity-50" : ""}`}
                      >
                        {s.icone} {s.libelle}
                      </button>
                    );
                  })}
                </li>
              )
            )}
          </ul>
          {formulaire && !formulaire.cle ? (
            <div className="pt-2">{champsFormulaire}</div>
          ) : (
            <button onClick={ouvrirAjout} className="btn-secondary mt-2 w-full py-2.5 text-sm">
              <UserPlus size={16} /> Ajouter une personne
            </button>
          )}
        </div>

        {/* La fiche du jour, à l'écran (la même que le PDF). */}
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-c2b-muted">Fiche du {dateLongue(date)}</p>
          {nbAllergies(f) > 0 && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              ⚠️ {nbAllergies(f)} repas avec allergie : bien vérifier avant de fermer les boîtes.
            </p>
          )}
          {f.map((s) => (
            <div key={s.cle}>
              <h3 className="flex items-baseline justify-between gap-2 rounded-lg bg-c2b-green px-3 py-2 text-c2b-cream">
                <span className="font-bold">
                  {s.icone} {s.court}
                  {s.plat && <span className="font-semibold"> ({s.plat})</span>}
                </span>
                <span className="text-lg font-bold whitespace-nowrap">{s.total} repas</span>
              </h3>
              {s.total === 0 ? (
                <p className="px-1 py-2 text-sm text-c2b-muted">Aucun repas</p>
              ) : (
                s.paliers.map((g) => (
                  <div key={g.palier ?? "aucun"} className="mt-2">
                    <p className="flex justify-between border-b border-c2b-green/20 pb-1 text-sm font-bold text-c2b-green">
                      <span>{libellePalier(g.palier)}</span>
                      <span className="text-c2b-muted">{g.lignes.length}</span>
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {g.lignes.map((l) => (
                        <li key={l.cle} className="text-sm leading-snug">
                          <span className="font-bold text-c2b-green">{l.nom}</span>
                          {l.allergies && <span className="ml-1.5 font-bold text-red-700">⚠️ {l.allergies}</span>}
                          {l.refus && <span className="text-c2b-text"> · sans {l.refus}</span>}
                          {l.note && <span className="italic text-c2b-text"> · {l.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          ))}
          {total > 0 && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button onClick={() => envoyerPdf(date)} className="btn-primary px-3 py-2.5 text-sm">
                <FileDown size={15} /> PDF
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(texteFiche(date))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-3 py-2.5 text-sm font-bold text-white"
              >
                <Send size={15} /> Texte
              </a>
              <button onClick={() => copierFiche(date)} className="btn-secondary px-3 py-2 text-sm">
                <Copy size={15} /> Copier
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-4">
      <AdminOnglets />
      <div>
        <span className="lbl mb-2">Espace admin</span>
        <h1 className="titre text-[34px]">
          Planning <em>cuisine</em>
        </h1>
      </div>

      <div className="flex items-center justify-between rounded-full bg-white border border-c2b-green/10 px-1 py-1">
        <Link
          href={`/admin/cuisine?lundi=${lundiAvant}`}
          className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
          aria-label="Semaine précédente"
        >
          <ChevronLeft size={20} />
        </Link>
        <span className="text-sm font-bold text-c2b-green">
          {titreSemaine} · {totalSemaine} repas
        </span>
        <Link
          href={`/admin/cuisine?lundi=${decalerDate(lundi, 7)}`}
          className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
          aria-label="Semaine suivante"
        >
          <ChevronRight size={20} />
        </Link>
      </div>

      {aReprendre > 0 && (
        <button onClick={reprendreSemaineAvant} disabled={occupe("reprise")} className="btn-secondary w-full">
          <CopyPlus size={17} /> {occupe("reprise") ? "Reprise..." : `Reprendre la semaine dernière (${aReprendre})`}
        </button>
      )}

      {message && <p className="text-sm font-semibold text-c2b-green">{message}</p>}

      {/* Les jours : on en déroule un pour voir ses clients et sa fiche. */}
      <ul className="space-y-2">
        {jours.map((d) => {
          const ouvert = jourOuvert === d;
          const allergies = nbAllergies(fiche(d));
          return (
            <li key={d} className={`carte overflow-hidden ${ouvert ? "border-c2b-green/30" : ""}`}>
              <button
                onClick={() => {
                  setFormulaire(null);
                  setJourOuvert(ouvert ? null : d);
                }}
                aria-expanded={ouvert}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <span className="flex-1">
                  <span className="block font-bold text-c2b-green first-letter:uppercase">
                    {dateCourte(d, { weekday: "long", day: "numeric", month: "short" })}
                    {d === aujourdhui && <span className="ml-2 rounded-full bg-c2b-gold/20 px-2 py-0.5 text-[10px] font-bold">Aujourd&apos;hui</span>}
                  </span>
                  {allergies > 0 && <span className="text-[11px] font-bold text-red-700">⚠️ {allergies} allergie{allergies > 1 ? "s" : ""}</span>}
                </span>
                <span className="text-sm font-bold tabular-nums text-c2b-text">☀️ {totalJour(d, "dejeuner")}</span>
                <span className="text-sm font-bold tabular-nums text-c2b-text">🌙 {totalJour(d, "diner")}</span>
                <ChevronDown size={18} className={`text-c2b-muted transition-transform ${ouvert ? "rotate-180" : ""}`} />
              </button>
              {ouvert && contenuJour(d)}
            </li>
          );
        })}
      </ul>

      {absents.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-c2b-muted">Venus la semaine dernière, pas dans le planning</h2>
          <div className="flex flex-wrap gap-1.5">
            {absents.map((p) => (
              <button
                key={p.cle}
                onClick={() => remettre(p)}
                className="rounded-full bg-white border border-c2b-green/15 px-3 py-1.5 text-xs font-bold text-c2b-green"
              >
                + {p.nom}
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
