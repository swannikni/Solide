"use client";

import { useState } from "react";
import { Plus, X, KeyRound, Pencil, Copy, Check, MessageCircle, Inbox, Crown, Search, ChevronDown, Phone, Smartphone, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { nouveauJeton } from "@/lib/ma-semaine";
import { decalerDate } from "@/lib/dates";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import { FormulaireProfil, depuisProfil, versProfil, PROFIL_VIDE, type ProfilSaisi } from "@/components/FormulaireProfil";
import {
  PALIERS,
  calculerObjectifs,
  profilComplet,
  type Profil,
} from "@/lib/objectifs";
import type { Client, Palier, Questionnaire, SuiviProspect } from "@/lib/types";

type Fiche = {
  id?: string;
  questionnaireId?: string;
  nom: string;
  email: string;
  telephone: string;
  indicatif: string;
  palier: Palier | "";
  calories: string;
  proteines: string;
  glucides: string;
  lipides: string;
  profil: ProfilSaisi;
};

type Acces = { nom: string; email: string; motDePasse: string; telephone: string | null };

const FICHE_VIDE: Fiche = {
  nom: "",
  email: "",
  telephone: "",
  indicatif: "+212",
  palier: "",
  calories: "",
  proteines: "",
  glucides: "",
  lipides: "",
  profil: { ...PROFIL_VIDE },
};

const INDICATIFS = [
  { code: "+212", pays: "🇲🇦 Maroc" },
  { code: "+33", pays: "🇫🇷 France" },
  { code: "+32", pays: "🇧🇪 Belgique" },
  { code: "+41", pays: "🇨🇭 Suisse" },
  { code: "+34", pays: "🇪🇸 Espagne" },
  { code: "+44", pays: "🇬🇧 Royaume-Uni" },
  { code: "+1", pays: "🇺🇸 États-Unis / Canada" },
  { code: "+971", pays: "🇦🇪 Émirats" },
];

// Numéro enregistré au format international : "+33629021231".
function numeroInternational(indicatif: string, saisie: string): string | null {
  const brut = saisie.trim();
  if (!brut) return null;
  if (brut.startsWith("+")) return "+" + brut.replace(/\D/g, "");
  const chiffres = brut.replace(/\D/g, "");
  if (chiffres.startsWith("00")) return "+" + chiffres.slice(2);
  return indicatif + chiffres.replace(/^0/, "");
}

// Sépare un numéro enregistré en (indicatif connu, reste) pour l'édition.
function decouperNumero(telephone: string | null): { indicatif: string; telephone: string } {
  const t = telephone ?? "";
  const connu = [...INDICATIFS].sort((a, b) => b.code.length - a.code.length).find((i) => t.startsWith(i.code));
  return connu ? { indicatif: connu.code, telephone: "0" + t.slice(connu.code.length) } : { indicatif: "+212", telephone: t };
}

// Pour wa.me : chiffres seuls, indicatif compris. Les anciens numéros
// enregistrés sans indicatif ("06...") sont supposés marocains.
function numeroWhatsApp(telephone: string | null) {
  const t = (telephone ?? "").trim();
  if (t.startsWith("+")) return t.replace(/\D/g, "");
  const chiffres = t.replace(/\D/g, "");
  if (chiffres.startsWith("00")) return chiffres.slice(2);
  if (/^0[5-7]\d{8}$/.test(chiffres)) return `212${chiffres.slice(1)}`;
  return chiffres;
}

// Suivi commercial des questionnaires du site.
const SUIVIS: { cle: SuiviProspect; libelle: string; couleur: string }[] = [
  { cle: "a_contacter", libelle: "À contacter", couleur: "bg-c2b-gold text-c2b-green" },
  { cle: "contacte", libelle: "Contacté", couleur: "bg-indigo-500 text-white" },
  { cle: "client", libelle: "Client ✓", couleur: "bg-c2b-green text-c2b-cream" },
  { cle: "pas_interesse", libelle: "Pas intéressé", couleur: "bg-black/10 text-c2b-muted" },
];

// Réponse libre du questionnaire, sans les « rien », « aucun », « RAS »…
function reponseUtile(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || /^(ras|r\.a\.s|rien|aucun|aucune|non|no|none|nan|pas de pr[ée]f[ée]rences?|-+|\.+)$/i.test(t)) return null;
  return t.slice(0, max);
}

// Premier message à un prospect, avec son bilan du questionnaire.
function messageProspect(q: Questionnaire) {
  const prenom = q.nom.trim().split(/\s+/)[0];
  const bilan =
    q.calories != null
      ? ` Votre bilan : ${q.calories} kcal par jour, dont ${q.proteines} g de protéines${q.palier ? ` (palier ${q.palier.slice(1)})` : ""}.`
      : "";
  return `Bonjour ${prenom}, c'est l'équipe Chef2Box 👋 Merci d'avoir fait votre bilan sur chef2box.com !${bilan} Nos repas sont calculés sur ces besoins et livrés chaque matin à Marrakech. Voulez-vous démarrer lundi ? Formule midi ou midi + soir ?`;
}

// Fiche client de la cuisine (table application_personnes), avec la date
// de son dernier repas au planning.
export interface FicheResume {
  id: string;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  palier: Palier | null;
  allergies: string | null;
  refus: string | null;
  note: string | null;
  client_id: string | null;
  jeton?: string | null; // lien personnel « Ma semaine »
  livraison_offerte?: boolean; // prix du client
  remise?: number; // % sur les repas
  dernier: string | null;
}

