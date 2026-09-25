"use client";

import { useState } from "react";
import { Plus, X, KeyRound, Pencil, Copy, Check, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AdminOnglets } from "@/app/admin/AdminOnglets";
import { PALIERS, repartirMacros } from "@/lib/objectifs";
import type { Client, Palier } from "@/lib/types";

type Fiche = {
  id?: string;
  nom: string;
  email: string;
  telephone: string;
  indicatif: string;
  palier: Palier | "";
  calories: string;
  proteines: string;
  glucides: string;
  lipides: string;
};

type Acces = { nom: string; email: string; motDePasse: string; telephone: string | null };

const MACROS_2000 = repartirMacros(2000);
const FICHE_VIDE: Fiche = {
  nom: "",
  email: "",
  telephone: "",
  indicatif: "+212",
  palier: "",
  calories: "2000",
  proteines: String(MACROS_2000.proteines),
  glucides: String(MACROS_2000.glucides),
  lipides: String(MACROS_2000.lipides),
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
  emails,
  cleServicePresente,
}: {
  clientsInitiaux: Client[];
  emails: Record<string, string>;
  cleServicePresente: boolean;
}) {
  const supabase = createClient();
  const [clients, setClients] = useState(clientsInitiaux);
  const [emailsConnus, setEmailsConnus] = useState(emails);
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [macrosManuelles, setMacrosManuelles] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [acces, setAcces] = useState<Acces | null>(null);
  const [copie, setCopie] = useState(false);

  function ouvrirNouveau() {
    setErreur("");
    setMacrosManuelles(false);
    setFiche({ ...FICHE_VIDE });
  }

  function ouvrirEdition(c: Client) {
    setErreur("");
    setMacrosManuelles(true);
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
    });
  }

  function changerCalories(texte: string) {
    if (!fiche) return;
    const kcal = parseInt(texte, 10);
    const suivant = { ...fiche, calories: texte };
    if (!macrosManuelles && Number.isFinite(kcal)) {
      const m = repartirMacros(kcal);
      Object.assign(suivant, { proteines: String(m.proteines), glucides: String(m.glucides), lipides: String(m.lipides) });
    }
    setFiche(suivant);
  }

  function repartir() {
    if (!fiche) return;
    const m = repartirMacros(parseInt(fiche.calories, 10) || 0);
    setFiche({ ...fiche, proteines: String(m.proteines), glucides: String(m.glucides), lipides: String(m.lipides) });
    setMacrosManuelles(false);
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
    if (Object.values(objectifs).some((v) => !Number.isFinite(v))) return setErreur("Renseignez tous les objectifs.");

    setEnCours(true);
    if (fiche.id) {
      const { data, error } = await supabase
        .from("application_clients")
        .update({ nom: fiche.nom.trim(), telephone: numeroInternational(fiche.indicatif, fiche.telephone), palier: fiche.palier || null, ...objectifs })
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
          ...objectifs,
          est_admin: false,
          created_at: new Date().toISOString(),
        },
      ].sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
    );
    setEmailsConnus((prev) => ({ ...prev, [resultat.id]: resultat.email }));
    setFiche(null);
    setCopie(false);
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
                        {i.pays} {i.code}
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

              <div className="flex items-center justify-between pt-1">
                <p className="text-xs font-bold uppercase tracking-wider text-c2b-muted">Objectifs par jour</p>
                <button onClick={repartir} className="text-xs font-bold text-c2b-gold">
                  Répartir 30 / 40 / 30
                </button>
              </div>
              <Champ label="Calories (kcal)">
                <input
                  type="text"
                  inputMode="numeric"
                  value={fiche.calories}
                  onChange={(e) => changerCalories(e.target.value.replace(/\D/g, ""))}
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
                      onChange={(e) => {
                        setMacrosManuelles(true);
                        setFiche({ ...fiche, [cle]: e.target.value.replace(/\D/g, "") });
                      }}
                      className="champ px-3"
                    />
                  </Champ>
                ))}
              </div>
              <p className="text-[11px] text-c2b-muted">
                Les macros se calculent seules à partir des calories (30 % protéines, 40 % glucides, 30 % lipides).
                Vous pouvez les ajuster à la main.
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
