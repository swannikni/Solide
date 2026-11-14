"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Copy, Eye, Link2, MessageCircle, Minus, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ZONES, nouveauJeton, prixDemande, type Zone } from "@/lib/ma-semaine";
import { decalerDate } from "@/lib/dates";
import type { Tarifs } from "@/lib/paiements";
import type { Client, Palier, Questionnaire, SuiviProspect } from "@/lib/types";
import { numeroValide } from "@/lib/telephone";
import { LIBELLES, MESSAGES_PROSPECT, composerMessage, lire, lireModeles, type Public } from "@/lib/messages-envoi";

export interface FichePersonne {
  id: string;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  complement: string | null;
  palier: Palier | null;
  allergies: string | null;
  refus: string | null;
  note: string | null;
  client_id: string | null;
  jeton: string | null;
  livraison_offerte: boolean | null;
  remise: number | null;
  zone: Zone | null;
  partenaire: boolean | null;
  vu_le: string | null;
  envoi_pause: boolean | null;
  created_at: string;
}

export interface RepasFiche {
  id: string;
  date: string;
  service: "dejeuner" | "diner";
  quantite: number;
  appli?: boolean; // commandé depuis l'appli (table des commandes)
}

type Paiement = {
  id: string;
  semaine: string | null;
  mois: string | null;
  montant: number;
  recu: number;
  moyen: string | null;
  paye_le: string | null;
  note: string | null;
};

type Onglet = "resume" | "commandes" | "paiements" | "envois" | "reglages";

const PALIERS_FICHE: { cle: Palier; libelle: string }[] = [
  { cle: "P1", libelle: "P1 · 800 kcal" },
  { cle: "P2", libelle: "P2 · 680-700" },
  { cle: "P3", libelle: "P3 · 550-600" },
];
const SUIVIS: { cle: SuiviProspect; libelle: string }[] = [
  { cle: "a_contacter", libelle: "À contacter" },
  { cle: "contacte", libelle: "Contacté" },
  { cle: "pas_interesse", libelle: "Pas intéressé" },
];
const REMISES = [0, 10, 20, 30, 50, 100];
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven"];
const QUESTIONS: Record<string, string> = {
  objTexte: "Objectif",
  repas: "Repas par jour",
  repartition: "Répartition",
  sport: "Sport",
  duree: "Durée des séances",
  allergies: "Allergies",
  refuses: "N'aime pas",
  preferes: "Aime",
};