// Titre d'une liste repliable (Mes clients, Questionnaires, Comptes appli).
function EnTeteSection({
  icone,
  titre,
  nombre,
  ouvert,
  basculer,
}: {
  icone: React.ReactNode;
  titre: string;
  nombre: number;
  ouvert: boolean;
  basculer: () => void;
}) {
  return (
    <button onClick={basculer} aria-expanded={ouvert} className="carte flex w-full items-center gap-3 px-4 py-3.5 text-left">
      <span className="text-c2b-gold">{icone}</span>
      <span className="flex-1 font-serif text-[20px] text-c2b-green">{titre}</span>
      <span className="pastille py-0.5 px-2">{nombre}</span>
      <ChevronDown size={18} className={`text-c2b-muted transition-transform ${ouvert ? "rotate-180" : ""}`} />
    </button>
  );
}

export function ClientsClient({
  clientsInitiaux,
  questionnairesInitiaux = [],
  fichesInitiales = [],
  relance = null,
  emails,
  cleServicePresente,
}: {
  clientsInitiaux: Client[];
  questionnairesInitiaux?: Questionnaire[];
  fichesInitiales?: FicheResume[];
  // Relance de la semaine prochaine : son lundi, et les fiches (clé du nom) qui ont déjà commandé.
  relance?: { lundi: string; aujourdhui: string; dejaCommande: string[] } | null;
  emails: Record<string, string>;
  cleServicePresente: boolean;
}) {
  const supabase = createClient();
  const [clients, setClients] = useState(clientsInitiaux);
  const [emailsConnus, setEmailsConnus] = useState(emails);
  const [questionnaires, setQuestionnaires] = useState(questionnairesInitiaux);
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [acces, setAcces] = useState<Acces | null>(null);
  const [copie, setCopie] = useState(false);
  const [filtre, setFiltre] = useState<"tous" | "premium" | "gratuits">("tous");
  const nbPremium = clients.filter((c) => c.premium).length;
  const [recherche, setRecherche] = useState("");
  // Questionnaires : les 3 derniers, le reste en déroulant ou en cherchant.
  const [tousQuestionnaires, setTousQuestionnaires] = useState(false);
  // Listes repliées par défaut ; une recherche les ouvre sur les résultats.
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const basculerListe = (cle: string) =>
    setOuvertes((s) => {
      const n = new Set(s);
      if (n.has(cle)) n.delete(cle);
      else n.add(cle);
      return n;
    });
  const [fiches, setFiches] = useState(fichesInitiales);
  const [toutesFiches, setToutesFiches] = useState(false);
  const [relanceOuverte, setRelanceOuverte] = useState(false);
  const [relances, setRelances] = useState<Set<string>>(new Set());
  const [filtreSuivi, setFiltreSuivi] = useState<SuiviProspect | "tous">("a_contacter");
  // Recherche sur le nom, l'e-mail ou le téléphone (sans tenir compte des accents).
  const normaliser = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const saisie = normaliser(recherche);
  const saisieQ = saisie;
  const suiviDe = (q: Questionnaire): SuiviProspect => q.suivi ?? "a_contacter";
  const questionnairesTrouves = questionnaires
    .filter((q) => filtreSuivi === "tous" || suiviDe(q) === filtreSuivi)
    .filter((q) => !saisieQ || normaliser([q.nom, q.email, q.telephone].filter(Boolean).join(" ")).includes(saisieQ));
  const questionnairesAffiches = saisieQ || tousQuestionnaires ? questionnairesTrouves : questionnairesTrouves.slice(0, 3);
  const fichesTrouvees = fiches
    .filter((fc) => !saisie || normaliser([fc.nom, fc.telephone, fc.adresse].filter(Boolean).join(" ")).includes(saisie))
    .sort((x, y) => (y.dernier ?? "").localeCompare(x.dernier ?? "") || x.nom.localeCompare(y.nom, "fr"));
  const clientsAffiches = clients
    .filter((c) => (filtre === "premium" ? c.premium : filtre === "gratuits" ? !c.premium : true))
    .filter((c) => !saisie || normaliser([c.nom, emailsConnus[c.id], c.telephone].filter(Boolean).join(" ")).includes(saisie));

  // Client Chef2Box (Premium) : messagerie, assistant 20/jour, « Mon plat », bilan.
  async function basculerPremium(c: Client) {
    const premium = !c.premium;
    if (!premium && !confirm(`Retirer le Premium de ${c.nom} ? Il ne pourra plus vous écrire et aura 5 questions par jour à l'assistant.`)) return;
    setClients((prev) => prev.map((x) => (x.id === c.id ? { ...x, premium } : x)));
    const { error } = await supabase.from("application_clients").update({ premium }).eq("id", c.id);
    if (error) {
      setClients((prev) => prev.map((x) => (x.id === c.id ? { ...x, premium: c.premium } : x)));
      setErreur("Changement impossible, réessayez.");
    }
  }

  function ouvrirNouveau() {
    setErreur("");
    setFiche({ ...FICHE_VIDE, profil: { ...PROFIL_VIDE } });
  }

  // Fiche pré-remplie depuis un questionnaire reçu : rien à retaper.
  function ouvrirDepuisQuestionnaire(q: Questionnaire) {
    setErreur("");
    const tel = q.telephone ?? "";
    setFiche({
      ...FICHE_VIDE,
      questionnaireId: q.id,
      nom: q.nom,
      email: q.email ?? "",
      ...(tel.startsWith("+") ? decouperNumero(tel) : { indicatif: "+212", telephone: tel }),
      palier: q.palier ?? "",
      calories: q.calories != null ? String(q.calories) : "",
      proteines: q.proteines != null ? String(q.proteines) : "",
      glucides: q.glucides != null ? String(q.glucides) : "",
      lipides: q.lipides != null ? String(q.lipides) : "",
      profil: depuisProfil(q.profil),
    });
  }

  // Suivi commercial d'un questionnaire (à contacter, contacté, client…).
  async function changerSuivi(q: Questionnaire, suivi: SuiviProspect) {
    const maj = { suivi, suivi_le: new Date().toISOString() };
    setQuestionnaires((prev) => prev.map((x) => (x.id === q.id ? { ...x, ...maj } : x)));
    const { error } = await supabase.from("application_questionnaires").update(maj).eq("id", q.id);
    if (error) setQuestionnaires((prev) => prev.map((x) => (x.id === q.id ? q : x)));
  }

  // Questionnaire du site → fiche client de la cuisine (nom, téléphone,
  // palier, allergies, refus, goûts), puis la cuisine s'ouvre avec le
  // formulaire d'ajout prêt : il ne reste qu'à cocher midi / soir.
  async function creerFiche(q: Questionnaire): Promise<string | null> {
    const nom = q.nom.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!nom) return null;
    const { data: existante } = await supabase.from("application_personnes").select("id").eq("cle", nom.toLowerCase()).maybeSingle();
    if (existante && !confirm(`Une fiche « ${nom} » existe déjà en cuisine. La mettre à jour avec ce questionnaire ?`)) return null;
    const { data: creee, error } = await supabase.from("application_personnes").upsert(
      {
        nom,
        telephone: q.telephone ? q.telephone.slice(0, 30) : null,
        palier: q.palier,
        allergies: reponseUtile(q.reponses?.allergies, 300),
        refus: reponseUtile(q.reponses?.refuses, 300),
        note: (() => {
          const aime = reponseUtile(q.reponses?.preferes, 190);
          return aime ? `Aime : ${aime}` : null;
        })(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cle" }
    )
      .select("id, nom, telephone, adresse, palier, allergies, refus, note, client_id")
      .single<Omit<FicheResume, "dernier">>();
    if (error || !creee) {
      alert("Fiche impossible à créer, réessayez.");
      return null;
    }
    setFiches((prev) => [...prev.filter((f) => f.id !== creee.id), { ...creee, dernier: prev.find((f) => f.id === creee.id)?.dernier ?? null }]);
    await changerSuivi(q, "client");
    return nom;
  }

  // Lien personnel « Ma semaine » (créé la première fois), envoyé sur
  // WhatsApp : le client choisit ses repas, voit le prix et envoie.
  // Relance : clients venus ces 4 dernières semaines, avec un numéro, qui
  // n'ont pas encore commandé la semaine prochaine.
  const aRelancer = relance
    ? fiches
        .filter((fc) => fc.dernier && fc.dernier >= decalerDate(relance.aujourdhui, -28) && !relance.dejaCommande.includes(fc.nom.trim().toLowerCase()))
        .filter((fc) => numeroWhatsApp(fc.telephone).length >= 9)
        .sort((x, y) => x.nom.localeCompare(y.nom, "fr"))
    : [];
  async function ouvrirRelance() {
    if (relanceOuverte) return setRelanceOuverte(false);
    setRelanceOuverte(true);
    // Liens créés d'avance : chaque bouton WhatsApp est prêt d'un toucher.
    const sansLien = aRelancer.filter((fc) => !fc.jeton);
    const crees = await Promise.all(
      sansLien.map(async (fc) => {
        const jeton = nouveauJeton();
        const { error } = await supabase.from("application_personnes").update({ jeton }).eq("id", fc.id);
        return error ? null : { id: fc.id, jeton };
      })
    );
    const parId = new Map(crees.filter(Boolean).map((c) => [c!.id, c!.jeton]));
    if (parId.size) setFiches((prev) => prev.map((f) => (parId.has(f.id) ? { ...f, jeton: parId.get(f.id)! } : f)));
  }
  const messageRelance = (fc: FicheResume) => {
    const jour = new Date(`${relance!.lundi}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
    return `Bonjour ${fc.nom.trim().split(/\s+/)[0]} 👋 La semaine du ${jour} est ouverte chez Chef2Box ! Choisis tes repas (midi, soir) ici, avec le menu et le prix : ${window.location.origin}/ma-semaine/${fc.jeton} (modifiable jusqu'à la veille 20 h)`;
  };

  // Le menu du lien s'ouvre ; le lien est créé tout de suite s'il n'existe
  // pas, pour que « Copier » marche d'un seul toucher (iPhone).
  const [lienOuvert, setLienOuvert] = useState<string | null>(null);
  const [lienCopie, setLienCopie] = useState(false);
  const lienDe = (fc: FicheResume) => (fc.jeton ? `${window.location.origin}/ma-semaine/${fc.jeton}` : null);
  async function ouvrirMenuLien(fc: FicheResume) {
    setLienCopie(false);
    if (lienOuvert === fc.id) return setLienOuvert(null);
    setLienOuvert(fc.id);
    if (!fc.jeton) {
      const jeton = nouveauJeton();
      const { error } = await supabase.from("application_personnes").update({ jeton }).eq("id", fc.id);
      if (error) {
        setLienOuvert(null);
        return alert("Lien impossible à créer, réessayez.");
      }
      setFiches((prev) => prev.map((f) => (f.id === fc.id ? { ...f, jeton } : f)));
    }
  }
  // Prix du client (livraison offerte, remise), enregistré tout de suite.
  async function changerPrix(fc: FicheResume, maj: { livraison_offerte?: boolean; remise?: number }) {
    setFiches((prev) => prev.map((f) => (f.id === fc.id ? { ...f, ...maj } : f)));
    const { error } = await supabase.from("application_personnes").update(maj).eq("id", fc.id);
    if (error) {
      setFiches((prev) => prev.map((f) => (f.id === fc.id ? fc : f)));
      alert("Prix non enregistré, réessayez.");
    }
  }

  function copierLien(fc: FicheResume) {
    const lien = lienDe(fc);
    if (!lien) return;
    navigator.clipboard
      .writeText(lien)
      .then(() => setLienCopie(true))
      .catch(() => window.prompt("Copiez ce lien :", lien));
  }
  function envoyerLien(fc: FicheResume) {
    const lien = lienDe(fc);
    if (!lien) return;
    const prenom = fc.nom.trim().split(/\s+/)[0];
    const message = `Bonjour ${prenom} 👋 Voici ton espace Chef2Box : tu y commandes tes repas (midi, soir) avec le menu et le prix, tu modifies jusqu'à la veille 20 h et tu suis tes paiements. Garde ce lien : ${lien}`;
    const numero = numeroWhatsApp(fc.telephone);
    window.open(numero.length >= 9 ? `https://wa.me/${numero}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  }

  // Questionnaire → Mes clients, puis la cuisine pour choisir midi / soir.
  async function mettreEnCuisine(q: Questionnaire) {
    const nom = await creerFiche(q);
    if (nom) window.location.href = `/admin/cuisine?ajouter=${encodeURIComponent(nom)}`;
  }

  // Questionnaire → Mes clients, sans passer par la cuisine.
  async function passerEnClient(q: Questionnaire) {
    const nom = await creerFiche(q);
    if (nom) setOuvertes((o) => new Set(o).add("clients"));
  }

  async function ignorerQuestionnaire(q: Questionnaire) {
    if (!confirm(`Retirer « ${q.nom} » de la liste des questionnaires reçus ?`)) return;
    const { error } = await supabase.from("application_questionnaires").update({ statut: "ignore" }).eq("id", q.id);
    if (!error) setQuestionnaires((prev) => prev.filter((x) => x.id !== q.id));
  }

  function ouvrirEdition(c: Client) {
    setErreur("");
    setFiche({
      id: c.id,
      nom: c.nom,
      email: emailsConnus[c.id] ?? "",
      ...decouperNumero(c.telephone),
      palier: c.palier ?? "",
      calories: String(c.objectif_calories),
      proteines: String(c.objectif_proteines),
      glucides: String(c.objectif_glucides),
      lipides: String(c.objectif_lipides),
      profil: depuisProfil(c.profil),
    });
  }

  // Chaque modification du profil recalcule les objectifs (même calcul que
  // le questionnaire du site) dès que le profil est complet.
  function changerProfil(modif: Partial<ProfilSaisi>) {
    if (!fiche) return;
    const profil = { ...fiche.profil, ...modif };
    const suivant: Fiche = { ...fiche, profil };
    const p = versProfil(profil);
    if (profilComplet(p)) {
      const o = calculerObjectifs(p);
      Object.assign(suivant, {
        calories: String(o.calories),
        proteines: String(o.proteines),
        glucides: String(o.glucides),
        lipides: String(o.lipides),
        palier: o.palier,
      });
    }
    setFiche(suivant);
  }

  async function enregistrer() {
    if (!fiche) return;
    setErreur("");
    const objectifs = {
      objectif_calories: parseInt(fiche.calories, 10),
      objectif_proteines: parseInt(fiche.proteines, 10),
      objectif_glucides: parseInt(fiche.glucides, 10),
      objectif_lipides: parseInt(fiche.lipides, 10),
    };
    if (!fiche.nom.trim()) return setErreur("Le nom est obligatoire.");
    if (Object.values(objectifs).some((v) => !Number.isFinite(v)))
      return setErreur("Complétez le profil (ou saisissez les objectifs à la main).");
    const p = versProfil(fiche.profil);
    const profil = profilComplet(p) ? p : null;

    setEnCours(true);
    if (fiche.id) {
      const { data, error } = await supabase
        .from("application_clients")
        .update({ nom: fiche.nom.trim(), telephone: numeroInternational(fiche.indicatif, fiche.telephone), palier: fiche.palier || null, profil, ...objectifs })
        .eq("id", fiche.id)
        .select("*")
        .single<Client>();
      setEnCours(false);
      if (error || !data) return setErreur("Enregistrement impossible, réessayez.");
      setClients((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      setFiche(null);
      return;
    }

    const reponse = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nom: fiche.nom,
        email: fiche.email,
        telephone: numeroInternational(fiche.indicatif, fiche.telephone),
        palier: fiche.palier || null,
        profil,
        ...objectifs,
      }),
    });
    const resultat = await reponse.json().catch(() => ({}));
    setEnCours(false);
    if (!reponse.ok) {
      return setErreur(
        resultat.erreur === "CLE_SERVICE_MANQUANTE"
          ? "La clé secrète Supabase n'est pas encore installée sur Netlify (voir l'encadré en haut de la page)."
          : resultat.erreur ?? "Création impossible, réessayez."
      );
    }
    setClients((prev) =>
      [
        ...prev,
        {
          id: resultat.id,
          nom: fiche.nom.trim(),
          telephone: numeroInternational(fiche.indicatif, fiche.telephone),
          palier: (fiche.palier || null) as Palier | null,
          profil,
          ...objectifs,
          est_admin: false,
          created_at: new Date().toISOString(),
        },
      ].sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
    );
    setEmailsConnus((prev) => ({ ...prev, [resultat.id]: resultat.email }));
    setFiche(null);
    setCopie(false);
    if (fiche.questionnaireId) {
      await supabase
        .from("application_questionnaires")
        .update({ statut: "compte_cree", client_id: resultat.id })
        .eq("id", fiche.questionnaireId);
      setQuestionnaires((prev) => prev.filter((x) => x.id !== fiche.questionnaireId));
    }
    setAcces({ nom: fiche.nom.trim(), email: resultat.email, motDePasse: resultat.motDePasse, telephone: numeroInternational(fiche.indicatif, fiche.telephone) });
  }

  async function nouveauMotDePasse(c: Client) {
    if (!confirm(`Envoyer un nouveau code provisoire à ${c.nom} ? Son mot de passe actuel ne fonctionnera plus et il en choisira un nouveau.`)) return;
    const reponse = await fetch("/api/admin/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id }),
    });
    const resultat = await reponse.json().catch(() => ({}));
    if (!reponse.ok) {
      alert(
        resultat.erreur === "CLE_SERVICE_MANQUANTE"
          ? "La clé secrète Supabase n'est pas encore installée sur Netlify."
          : resultat.erreur ?? "Impossible, réessayez."
      );
      return;
    }
    setCopie(false);
    setAcces({ nom: c.nom, email: resultat.email, motDePasse: resultat.motDePasse, telephone: c.telephone });
  }

  const texteAcces = acces
    ? `Bonjour ${acces.nom.split(" ")[0]} ! Voici votre accès à l'appli Chef2Box pour suivre vos repas et vos macros :\n` +
      `${typeof window !== "undefined" ? window.location.origin : ""}\n\n` +
      `Email : ${acces.email}\nCode provisoire : ${acces.motDePasse}\n\n` +
      `À la première connexion, vous choisirez votre propre mot de passe.\n` +
      `Astuce : ajoutez l'appli à l'écran d'accueil de votre téléphone.`
    : "";

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
      <AdminOnglets />
      <header className="flex items-end justify-between gap-3">
        <div>
          <span className="lbl mb-2">Espace admin</span>
          <h1 className="titre text-[34px]">
            Mes <em>clients</em>
          </h1>
        </div>
        <button onClick={ouvrirNouveau} className="btn-primary px-4 py-2.5 text-sm">
          <Plus size={16} /> Nouveau client
        </button>
      </header>

      {!cleServicePresente && (
        <div className="rounded-2xl border border-c2b-gold/40 bg-c2b-gold/[0.08] p-4 text-sm text-c2b-green space-y-1.5">
          <p className="font-bold">Une dernière étape pour créer les comptes depuis l&apos;appli</p>
          <p>
            Vous pouvez déjà modifier les objectifs. Pour créer des comptes et envoyer les codes provisoires, ajoutez la clé
            secrète Supabase sur Netlify : variable <code className="font-bold">SUPABASE_SERVICE_ROLE_KEY</code>.
          </p>
        </div>
      )}

      {acces && (
        <div className="rounded-[20px] bg-c2b-green p-5 text-white space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="lbl mb-1">Accès de {acces.nom}</span>
              <p className="text-sm text-white/70">
                À envoyer au client. Ce code ne sert qu&apos;une fois : à sa première connexion, il choisit son
                propre mot de passe (que vous ne connaîtrez pas).
              </p>
            </div>
            <button onClick={() => setAcces(null)} className="text-white/60" aria-label="Fermer">
              <X size={18} />
            </button>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 text-[15px] space-y-1">
            <p>
              Email : <span className="font-bold">{acces.email}</span>
            </p>
            <p>
              Code provisoire : <span className="font-bold tracking-wide">{acces.motDePasse}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://wa.me/${numeroWhatsApp(acces.telephone)}?text=${encodeURIComponent(texteAcces)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-gold px-4 py-2.5 text-sm"
            >
              <MessageCircle size={16} /> Envoyer par WhatsApp
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(texteAcces)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 px-4 py-2 text-sm font-semibold"
            >
              Choisir le contact dans WhatsApp
            </a>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(texteAcces).catch(() => {});
                setCopie(true);
              }}
              className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 px-4 py-2 text-sm font-semibold"
            >
              {copie ? <Check size={16} /> : <Copy size={16} />} {copie ? "Copié" : "Copier le message"}
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-c2b-muted" />
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un client, un questionnaire…"
          autoComplete="off"
          className="champ py-3 pl-9 pr-9 text-sm"
        />
        {recherche && (
          <button
            onClick={() => setRecherche("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-c2b-muted"
            aria-label="Effacer la recherche"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* 1. Mes clients : les fiches de la cuisine. */}
      <section className="space-y-2.5">
        <EnTeteSection
          icone={<Users size={18} />}
          titre="Mes clients"
          nombre={fiches.length}
          ouvert={ouvertes.has("clients") || !!saisie}
          basculer={() => basculerListe("clients")}
        />
        {(ouvertes.has("clients") || !!saisie) && (
          <>
            <p className="px-1 text-xs text-c2b-muted">
              Toute personne mise en cuisine arrive ici. Sa fiche se modifie en touchant son nom dans la Cuisine.
            </p>
            {relance && (
              <div className="carte overflow-hidden border-c2b-gold/50">
                <button onClick={ouvrirRelance} className="flex w-full items-center gap-2 px-4 py-3 text-left">
                  <span className="flex-1 text-sm font-bold text-c2b-green">
                    📣 Relancer pour la semaine du{" "}
                    {new Date(`${relance.lundi}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })}
                  </span>
                  <span className="pastille py-0.5 px-2">{aRelancer.length}</span>
                  <ChevronDown size={16} className={`text-c2b-muted transition-transform ${relanceOuverte ? "rotate-180" : ""}`} />
                </button>
                {relanceOuverte && (
                  <div className="space-y-1.5 border-t border-c2b-green/10 p-3">
                    <p className="text-xs text-c2b-muted">
                      Venus ces 4 dernières semaines, pas encore de commande pour la semaine prochaine. Touchez WhatsApp : le message et son lien sont prêts.
                    </p>
                    {aRelancer.length === 0 && <p className="py-2 text-center text-sm text-c2b-muted">Tout le monde a commandé 🎉</p>}
                    {aRelancer.map((fc) => (
                      <div key={fc.id} className="flex items-center gap-2 rounded-xl bg-c2b-cream px-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-c2b-green">
                          {fc.nom}
                          {relances.has(fc.id) && <span className="ml-1.5 text-xs font-semibold text-emerald-700">✓ envoyé</span>}
                        </span>
                        {fc.jeton ? (
                          <a
                            href={`https://wa.me/${numeroWhatsApp(fc.telephone)}?text=${encodeURIComponent(messageRelance(fc))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setRelances((r) => new Set(r).add(fc.id))}
                            className="flex-shrink-0 rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-bold text-white"
                          >
                            WhatsApp
                          </a>
                        ) : (
                          <span className="text-xs text-c2b-muted">Lien…</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {fichesTrouvees.length === 0 && <p className="py-2 text-center text-sm text-c2b-muted">Aucun client trouvé.</p>}
            <ul className="space-y-1.5">
              {(saisie || toutesFiches ? fichesTrouvees : fichesTrouvees.slice(0, 15)).map((fc) => {
                const compte = fc.client_id ? clients.find((c) => c.id === fc.client_id) : null;
                const numero = numeroWhatsApp(fc.telephone);
                return (
                  <li key={fc.id} className="carte p-3">
                    <div className="flex items-center gap-2">
                    <button onClick={() => ouvrirMenuLien(fc)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-bold text-c2b-green">
                        {fc.nom}
                        {fc.palier && <span className="ml-1.5 pastille py-0.5 px-1.5 text-[10px]">{fc.palier}</span>}
                        {(fc.livraison_offerte || (fc.remise ?? 0) > 0) && (
                          <span className="ml-1.5 text-[10px] font-bold text-emerald-700">
                            🎁 {[(fc.remise ?? 0) >= 100 ? "offert" : (fc.remise ?? 0) > 0 && `−${fc.remise} %`, fc.livraison_offerte && "livraison"].filter(Boolean).join(" · ")}
                          </span>
                        )}
                        {compte && (
                          <span className="ml-1.5 text-[10px] font-bold text-c2b-gold">{compte.premium ? "👑 appli" : "appli"}</span>
                        )}
                      </p>
                      <p className="truncate text-[11px] text-c2b-muted">
                        {fc.dernier ? `Dernier repas : ${new Date(`${fc.dernier}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })}` : "Pas encore de repas"}
                        {fc.allergies && <span className="font-bold text-red-700"> · ⚠️ {fc.allergies}</span>}
                      </p>
                    </button>
                    {numero.length >= 9 && (
                      <>
                        <a
                          href={`tel:+${numero}`}
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-c2b-green/20 text-c2b-green"
                          aria-label={`Appeler ${fc.nom}`}
                        >
                          <Phone size={15} />
                        </a>
                      </>
                    )}
                    <button
                      onClick={() => ouvrirMenuLien(fc)}
                      aria-expanded={lienOuvert === fc.id}
                      className="flex h-9 flex-shrink-0 items-center justify-center rounded-full bg-[#25D366] px-3 text-xs font-bold text-white"
                      aria-label={`Lien « Mon espace » de ${fc.nom}`}
                      title="Lien « Mon espace »"
                    >
                      📲
                    </button>
                    <a
                      href={`/admin/cuisine?ajouter=${encodeURIComponent(fc.nom)}`}
                      className="flex h-9 flex-shrink-0 items-center justify-center rounded-full bg-c2b-green px-3 text-xs font-bold text-c2b-cream"
                      aria-label={`Mettre ${fc.nom} en cuisine`}
                    >
                      🍳
                    </a>
                    </div>
                    {lienOuvert === fc.id && (
                      <div className="mt-2 space-y-2 rounded-xl bg-c2b-cream p-3">
                        <div className="space-y-2 rounded-lg bg-white p-2.5">
                          <p className="text-xs font-bold text-c2b-muted">💰 Son prix — à régler une fois, puis envoyez le lien</p>
                          <label className="flex items-center gap-2 text-sm font-semibold text-c2b-green">
                            <input
                              type="checkbox"
                              checked={!!fc.livraison_offerte}
                              onChange={(e) => changerPrix(fc, { livraison_offerte: e.target.checked })}
                              className="h-5 w-5 accent-[#1c2e1e]"
                            />
                            🚚 Livraison offerte
                          </label>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-semibold text-c2b-green">Remise</span>
                            {[0, 5, 10, 15, 20, 30, 50, 100].map((r) => (
                              <button
                                key={r}
                                onClick={() => changerPrix(fc, { remise: r })}
                                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                  (fc.remise ?? 0) === r ? "bg-c2b-gold text-c2b-green" : "bg-c2b-cream border border-c2b-green/15 text-c2b-green"
                                }`}
                              >
                                {r === 0 ? "Aucune" : r === 100 ? "🎁 Offert" : `${r} %`}
                              </button>
                            ))}
                          </div>
                          <p className="text-[11px] text-c2b-muted">Enregistré tout de suite : il le verra dans son espace, et dans Paiements.</p>
                        </div>
                        <p className="text-xs font-bold text-c2b-muted">Lien « Mon espace » de {fc.nom}</p>
                        {lienDe(fc) ? (
                          <>
                            <p className="select-all break-all rounded-lg bg-white px-2.5 py-2 text-xs text-c2b-green">{lienDe(fc)}</p>
                            <div className="grid grid-cols-3 gap-1.5">
                              <button onClick={() => envoyerLien(fc)} className="rounded-full bg-[#25D366] py-2 text-xs font-bold text-white">
                                WhatsApp
                              </button>
                              <button onClick={() => copierLien(fc)} className="btn-secondary py-2 text-xs">
                                {lienCopie ? "Copié ✓" : "Copier"}
                              </button>
                              <a href={lienDe(fc)!} target="_blank" rel="noopener noreferrer" className="btn-secondary py-2 text-xs">
                                Ouvrir
                              </a>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-c2b-muted">Création du lien…</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {!saisie && fichesTrouvees.length > 15 && (
              <button onClick={() => setToutesFiches((t) => !t)} className="btn-secondary w-full py-2.5 text-sm">
                <ChevronDown size={16} className={toutesFiches ? "rotate-180" : ""} />
                {toutesFiches ? "Réduire" : `Voir les ${fichesTrouvees.length - 15} autres`}
              </button>
            )}
          </>
        )}
      </section>

      {/* 2. Questionnaires reçus du site (prospects). */}
      <section className="space-y-2.5">
        <EnTeteSection
          icone={<Inbox size={18} />}
          titre="Questionnaires reçus"
          nombre={questionnaires.filter((q) => suiviDe(q) === "a_contacter").length}
          ouvert={ouvertes.has("questionnaires") || !!saisie}
          basculer={() => basculerListe("questionnaires")}
        />
        {(ouvertes.has("questionnaires") || !!saisie) && (
          <>
      {questionnaires.length > 0 && (
          <section className="space-y-2.5">
            <p className="text-xs text-c2b-muted">
              Remplis sur chef2box.com. Touchez « Créer son compte » : nom, email et objectifs sont déjà remplis.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[...SUIVIS, { cle: "tous" as const, libelle: "Tous", couleur: "bg-c2b-green text-c2b-cream" }].map((f) => {
                const n = f.cle === "tous" ? questionnaires.length : questionnaires.filter((q) => suiviDe(q) === f.cle).length;
                return (
                  <button
                    key={f.cle}
                    onClick={() => setFiltreSuivi(f.cle)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      filtreSuivi === f.cle ? f.couleur : "bg-white border border-c2b-green/15 text-c2b-green"
                    }`}
                  >
                    {f.libelle} ({n})
                  </button>
                );
              })}
            </div>
            {questionnairesTrouves.length === 0 && (
              <p className="py-2 text-center text-sm text-c2b-muted">{saisieQ ? "Aucun questionnaire à ce nom." : "Aucun questionnaire dans cette liste."}</p>
            )}
            {questionnairesAffiches.map((q) => (
              <div key={q.id} className="carte p-4 border-c2b-gold/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[15px] text-c2b-green">
                      {q.nom}
                      {q.palier && <span className="ml-2 pastille py-0.5 px-2 text-[10px]">{q.palier}</span>}
                    </p>
                    <p className="text-xs text-c2b-muted truncate">
                      {[q.email, q.telephone].filter(Boolean).join(" · ") || "Pas d'email"} ·{" "}
                      {q.source === "site"
                        ? new Date(q.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
                        : "ancien outil, chiffres à vérifier"}
                    </p>
                  </div>
                  <button
                    onClick={() => ignorerQuestionnaire(q)}
                    className="text-c2b-muted/60 hover:text-c2b-green flex-shrink-0"
                    aria-label="Retirer de la liste"
                  >
                    <X size={17} />
                  </button>
                </div>
                {q.calories != null && (
                  <p className="text-sm text-c2b-green mt-2">
                    <span className="font-bold">{q.calories} kcal</span> · {q.proteines}g P · {q.glucides}g G · {q.lipides}g L
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {SUIVIS.map((sv) => (
                    <button
                      key={sv.cle}
                      onClick={() => changerSuivi(q, sv.cle)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        suiviDe(q) === sv.cle ? sv.couleur : "bg-white border border-c2b-green/15 text-c2b-muted"
                      }`}
                    >
                      {sv.libelle}
                    </button>
                  ))}
                </div>
                {q.suivi_le && suiviDe(q) !== "a_contacter" && (
                  <p className="mt-1 text-[11px] text-c2b-muted">
                    Mis à jour le {new Date(q.suivi_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {numeroWhatsApp(q.telephone).length >= 9 ? (
                    <a
                      href={`https://wa.me/${numeroWhatsApp(q.telephone)}?text=${encodeURIComponent(messageProspect(q))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => suiviDe(q) === "a_contacter" && changerSuivi(q, "contacte")}
                      className="flex items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-3 py-2.5 text-sm font-bold text-white"
                    >
                      <MessageCircle size={15} /> WhatsApp
                    </a>
                  ) : (
                    <span className="flex items-center justify-center rounded-full border border-c2b-green/15 px-3 py-2.5 text-xs text-c2b-muted">
                      Pas de numéro
                    </span>
                  )}
                  <button onClick={() => ouvrirDepuisQuestionnaire(q)} className="btn-gold py-2.5 text-sm">
                    Créer son compte
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button onClick={() => passerEnClient(q)} className="btn-secondary py-2.5 text-sm">
                    ✓ Passer en client
                  </button>
                  <button onClick={() => mettreEnCuisine(q)} className="btn-primary py-2.5 text-sm">
                    🍳 Mettre en cuisine
                  </button>
                </div>
              </div>
            ))}
            {!saisieQ && questionnairesTrouves.length > 3 && (
              <button onClick={() => setTousQuestionnaires((t) => !t)} className="btn-secondary w-full py-2.5 text-sm">
                <ChevronDown size={16} className={tousQuestionnaires ? "rotate-180" : ""} />
                {tousQuestionnaires ? "Ne montrer que les 3 derniers" : `Voir les ${questionnairesTrouves.length - 3} autres`}
              </button>
            )}
          </section>
        )}
          </>
        )}
      </section>

      {/* 3. Comptes de l'appli (macros, Premium). */}
      <section className="space-y-2.5">
        <EnTeteSection
          icone={<Smartphone size={18} />}
          titre="Comptes de l'appli"
          nombre={clients.length}
          ouvert={ouvertes.has("appli") || !!saisie}
          basculer={() => basculerListe("appli")}
        />
        {(ouvertes.has("appli") || !!saisie) && (
          <>
      {clients.length === 0 ? (
          <div className="carte p-8 text-center text-sm text-c2b-muted">
            Aucun client pour l&apos;instant. Touchez « Nouveau client » pour créer le premier compte.
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["tous", `Tous (${clients.length})`],
                  ["premium", `Premium (${nbPremium})`],
                  ["gratuits", `Gratuits (${clients.length - nbPremium})`],
                ] as const
              ).map(([f, libelle]) => (
                <button
                  key={f}
                  onClick={() => setFiltre(f)}
                  className={`rounded-full py-2 text-[13px] font-bold ${
                    filtre === f ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-green"
                  }`}
                >
                  {libelle}
                </button>
              ))}
            </div>
            {clientsAffiches.length === 0 && <p className="py-3 text-center text-sm text-c2b-muted">Aucun client trouvé.</p>}
            {clientsAffiches.map((c) => (
              <div key={c.id} className="carte p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[15px] text-c2b-green">
                      {c.nom}
                      {c.palier && <span className="ml-2 pastille py-0.5 px-2 text-[10px]">{c.palier}</span>}
                    </p>
                    <p className="text-xs text-c2b-muted truncate">
                      {[emailsConnus[c.id], c.telephone].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <button
                      onClick={() => basculerPremium(c)}
                      className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        c.premium ? "bg-c2b-gold/15 text-c2b-gold" : "border border-c2b-green/15 bg-white text-c2b-muted"
                      }`}
                      aria-pressed={!!c.premium}
                      title={c.premium ? "Retirer le Premium" : "Passer en Premium (client Chef2Box)"}
                    >
                      <Crown size={12} /> {c.premium ? "Premium" : "Gratuit · passer Premium"}
                    </button>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => nouveauMotDePasse(c)}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-muted hover:text-c2b-green hover:bg-c2b-green/[0.06]"
                      aria-label="Mot de passe oublié : nouveau code provisoire"
                      title="Mot de passe oublié : nouveau code provisoire"
                    >
                      <KeyRound size={17} />
                    </button>
                    <button
                      onClick={() => ouvrirEdition(c)}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-muted hover:text-c2b-green hover:bg-c2b-green/[0.06]"
                      aria-label="Modifier"
                    >
                      <Pencil size={17} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                  {[
                    [c.objectif_calories, "kcal"],
                    [c.objectif_proteines, "Prot. g"],
                    [c.objectif_glucides, "Gluc. g"],
                    [c.objectif_lipides, "Lip. g"],
                  ].map(([v, u]) => (
                    <div key={u} className="rounded-xl bg-c2b-cream py-2">
                      <p className="font-serif text-lg text-c2b-green leading-none">{v}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-c2b-muted mt-1">{u}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
          </>
        )}
      </section>

      {fiche && (
        <div className="fixed inset-0 !mt-0 bg-c2b-green/60 backdrop-blur-sm z-30 flex items-stretch md:items-center justify-center">
          <div className="bg-c2b-cream w-full h-[100dvh] md:h-auto md:max-w-md md:rounded-[24px] md:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 sticky top-0 z-10 bg-c2b-cream">
              <h2 className="titre text-2xl">
                {fiche.id ? "Modifier le " : "Nouveau "}
                <em>client</em>
              </h2>
              <button onClick={() => setFiche(null)} className="text-c2b-green/60" aria-label="Fermer">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <Champ label="Nom et prénom">
                <input value={fiche.nom} onChange={(e) => setFiche({ ...fiche, nom: e.target.value })} className="champ" />
              </Champ>
              <Champ label={fiche.id ? "Email (identifiant)" : "Email (sera son identifiant)"}>
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  value={fiche.email}
                  disabled={!!fiche.id}
                  onChange={(e) => setFiche({ ...fiche, email: e.target.value })}
                  className="champ disabled:opacity-60"
                />
              </Champ>
              <div className="grid grid-cols-[auto_1fr] gap-2.5">
                <Champ label="Pays">
                  <select
                    value={fiche.indicatif}
                    onChange={(e) => setFiche({ ...fiche, indicatif: e.target.value })}
                    className="champ w-[7.5rem] px-2"
                    aria-label="Indicatif du pays"
                  >
                    {INDICATIFS.map((i) => (
                      <option key={i.code} value={i.code}>
                        {i.pays.split(" ")[0]} {i.code}
                      </option>
                    ))}
                  </select>
                </Champ>
                <Champ label="Téléphone (WhatsApp)">
                  <input
                    type="tel"
                    inputMode="tel"
                    value={fiche.telephone}
                    onChange={(e) => setFiche({ ...fiche, telephone: e.target.value })}
                    placeholder="06 12 34 56 78"
                    className="champ"
                  />
                </Champ>
                <Champ label="Palier">
                  <select
                    value={fiche.palier}
                    onChange={(e) => setFiche({ ...fiche, palier: e.target.value as Palier | "" })}
                    className="champ w-24"
                  >
                    <option value="">—</option>
                    {PALIERS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Champ>
              </div>

              <details className="rounded-2xl bg-white border border-black/5 p-4 [&[open]>summary]:mb-3">
                <summary className="cursor-pointer list-none">
                  <p className="text-xs font-bold uppercase tracking-wider text-c2b-green">
                    Calculer depuis le profil <span className="text-c2b-gold">›</span>
                  </p>
                  <p className="text-[11px] text-c2b-muted">
                    Seulement si le client n&apos;a pas rempli le questionnaire du site (même calcul).
                  </p>
                </summary>
                <FormulaireProfil profil={fiche.profil} onChange={changerProfil} />
              </details>

              <p className="text-xs font-bold uppercase tracking-wider text-c2b-muted pt-1">Objectifs par jour</p>
              <Champ label="Calories (kcal)">
                <input
                  type="text"
                  inputMode="numeric"
                  value={fiche.calories}
                  onChange={(e) => setFiche({ ...fiche, calories: e.target.value.replace(/\D/g, "") })}
                  className="champ"
                />
              </Champ>
              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    ["proteines", "Protéines (g)"],
                    ["glucides", "Glucides (g)"],
                    ["lipides", "Lipides (g)"],
                  ] as const
                ).map(([cle, label]) => (
                  <Champ key={cle} label={label}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={fiche[cle]}
                      onChange={(e) => setFiche({ ...fiche, [cle]: e.target.value.replace(/\D/g, "") })}
                      className="champ px-3"
                    />
                  </Champ>
                ))}
              </div>
              <p className="text-[11px] text-c2b-muted">
                Calculés automatiquement (avec le palier) dès que le profil est complet. Vous pouvez les ajuster à la main.
              </p>

              {erreur && <p className="text-sm font-semibold text-red-600">{erreur}</p>}
              <button onClick={enregistrer} disabled={enCours} className="btn-primary w-full py-4">
                {enCours ? "Enregistrement..." : fiche.id ? "Enregistrer" : "Créer le compte"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-c2b-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}
