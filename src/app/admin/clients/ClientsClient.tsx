"use client";

import { useState } from "react";
import { Plus, X, KeyRound, Pencil, Copy, Check, MessageCircle, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AdminOnglets } from "@/app/admin/AdminOnglets";
import { Pastille } from "@/components/Pastille";
import {
  GRIGNOTAGE,
  METIERS,
  PLAISIR,
  OBJECTIFS,
  PALIERS,
  SEANCES,
  calculerObjectifs,
  profilComplet,
  type Profil,
} from "@/lib/objectifs";
import type { Client, Palier, Questionnaire } from "@/lib/types";

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

// Profil tel que saisi dans le formulaire (nombres en texte).
type ProfilSaisi = {
  sexe: Profil["sexe"] | "";
  age: string;
  taille: string;
  poids: string;
  objectifs: string[];
  seances: Profil["seances"];
  job: Profil["job"];
  grignotage: Profil["grignotage"];
  plaisir: NonNullable<Profil["plaisir"]>;
};

const PROFIL_VIDE: ProfilSaisi = {
  sexe: "",
  age: "",
  taille: "",
  poids: "",
  objectifs: [],
  seances: "0",
  job: "Principalement assis",
  grignotage: "—",
  plaisir: "—",
};

function versProfil(p: ProfilSaisi): Partial<Profil> {
  return {
    sexe: p.sexe || undefined,
    age: parseInt(p.age, 10) || 0,
    taille: parseInt(p.taille, 10) || 0,
    poids: parseInt(p.poids, 10) || 0, // comme le site : kg entiers
    objectifs: p.objectifs,
    seances: p.seances,
    job: p.job,
    grignotage: p.grignotage,
    plaisir: p.plaisir,
  };
}

function depuisProfil(p: Profil | null | undefined): ProfilSaisi {
  if (!p) return { ...PROFIL_VIDE };
  return {
    sexe: p.sexe,
    age: String(p.age),
    taille: String(p.taille),
    poids: String(p.poids),
    objectifs: p.objectifs ?? [],
    seances: p.seances,
    job: p.job,
    grignotage: p.grignotage ?? "—",
    plaisir: p.plaisir ?? "—",
  };
}

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

export function ClientsClient({
  clientsInitiaux,
  questionnairesInitiaux = [],
  emails,
  cleServicePresente,
}: {
  clientsInitiaux: Client[];
  questionnairesInitiaux?: Questionnaire[];
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

  function basculerObjectif(o: string) {
    if (!fiche) return;
    const liste = fiche.profil.objectifs.includes(o)
      ? fiche.profil.objectifs.filter((x) => x !== o)
      : [...fiche.profil.objectifs, o];
    changerProfil({ objectifs: liste });
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

      {questionnaires.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Inbox size={18} className="text-c2b-gold" />
            <h2 className="font-serif text-[22px] text-c2b-green">Questionnaires reçus</h2>
            <span className="pastille py-0.5 px-2">{questionnaires.length}</span>
          </div>
          <p className="text-xs text-c2b-muted">
            Remplis sur chef2box.com. Touchez « Créer son compte » : nom, email et objectifs sont déjà remplis.
          </p>
          {questionnaires.map((q) => (
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
              <button onClick={() => ouvrirDepuisQuestionnaire(q)} className="btn-gold w-full mt-3 py-2.5 text-sm">
                Créer son compte
              </button>
            </div>
          ))}
        </section>
      )}

      {clients.length === 0 ? (
        <div className="carte p-8 text-center text-sm text-c2b-muted">
          Aucun client pour l&apos;instant. Touchez « Nouveau client » pour créer le premier compte.
        </div>
      ) : (
        <div className="space-y-2.5">
          {clients.map((c) => (
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
                <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(["Homme", "Femme"] as const).map((sx) => (
                    <Pastille key={sx} active={fiche.profil.sexe === sx} onClick={() => changerProfil({ sexe: sx })} large>
                      {sx}
                    </Pastille>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["age", "Âge"],
                      ["taille", "Taille (cm)"],
                      ["poids", "Poids (kg)"],
                    ] as const
                  ).map(([cle, label]) => (
                    <Champ key={cle} label={label}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={fiche.profil[cle]}
                        onChange={(e) => changerProfil({ [cle]: e.target.value.replace(/[^0-9.,]/g, "") })}
                        className="champ px-3"
                      />
                    </Champ>
                  ))}
                </div>
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-c2b-muted mb-1.5">
                    Objectif (plusieurs possibles)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {OBJECTIFS.map((o) => (
                      <Pastille key={o} active={fiche.profil.objectifs.includes(o)} onClick={() => basculerObjectif(o)}>
                        {o}
                      </Pastille>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-c2b-muted mb-1.5">
                    Séances de sport par semaine
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {SEANCES.map((sc) => (
                      <Pastille key={sc} active={fiche.profil.seances === sc} onClick={() => changerProfil({ seances: sc })}>
                        {sc}
                      </Pastille>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Champ label="Travail">
                    <select
                      value={fiche.profil.job}
                      onChange={(e) => changerProfil({ job: e.target.value as Profil["job"] })}
                      className="champ px-2 text-sm"
                    >
                      {METIERS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </Champ>
                  <Champ label="Grignotage">
                    <select
                      value={fiche.profil.grignotage}
                      onChange={(e) => changerProfil({ grignotage: e.target.value as Profil["grignotage"] })}
                      className="champ px-2 text-sm"
                    >
                      {(["—", ...GRIGNOTAGE] as const).map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </Champ>
                </div>
                <Champ label="Rapport à la nourriture">
                  <select
                    value={fiche.profil.plaisir}
                    onChange={(e) => changerProfil({ plaisir: e.target.value as ProfilSaisi["plaisir"] })}
                    className="champ px-2 text-sm"
                  >
                    {PLAISIR.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </Champ>
                </div>
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