// Chiffres pour wa.me (06… → 2126…).
function numeroWa(t: string | null | undefined) {
  const brut = (t ?? "").trim();
  const c = brut.replace(/\D/g, "").replace(/^00/, "");
  if (!brut.startsWith("+") && /^0[5-7]\d{8}$/.test(c)) return `212${c.slice(1)}`;
  return c.length >= 9 ? c : "";
}
const jourCourt = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const dh = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} DH`;

export function FicheClient({
  nom: nomInitial,
  personne: personneInitiale,
  compte,
  accesRetire: accesRetireInitial,
  email,
  questionnaires: questionnairesInitiaux,
  repas: repasInitiaux,
  paiements,
  envois,
  offre,
  tarifs,
  lundis,
  lundiDefaut,
  aujourdhui,
  envoi,
}: {
  nom: string;
  personne: FichePersonne | null;
  compte: Client | null;
  accesRetire: boolean;
  email: string | null;
  questionnaires: Questionnaire[];
  repas: RepasFiche[];
  paiements: Paiement[];
  envois: { semaine: string; envoye_le: string }[];
  offre: { prix: number; note: string | null } | null;
  tarifs: Tarifs;
  lundis: string[];
  lundiDefaut: string;
  aujourdhui: string;
  envoi: { semaine: string; menu: string }; // semaine du menu à envoyer et son menu en texte
}) {
  const supabase = createClient();
  const router = useRouter();
  const [p, setP] = useState(personneInitiale);
  const [nom, setNom] = useState(nomInitial);
  const [questionnaires, setQuestionnaires] = useState(questionnairesInitiaux);
  const [repas, setRepas] = useState(repasInitiaux);
  const [accesRetire, setAccesRetire] = useState(accesRetireInitial);
  const [message, setMessage] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [lundi, setLundi] = useState(lundiDefaut);
  const [edition, setEdition] = useState<null | { nom: string; telephone: string; adresse: string; complement: string; allergies: string; refus: string; note: string }>(null);
  const [origine, setOrigine] = useState("");
  useEffect(() => setOrigine(window.location.origin), []);

  const q = questionnaires[0] ?? null;
  const telephone = p?.telephone ?? compte?.telephone ?? q?.telephone ?? null;
  const telValide = numeroValide(telephone);
  const [telSaisi, setTelSaisi] = useState<string | null>(null);
  const wa = numeroWa(telephone);
  const palier = p?.palier ?? compte?.palier ?? q?.palier ?? null;
  const estClient = repas.length > 0 || !!p?.partenaire || !!compte || questionnaires.some((x) => x.suivi === "client");
  const [onglet, setOnglet] = useState<Onglet>("resume");
  const prenom = nom.split(/\s+/)[0];
  const lien = p?.jeton && origine ? `${origine}/ma-semaine/${p.jeton}` : null;
  const informer = (t: string) => {
    setMessage(t);
    window.setTimeout(() => setMessage((m) => (m === t ? "" : m)), 4000);
  };

  // Sa fiche de cuisine, créée si besoin (prospect venu du questionnaire), avec son lien.
  async function assurerFicheEtLien(): Promise<FichePersonne | null> {
    if (p?.jeton) return p;
    const jeton = nouveauJeton();
    if (p) {
      const { error } = await supabase.from("application_personnes").update({ jeton }).eq("id", p.id);
      if (error) return informer("Lien impossible pour l'instant, réessaie."), null;
      const maj = { ...p, jeton };
      setP(maj);
      return maj;
    }
    const utile = (v: unknown, max: number) => {
      const t = typeof v === "string" ? v.trim() : "";
      return t && !/^(—|-|rien|aucune?|non|ras|néant)$/i.test(t) ? t.slice(0, max) : null;
    };
    const champs = {
      telephone: telephone ? (telephone.startsWith("+") ? telephone : wa ? `+${wa}` : telephone) : null,
      palier,
      allergies: utile(q?.reponses?.allergies, 300),
      refus: utile(q?.reponses?.refuses, 300),
      note: utile(q?.reponses?.preferes, 190) ? `Aime : ${utile(q?.reponses?.preferes, 190)}` : null,
      client_id: compte?.id ?? null,
      jeton,
    };
    for (const essai of [nom, `${nom} (questionnaire)`]) {
      const { data, error } = await supabase.from("application_personnes").insert({ nom: essai.slice(0, 80), ...champs }).select("id").single<{ id: string }>();
      if (!error && data) {
        // On recharge sur la fiche créée : commandes, envois et réglages en dépendent.
        router.replace(`/admin/clients/fiche?f=${data.id}`);
        const cree: FichePersonne = {
          id: data.id,
          nom: essai,
          adresse: null,
          complement: null,
          livraison_offerte: false,
          remise: 0,
          zone: null,
          partenaire: false,
          vu_le: null,
          envoi_pause: false,
          created_at: new Date().toISOString(),
          ...champs,
        };
        setP(cree);
        setNom(essai);
        return cree;
      }
    }
    informer("Fiche impossible à créer, réessaie.");
    return null;
  }

  // Même message que « Envoi du menu », selon l'étape : client 1er message /
  // relance, prospect 1er message (avec son bilan) / relance.
  const [envoisFaits, setEnvoisFaits] = useState(envois);
  const etape = envoisFaits.filter((e) => e.semaine !== envoi.semaine).length;
  const connaitSonLien = !!p?.vu_le || repas.some((r) => r.date >= decalerDate(lundis[0], -7));
  const publicPropose: Public = estClient ? (etape === 0 && !connaitSonLien ? "client1" : "client2") : etape === 0 ? "prospect1" : "prospect2";
  const autrePublic: Public = ({ client1: "client2", client2: "client1", prospect1: "prospect2", prospect2: "prospect1" } as const)[publicPropose];
  const prospectTermine = !estClient && etape >= MESSAGES_PROSPECT;
  const dejaCetteSemaine = envoisFaits.some((e) => e.semaine === envoi.semaine);

  async function envoyerLien(choix: Public = publicPropose) {
    const f = await assurerFicheEtLien();
    if (!f?.jeton) return;
    const l = lire("c2b-envoi-lien-court") === "1" ? `https://chef2box.com/e/${f.jeton}` : `${window.location.origin}/ma-semaine/${f.jeton}`;
    const texte = composerMessage(lireModeles()[choix], {
      prenom,
      bilan: q?.calories ? { calories: q.calories, palier: q.palier } : null,
      semaine: new Date(`${envoi.semaine}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }),
      menu: envoi.menu,
      lien: l,
    });
    window.open(wa ? `https://wa.me/${wa}?text=${encodeURIComponent(texte)}` : `https://wa.me/?text=${encodeURIComponent(texte)}`, "_blank");
    // Noté comme dans « Envoi du menu » : l'étape avance, le prospect passe « contacté ».
    if (!dejaCetteSemaine) {
      supabase.from("application_envois").upsert({ personne_id: f.id, semaine: envoi.semaine }).then(() => {});
      setEnvoisFaits((prev) => [{ semaine: envoi.semaine, envoye_le: new Date().toISOString() }, ...prev]);
    }
    if (!estClient && questionnaires.length) {
      const ids = questionnaires.filter((x) => x.suivi !== "client").map((x) => x.id);
      if (ids.length) supabase.from("application_questionnaires").update({ suivi: "contacte" }).in("id", ids).then(() => {});
      setQuestionnaires((prev) => prev.map((x) => (x.suivi === "client" ? x : { ...x, suivi: "contacte" })));
    }
  }
  async function copierLien() {
    const f = await assurerFicheEtLien();
    if (!f?.jeton) return;
    const l = `${window.location.origin}/ma-semaine/${f.jeton}`;
    navigator.clipboard?.writeText(l).then(
      () => informer("Lien copié ✓"),
      () => window.prompt("Copie le lien :", l)
    );
  }
  async function voirEspace() {
    const f = await assurerFicheEtLien();
    if (f?.jeton) window.location.href = `/ma-semaine/${f.jeton}`;
  }

  // Corriger le numéro WhatsApp : sa fiche, ses questionnaires et ses repas à venir.
  async function corrigerNumero() {
    if (telSaisi == null) return;
    const brut = telSaisi.trim();
    const chiffres = brut.replace(/\D/g, "").replace(/^00/, "");
    const nouveau = brut.startsWith("+") || brut.startsWith("00") ? `+${chiffres}` : /^0[5-7]\d{8}$/.test(chiffres) ? `+212${chiffres.slice(1)}` : `+${chiffres}`;
    if (!numeroValide(nouveau)) return informer("Numéro incomplet : mets l'indicatif et le numéro complet (ex. +33 6 12 34 56 78).");
    setEnCours(true);
    try {
      const ids = questionnaires.map((x) => x.id);
      const [a, b, c] = await Promise.all([
        p ? supabase.from("application_personnes").update({ telephone: nouveau }).eq("id", p.id) : Promise.resolve({ error: null }),
        ids.length ? supabase.from("application_questionnaires").update({ telephone: nouveau }).in("id", ids) : Promise.resolve({ error: null }),
        p
          ? supabase.from("application_cuisine_extras").update({ telephone: nouveau }).ilike("nom", p.nom.replace(/[%_\\]/g, "\\$&")).gte("date", aujourdhui)
          : Promise.resolve({ error: null }),
      ]);
      if (a.error || b.error || c.error) return informer("Numéro non enregistré, réessaie.");
      if (p) setP({ ...p, telephone: nouveau });
      setQuestionnaires((prev) => prev.map((x) => ({ ...x, telephone: nouveau })));
      setTelSaisi(null);
      informer("Numéro corrigé ✓");
    } finally {
      setEnCours(false);
    }
  }

  // Ligne « WhatsApp » avec alerte si le numéro est incomplet, et correction sur place.
  const champTelephone = () =>
    telSaisi != null ? (
      <div className="space-y-1.5 border-b border-c2b-cream-2 py-2">
        <p className="text-sm text-c2b-muted">WhatsApp, avec l&apos;indicatif (+212, +33…)</p>
        <input value={telSaisi} onChange={(e) => setTelSaisi(e.target.value)} inputMode="tel" autoFocus placeholder="+33 6 12 34 56 78" className="champ py-2 text-sm" />
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => setTelSaisi(null)} className="btn-secondary py-2 text-xs">
            Annuler
          </button>
          <button onClick={corrigerNumero} disabled={enCours} className="btn-primary py-2 text-xs">
            Enregistrer
          </button>
        </div>
      </div>
    ) : (
      <div className="flex items-start justify-between gap-4 border-b border-c2b-cream-2 py-2">
        <dt className="shrink-0 text-sm text-c2b-muted">WhatsApp</dt>
        <dd className="min-w-0 text-right text-sm font-semibold">
          <span className={telValide ? "text-c2b-text" : "text-red-700"}>{telephone || "Aucun numéro"}</span>
          {!telValide && <span className="block text-xs font-bold text-red-700">⚠️ Numéro incomplet</span>}
          <button onClick={() => setTelSaisi(telephone ?? "+")} className="block w-full text-right text-xs font-bold text-c2b-gold underline">
            ✏️ Corriger
          </button>
        </dd>
      </div>
    );

  // ----- Fiche -----
  async function majFiche(maj: Partial<FichePersonne>, texte = "Enregistré ✓") {
    if (!p) return false;
    const avant = p;
    setP({ ...p, ...maj });
    const { error } = await supabase.from("application_personnes").update(maj).eq("id", p.id);
    if (error) {
      setP(avant);
      informer("Pas enregistré, réessaie.");
      return false;
    }
    informer(texte);
    return true;
  }

  async function changerPalier(nouveau: Palier) {
    if (compte && !p) {
      const { error } = await supabase.from("application_clients").update({ palier: nouveau }).eq("id", compte.id);
      return informer(error ? "Pas enregistré, réessaie." : "Palier changé ✓");
    }
    if (!p) return;
    if (!(await majFiche({ palier: nouveau }, "Palier changé ✓"))) return;
    // Ses repas à partir de cette semaine prennent le nouveau palier.
    await supabase.from("application_cuisine_extras").update({ palier: nouveau }).ilike("nom", p.nom.replace(/[%_\\]/g, "\\$&")).gte("date", lundis[0]);
    if (compte) await supabase.from("application_clients").update({ palier: nouveau }).eq("id", compte.id);
  }

  async function enregistrerEdition() {
    if (!p || !edition) return;
    const nouveauNom = edition.nom.trim();
    if (!nouveauNom) return informer("Le nom ne peut pas être vide.");
    const tel = edition.telephone.trim();
    if (tel && numeroWa(tel).length < 9) return informer("Numéro trop court : mets le numéro complet avec l'indicatif (+212…).");
    setEnCours(true);
    try {
      if (nouveauNom !== p.nom.trim()) {
        const { error } = await supabase.rpc("application_renommer_personne", { p_ancien: p.nom, p_nouveau: nouveauNom.slice(0, 80) });
        if (error) return informer(/existe/.test(error.message) ? "Ce nom existe déjà : ajoute une initiale." : "Changement de nom impossible, réessaie.");
        setNom(nouveauNom);
      }
      const maj = {
        nom: nouveauNom,
        telephone: tel ? (tel.startsWith("+") ? `+${tel.replace(/\D/g, "")}` : `+${numeroWa(tel)}`) : null,
        adresse: edition.adresse.trim() || null,
        complement: edition.complement.trim() || null,
        allergies: edition.allergies.trim() || null,
        refus: edition.refus.trim() || null,
        note: edition.note.trim() || null,
      };
      const { nom: _n, ...colonnes } = maj;
      void _n;
      const { error } = await supabase.from("application_personnes").update(colonnes).eq("id", p.id);
      if (error) return informer("Pas enregistré, réessaie.");
      // Ses repas à venir suivent (livreur, cuisine).
      await supabase
        .from("application_cuisine_extras")
        .update({ telephone: colonnes.telephone, adresse: colonnes.adresse, allergies: colonnes.allergies, refus: colonnes.refus, note: colonnes.note })
        .ilike("nom", nouveauNom.replace(/[%_\\]/g, "\\$&"))
        .gte("date", aujourdhui);
      setP({ ...p, ...maj });
      setEdition(null);
      informer("Fiche enregistrée ✓");
    } finally {
      setEnCours(false);
    }
  }

  // ----- Suivi prospect -----
  async function changerSuivi(suivi: SuiviProspect) {
    const ids = questionnaires.map((x) => x.id);
    if (!ids.length) return informer("Pas de questionnaire pour cette personne.");
    if (suivi === "client" && !window.confirm(`${nom} a déjà été client(e) ? Il/elle passe dans les clients.`)) return;
    const { error } = await supabase.from("application_questionnaires").update({ suivi, suivi_le: new Date().toISOString() }).in("id", ids);
    if (error) return informer("Pas enregistré, réessaie.");
    setQuestionnaires((prev) => prev.map((x) => ({ ...x, suivi })));
    informer(suivi === "client" ? "Passé(e) en client ✓" : "Suivi mis à jour ✓");
  }

  // ----- Commandes de la semaine -----
  const jours = [0, 1, 2, 3, 4].map((i) => decalerDate(lundi, i));
  const repasSemaine = repas.filter((r) => r.date >= jours[0] && r.date <= jours[4]);
  const repasDe = (date: string, service: "dejeuner" | "diner") => repasSemaine.find((r) => r.date === date && r.service === service);
  const prix = prixDemande(
    repasSemaine.flatMap((r) => (r.quantite > 0 ? [{ date: r.date, service: r.service }] : [])),
    p?.zone ?? null,
    tarifs,
    { remise: p?.remise ?? 0, livraisonOfferte: !!p?.livraison_offerte }
  );

  async function changerRepas(date: string, service: "dejeuner" | "diner", quantite: number) {
    if (enCours) return;
    const existant = repasDe(date, service);
    const q2 = Math.max(0, Math.min(100, quantite));
    const jour = new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", timeZone: "UTC" });
    setEnCours(true);
    try {
      if (existant && q2 === 0) {
        if (!p?.partenaire && !window.confirm(`Enlever le repas du ${service === "dejeuner" ? "midi" : "soir"} (${jour}) ?`)) return;
        const { error } = await supabase.from(existant.appli ? "application_commandes" : "application_cuisine_extras").delete().eq("id", existant.id);
        if (error) return informer("Modification impossible, réessaie.");
        setRepas((prev) => prev.filter((r) => r.id !== existant.id));
      } else if (existant) {
        const { error } = await supabase.from("application_cuisine_extras").update({ quantite: q2 }).eq("id", existant.id);
        if (error) return informer("Modification impossible, réessaie.");
        setRepas((prev) => prev.map((r) => (r.id === existant.id ? { ...r, quantite: q2 } : r)));
      } else if (q2 > 0 && compte && !p) {
        const { data, error } = await supabase
          .from("application_commandes")
          .upsert({ client_id: compte.id, date_livraison: date, repas_type: service, statut: "confirmee" }, { onConflict: "client_id,date_livraison,repas_type" })
          .select("id")
          .single<{ id: string }>();
        if (error || !data) return informer("Modification impossible, réessaie.");
        setRepas((prev) => [...prev, { id: data.id, date, service, quantite: 1, appli: true }]);
      } else if (q2 > 0) {
        if (!p) return informer("Crée d'abord sa fiche avec le bouton « Son lien ».");
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
            telephone: p.telephone,
            adresse: p.adresse,
            ...(p.partenaire ? { quantite: q2 } : {}),
          })
          .select("id")
          .single<{ id: string }>();
        if (error || !data) return informer("Modification impossible, réessaie.");
        setRepas((prev) => [...prev, { id: data.id, date, service, quantite: p.partenaire ? q2 : 1 }]);
      }
    } finally {
      setEnCours(false);
    }
  }

  async function retirerSemaine() {
    if (!repasSemaine.length) return;
    if (!window.confirm(`Retirer ${nom} de la semaine du ${jourCourt(lundi)} ?\n\nSes ${repasSemaine.length} repas de cette semaine seront supprimés. Sa fiche et le reste restent.`)) return;
    const extras = repasSemaine.filter((r) => !r.appli).map((r) => r.id);
    const commandes = repasSemaine.filter((r) => r.appli).map((r) => r.id);
    const [a, b] = await Promise.all([
      extras.length ? supabase.from("application_cuisine_extras").delete().in("id", extras) : Promise.resolve({ error: null }),
      commandes.length ? supabase.from("application_commandes").delete().in("id", commandes) : Promise.resolve({ error: null }),
    ]);
    if (a.error || b.error) return informer("Suppression impossible, réessaie.");
    setRepas((prev) => prev.filter((r) => !repasSemaine.some((x) => x.id === r.id)));
    informer("Retiré(e) de la semaine ✓");
  }

  // ----- Compte et suppression -----
  async function retirerAcces() {
    if (!compte) return;
    if (!window.confirm(`Retirer l'accès à l'appli de ${nom} ?\n\nIl ne pourra plus se connecter. Ses données sont gardées.`)) return;
    const r = await fetch("/api/admin/clients", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: compte.id }) });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) return informer(res.erreur ?? "Impossible, réessaie.");
    setAccesRetire(true);
    informer("Accès retiré ✓");
  }
  async function effacerTout() {
    if (!p) return;
    if (!window.confirm(`Effacer ${nom} de TOUT ?\n\nSa fiche, tous ses repas (passés et à venir), ses paiements${p.client_id ? " et son compte appli" : ""} seront supprimés. C'est définitif.`)) return;
    const r = await fetch("/api/admin/clients", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personne: p.id }) });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) return informer(res.erreur ?? "Impossible, réessaie.");
    router.replace("/admin/clients");
  }

  // ----- Calculs d'affichage -----
  const totalRepas = repas.reduce((t, r) => t + r.quantite, 0);
  const aPayer = paiements.reduce((t, x) => t + Math.max(0, x.montant - x.recu), 0);
  const dernier = repas.reduce((d, r) => (r.date <= aujourdhui && r.date > d ? r.date : d), "");
  const semaines = new Map<string, number>();
  for (const r of repas) {
    const l = decalerDate(r.date, -((new Date(`${r.date}T12:00:00Z`).getUTCDay() + 6) % 7));
    semaines.set(l, (semaines.get(l) ?? 0) + r.quantite);
  }
  const historique = [...semaines.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  const onglets: [Onglet, string][] = estClient
    ? [
        ["resume", "Résumé"],
        ["commandes", "Commandes"],
        ["paiements", "Paiements"],
        ["envois", "Envois"],
        ["reglages", "Réglages"],
      ]
    : [
        ["resume", "Bilan"],
        ["commandes", "Commandes"],
        ["envois", "Messages"],
        ["reglages", "Réglages"],
      ];
  const suivi = q?.suivi ?? "a_contacter";

  const ligne = (libelle: string, valeur: React.ReactNode) =>
    valeur ? (
      <div className="flex items-start justify-between gap-4 border-b border-c2b-cream-2 py-2 last:border-0">
        <dt className="shrink-0 text-sm text-c2b-muted">{libelle}</dt>
        <dd className="min-w-0 break-words text-right text-sm font-semibold text-c2b-text">{valeur}</dd>
      </div>
    ) : null;
  const carte = (titre: string, contenu: React.ReactNode) => (
    <section className="rounded-2xl bg-white p-4">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[2.5px] text-c2b-gold">{titre}</h2>
      {contenu}
    </section>
  );
  const tuile = (n: React.ReactNode, l: string, ton = "text-c2b-green") => (
    <div className="rounded-2xl bg-white p-3.5">
      <p className={`font-serif text-[26px] leading-none ${ton}`}>{n}</p>
      <p className="mt-1 text-xs text-c2b-muted">{l}</p>
    </div>
  );

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
      <Link href="/admin/clients" className="inline-flex items-center gap-1 text-sm font-bold text-c2b-green">
        <ChevronLeft size={17} /> Clients
      </Link>

      <header className="flex items-center gap-3">
        <span
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-extrabold ${
            estClient ? "bg-c2b-green text-c2b-cream" : "bg-c2b-cream-2 text-c2b-gold"
          }`}
        >
          {nom
            .split(/\s+/)
            .map((m) => m[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="titre truncate text-[28px]">{nom}</h1>
          <p className="text-[13px] text-c2b-muted">
            {p?.partenaire ? "Partenaire" : estClient ? "Client" : "Prospect"}
            {palier && ` · ${palier}`}
            {dernier && ` · dernier repas le ${jourCourt(dernier)}`}
            {!estClient && q && ` · ${SUIVIS.find((s) => s.cle === suivi)?.libelle ?? ""}`}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-2">
        <a
          href={wa ? `https://wa.me/${wa}` : undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (!wa || !telValide) {
              e.preventDefault();
              setTelSaisi(telephone ?? "+");
              setOnglet("resume");
              informer("Numéro WhatsApp incomplet : corrige-le ci-dessous.");
            }
          }}
          className="flex flex-col items-center gap-1 rounded-2xl bg-[#25D366] py-2.5 text-[11px] font-bold text-white"
        >
          <MessageCircle size={19} /> WhatsApp
        </a>
        <button onClick={() => envoyerLien()} className="flex flex-col items-center gap-1 rounded-2xl bg-white py-2.5 text-[11px] font-bold text-c2b-green">
          <Link2 size={19} /> {estClient ? "Son lien" : "Bilan + lien"}
        </button>
        <button onClick={voirEspace} className="flex flex-col items-center gap-1 rounded-2xl bg-white py-2.5 text-[11px] font-bold text-c2b-green">
          <Eye size={19} /> Son espace
        </button>
        <button onClick={copierLien} className="flex flex-col items-center gap-1 rounded-2xl bg-white py-2.5 text-[11px] font-bold text-c2b-green">
          <Copy size={19} /> Copier
        </button>
      </div>
      {!telValide && telSaisi == null && (
        <button
          onClick={() => {
            setTelSaisi(telephone ?? "+");
            setOnglet("resume");
          }}
          className="w-full rounded-xl border border-red-600/30 bg-red-600/[0.06] px-4 py-2.5 text-left text-sm font-bold text-red-700"
        >
          ⚠️ Numéro WhatsApp {telephone ? `incomplet (${telephone})` : "manquant"} : touche ici pour le corriger
        </button>
      )}
      {message && <p className="rounded-xl bg-c2b-green px-4 py-2.5 text-center text-sm font-bold text-c2b-cream">{message}</p>}

      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-c2b-cream-2 px-4">
        {onglets.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setOnglet(k)}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-bold transition ${
              onglet === k ? "border-c2b-gold text-c2b-green" : "border-transparent text-c2b-muted"
            }`}
          >
            {l}
          </button>
        ))}
      </nav>

      {/* ---------- Résumé / Bilan ---------- */}
      {onglet === "resume" && estClient && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {tuile(totalRepas, "repas depuis le début")}
            {tuile(aPayer > 0 ? dh(aPayer) : "0 DH", aPayer > 0 ? "à payer" : "tout est payé", aPayer > 0 ? "text-red-700" : "text-c2b-green")}
          </div>
          {carte(
            "Sa fiche",
            <dl>
              {ligne("Palier", palier ? PALIERS_FICHE.find((x) => x.cle === palier)?.libelle ?? palier : "—")}
              {champTelephone()}
              {ligne("Email", email)}
              {ligne(
                "Adresse",
                p?.adresse || p?.complement ? (
                  <>
                    {p?.adresse}
                    {p?.complement && (
                      <a href={p.complement} target="_blank" rel="noopener noreferrer" className="ml-1 text-c2b-gold underline">
                        Maps
                      </a>
                    )}
                  </>
                ) : null
              )}
              {ligne("Zone", p?.zone ? ZONES.find((z) => z.cle === p.zone)?.libelle : null)}
              {ligne(
                "Prix",
                [p?.remise ? (p.remise >= 100 ? "🎁 Offert" : `Remise ${p.remise} %`) : null, p?.livraison_offerte ? "Livraison offerte" : null, offre ? `Prix fixe ${dh(offre.prix)} / sem.` : null]
                  .filter(Boolean)
                  .join(" · ") || "Tarif normal"
              )}
              {ligne("Allergies", p?.allergies)}
              {ligne("N'aime pas", p?.refus)}
              {ligne("Note", p?.note)}
              {ligne("Appli", compte ? (accesRetire ? "Accès retiré" : "A un compte") : null)}
            </dl>
          )}
          {q && carte("Son bilan", <p className="text-sm">{q.calories ? `${q.calories} kcal · ${q.proteines} g P · ${q.glucides} g G · ${q.lipides} g L` : "Questionnaire sans calcul"} · fait le {jourCourt(q.created_at)}</p>)}
        </div>
      )}

      {onglet === "resume" && !estClient && (
        <div className="space-y-3">
          {q ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {tuile(q.calories ?? "—", "kcal par jour")}
                {tuile(q.palier ?? "—", "palier conseillé")}
              </div>
              {carte(
                "Son questionnaire",
                <dl>
                  {ligne("Fait le", jourCourt(q.created_at))}
                  {champTelephone()}
                  {ligne("Email", q.email)}
                  {q.calories ? ligne("Macros", `${q.proteines} g P · ${q.glucides} g G · ${q.lipides} g L`) : null}
                  {Object.entries(q.reponses ?? {})
                    .filter(([k, v]) => k in QUESTIONS && v != null && String(v).trim() !== "")
                    .map(([k, v]) => (
                      <div key={k}>{ligne(QUESTIONS[k] ?? k, String(v).slice(0, 200))}</div>
                    ))}
                </dl>
              )}
              {questionnaires.length > 1 && <p className="text-xs text-c2b-muted">A fait le questionnaire {questionnaires.length} fois : le plus récent est affiché.</p>}
            </>
          ) : (
            carte("Prospect", <p className="text-sm text-c2b-muted">Fiche créée sans questionnaire (lien envoyé, pas encore commandé).</p>)
          )}
          {carte(
            "Où il en est",
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                {SUIVIS.map((s) => (
                  <button
                    key={s.cle}
                    onClick={() => changerSuivi(s.cle)}
                    className={`rounded-full py-2 text-xs font-bold ${suivi === s.cle ? "bg-c2b-green text-c2b-cream" : "border border-c2b-green/15 text-c2b-green"}`}
                  >
                    {s.libelle}
                  </button>
                ))}
              </div>
              <button onClick={() => changerSuivi("client")} className="btn-primary w-full py-2.5 text-sm">
                🤝 Déjà client ? Passer en client
              </button>
              {q && (
                <Link href={`/admin/clients?detail=questionnaires&nom=${encodeURIComponent(q.nom)}`} className="btn-secondary w-full py-2.5 text-sm">
                  Créer son compte appli
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------- Commandes ---------- */}
      {onglet === "commandes" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {lundis.map((l, i) => (
              <button
                key={l}
                onClick={() => setLundi(l)}
                className={`rounded-full py-2 text-xs font-bold ${l === lundi ? "bg-c2b-green text-c2b-cream" : "border border-c2b-green/15 bg-white text-c2b-green"}`}
              >
                {i === 0 ? "Cette semaine" : "Semaine prochaine"} · {jourCourt(l)}
              </button>
            ))}
          </div>
          {carte(
            p?.partenaire ? "Ses boîtes (touche + / −)" : "Ses repas (touche pour ajouter ou enlever)",
            <div className="space-y-3">
              <div className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] items-center gap-1.5 text-center text-xs">
                <span />
                {jours.map((d, i) => (
                  <span key={d} className="font-bold text-c2b-muted">
                    {JOURS[i]}
                    <br />
                    <span className="font-normal">{d.slice(8)}</span>
                  </span>
                ))}
                {(["dejeuner", "diner"] as const).map((s) => (
                  <div key={s} className="contents">
                    <span className="pr-1 text-left font-bold text-c2b-green">{s === "dejeuner" ? "Midi" : "Soir"}</span>
                    {jours.map((d) => {
                      const r = repasDe(d, s);
                      if (p?.partenaire)
                        return (
                          <div key={d} className="flex flex-col items-center gap-0.5 rounded-lg bg-c2b-cream py-1">
                            <button onClick={() => changerRepas(d, s, (r?.quantite ?? 0) + 1)} aria-label="Plus" className="text-c2b-green">
                              <Plus size={14} />
                            </button>
                            <span className="font-bold">{r?.quantite ?? 0}</span>
                            <button onClick={() => changerRepas(d, s, (r?.quantite ?? 0) - 1)} aria-label="Moins" className="text-c2b-green">
                              <Minus size={14} />
                            </button>
                          </div>
                        );
                      return (
                        <button
                          key={d}
                          onClick={() => changerRepas(d, s, r ? 0 : 1)}
                          disabled={enCours}
                          className={`h-10 rounded-lg text-[11px] font-bold transition ${r ? "bg-c2b-green text-c2b-cream" : "bg-c2b-cream text-c2b-muted"}`}
                          aria-pressed={!!r}
                        >
                          {r ? "✓" : "—"}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              {!p?.partenaire && prix.jours > 0 && (
                <div className="rounded-xl bg-c2b-cream px-3 py-2.5 text-sm">
                  <p className="flex justify-between">
                    <span>
                      {prix.jours1 + prix.jours2 * 2} repas{prix.remise ? ` · remise ${prix.remise} %` : ""}
                    </span>
                    <span className="font-bold">{dh(prix.prixRepas)}</span>
                  </p>
                  <p className="flex justify-between text-c2b-muted">
                    <span>Livraison</span>
                    <span>{prix.prixLivraison == null ? (p?.zone === "devis" ? "Sur devis" : "Zone à choisir") : prix.prixLivraison === 0 ? "Offerte" : dh(prix.prixLivraison)}</span>
                  </p>
                  {prix.total != null && (
                    <p className="mt-1 flex justify-between border-t border-c2b-cream-2 pt-1 font-extrabold text-c2b-green">
                      <span>Total semaine</span>
                      <span>{dh(prix.total)}</span>
                    </p>
                  )}
                </div>
              )}
              {repasSemaine.length > 0 && (
                <button onClick={retirerSemaine} className="w-full rounded-full border border-red-600/30 py-2 text-xs font-bold text-red-700">
                  Retirer de cette semaine
                </button>
              )}
            </div>
          )}
          {(p || compte) &&
            carte(
              "Palier, zone, prix",
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-1.5">
                  {PALIERS_FICHE.map((x) => (
                    <button
                      key={x.cle}
                      onClick={() => changerPalier(x.cle)}
                      className={`rounded-full py-2 text-[11px] font-bold ${palier === x.cle ? "bg-c2b-green text-c2b-cream" : "border border-c2b-green/15 text-c2b-green"}`}
                    >
                      {x.libelle}
                    </button>
                  ))}
                </div>
                {p && (
                  <>
                    <label className="block text-xs font-bold text-c2b-muted">
                      Zone de livraison
                      <select
                        value={p.zone ?? ""}
                        onChange={(e) => majFiche({ zone: (e.target.value || null) as Zone | null }, "Zone changée ✓")}
                        className="champ mt-1 py-2 text-sm"
                      >
                        <option value="">Pas encore choisie</option>
                        {ZONES.map((z) => (
                          <option key={z.cle} value={z.cle}>
                            {z.libelle}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div>
                      <p className="mb-1 text-xs font-bold text-c2b-muted">Remise sur les repas</p>
                      <div className="grid grid-cols-6 gap-1">
                        {REMISES.map((r) => (
                          <button
                            key={r}
                            onClick={() => majFiche({ remise: r }, r >= 100 ? "Offert 🎁" : "Remise changée ✓")}
                            className={`rounded-full py-1.5 text-[11px] font-bold ${(p.remise ?? 0) === r ? "bg-c2b-green text-c2b-cream" : "border border-c2b-green/15 text-c2b-green"}`}
                          >
                            {r >= 100 ? "🎁" : `${r}%`}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center justify-between gap-3 text-sm font-semibold text-c2b-green">
                      Livraison offerte (toujours)
                      <input
                        type="checkbox"
                        checked={!!p.livraison_offerte}
                        onChange={(e) => majFiche({ livraison_offerte: e.target.checked })}
                        className="h-5 w-5 accent-[#1c2e1e]"
                      />
                    </label>
                  </>
                )}
              </div>
            )}
          {carte(
            "Ses semaines",
            historique.length ? (
              <div className="divide-y divide-c2b-cream-2 text-sm">
                {historique.map(([l, n]) => (
                  <p key={l} className="flex justify-between py-1.5">
                    <span>Semaine du {jourCourt(l)}</span>
                    <span className="font-bold">
                      {n} repas
                    </span>
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-c2b-muted">Pas encore de repas.</p>
            )
          )}
        </div>
      )}

      {/* ---------- Paiements ---------- */}
      {onglet === "paiements" && (
        <div className="space-y-3">
          {carte(
            "Ses paiements",
            paiements.length ? (
              <div className="divide-y divide-c2b-cream-2 text-sm">
                {paiements.map((x) => {
                  const reste = x.montant - x.recu;
                  return (
                    <div key={x.id} className="flex items-start justify-between gap-3 py-2">
                      <span>
                        {x.semaine ? `Semaine du ${jourCourt(x.semaine)}` : x.mois ? `Mois de ${new Date(`${x.mois}T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" })}` : "—"}
                        <span className="block text-xs text-c2b-muted">
                          {dh(x.montant)}
                          {x.moyen && ` · ${x.moyen}`}
                          {x.paye_le && ` · payé le ${jourCourt(x.paye_le)}`}
                        </span>
                      </span>
                      <span className={`shrink-0 font-bold ${reste > 0 ? "text-red-700" : "text-emerald-700"}`}>{reste > 0 ? `${dh(reste)} à payer` : "Payé"}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-c2b-muted">Aucun paiement enregistré.</p>
            )
          )}
          <Link href="/admin/paiements" className="btn-secondary w-full py-2.5 text-sm">
            Ouvrir les paiements de la semaine
          </Link>
        </div>
      )}

      {/* ---------- Envois / Messages ---------- */}
      {onglet === "envois" && (
        <div className="space-y-3">
          {carte(
            estClient ? "Menus envoyés" : "Messages envoyés",
            <div className="space-y-2 text-sm">
              <p>{p?.vu_le ? `👀 A ouvert son lien le ${jourCourt(p.vu_le)}` : "N'a pas encore ouvert son lien."}</p>
              {envoisFaits.length ? (
                <div className="divide-y divide-c2b-cream-2">
                  {envoisFaits.map((e) => (
                    <p key={e.semaine} className="flex justify-between py-1.5">
                      <span>Menu de la semaine du {jourCourt(e.semaine)}</span>
                      <span className="text-c2b-muted">envoyé le {jourCourt(e.envoye_le)}</span>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-c2b-muted">Aucun envoi pour l&apos;instant.</p>
              )}
            </div>
          )}
          {prospectTermine && (
            <p className="rounded-xl bg-c2b-gold/15 px-3 py-2 text-sm font-bold text-c2b-green">
              2 messages déjà envoyés : écris-lui plutôt un message perso (bouton WhatsApp en haut).
            </p>
          )}
          <p className="text-xs text-c2b-muted">
            Message proposé : <strong className="text-c2b-green">{LIBELLES[publicPropose]}</strong>
            {dejaCetteSemaine && " · déjà envoyé cette semaine"} (modèles modifiables dans « Envoi du menu »)
          </p>
          <button onClick={() => envoyerLien()} className="w-full rounded-full bg-[#25D366] py-2.5 text-sm font-bold text-white">
            {dejaCetteSemaine ? "Renvoyer" : "Envoyer"} : {LIBELLES[publicPropose]}
          </button>
          <button onClick={() => envoyerLien(autrePublic)} className="block w-full text-center text-xs font-bold text-c2b-muted underline">
            Envoyer plutôt : {LIBELLES[autrePublic]}
          </button>
          {p && (
            <button
              onClick={() => majFiche({ envoi_pause: !p.envoi_pause }, p.envoi_pause ? "Il recevra à nouveau le menu ✓" : "Il ne recevra plus le menu ✓")}
              className="btn-secondary w-full py-2.5 text-sm"
            >
              {p.envoi_pause ? "🔔 Lui renvoyer le menu chaque semaine" : "🔕 Ne plus lui envoyer le menu"}
            </button>
          )}
          <Link href="/admin/envoi" className="block text-center text-sm font-bold text-c2b-green underline">
            Ouvrir l&apos;envoi du menu à tout le monde
          </Link>
        </div>
      )}

      {/* ---------- Réglages ---------- */}
      {onglet === "reglages" && (
        <div className="space-y-3">
          {p ? (
            carte(
              "Sa fiche",
              edition ? (
                <div className="space-y-2">
                  {(
                    [
                      ["nom", "Nom (ajoute l'initiale si doublon)"],
                      ["telephone", "WhatsApp (+212…)"],
                      ["adresse", "Adresse"],
                      ["complement", "Lien Google Maps (facultatif)"],
                      ["allergies", "Allergies"],
                      ["refus", "N'aime pas"],
                      ["note", "Note pour la cuisine"],
                    ] as const
                  ).map(([k, l]) => (
                    <label key={k} className="block text-xs font-bold text-c2b-muted">
                      {l}
                      <input
                        value={edition[k]}
                        onChange={(e) => setEdition({ ...edition, [k]: e.target.value })}
                        inputMode={k === "telephone" ? "tel" : undefined}
                        className="champ mt-1 py-2 text-sm"
                      />
                    </label>
                  ))}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button onClick={() => setEdition(null)} className="btn-secondary py-2.5 text-sm">
                      Annuler
                    </button>
                    <button onClick={enregistrerEdition} disabled={enCours} className="btn-primary py-2.5 text-sm">
                      Enregistrer
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() =>
                    setEdition({
                      nom: p.nom,
                      telephone: p.telephone ?? "",
                      adresse: p.adresse ?? "",
                      complement: p.complement ?? "",
                      allergies: p.allergies ?? "",
                      refus: p.refus ?? "",
                      note: p.note ?? "",
                    })
                  }
                  className="btn-secondary w-full py-2.5 text-sm"
                >
                  ✏️ Modifier nom, numéro, adresse, allergies
                </button>
              )
            )
          ) : (
            carte(
              "Sa fiche",
              <div className="space-y-2 text-sm">
                <p className="text-c2b-muted">Pas encore de fiche de cuisine. Elle se crée toute seule quand tu lui envoies son lien.</p>
                <button onClick={assurerFicheEtLien} className="btn-primary w-full py-2.5 text-sm">
                  Créer sa fiche maintenant
                </button>
              </div>
            )
          )}
          {carte(
            "Appli Chef2Box",
            compte ? (
              <div className="space-y-2 text-sm">
                <p>{accesRetire ? "Accès retiré : il ne peut plus se connecter (données gardées)." : `Compte actif${email ? ` · ${email}` : ""}.`}</p>
                {accesRetire ? (
                  <Link href={`/admin/clients?detail=appli&nom=${encodeURIComponent(nom)}`} className="btn-secondary w-full py-2.5 text-sm">
                    Remettre l&apos;accès
                  </Link>
                ) : (
                  <button onClick={retirerAcces} className="w-full rounded-full border border-red-600/30 py-2.5 text-sm font-bold text-red-700">
                    Retirer l&apos;accès à l&apos;appli
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-c2b-muted">Pas de compte sur l&apos;appli.</p>
                <Link
                  href={q ? `/admin/clients?detail=questionnaires&nom=${encodeURIComponent(q.nom)}` : "/admin/clients?detail=appli"}
                  className="btn-secondary w-full py-2.5 text-sm"
                >
                  Créer son compte appli
                </Link>
              </div>
            )
          )}
          {p &&
            carte(
              "Supprimer",
              <div className="space-y-2">
                <p className="text-xs text-c2b-muted">Pour une seule semaine : onglet Commandes, « Retirer de cette semaine ».</p>
                <button onClick={effacerTout} className="w-full rounded-full border border-red-600/30 py-2.5 text-sm font-bold text-red-700">
                  Effacer de partout (fiche, repas, paiements)
                </button>
              </div>
            )}
          <Link href={`/admin/clients?detail=semaine&nom=${encodeURIComponent(nom)}`} className="block text-center text-xs font-bold text-c2b-muted underline">
            Ouvrir dans l&apos;ancienne vue
          </Link>
        </div>
      )}
    </main>
  );
}
