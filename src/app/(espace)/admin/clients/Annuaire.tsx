"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, X } from "lucide-react";
import type { Client, Questionnaire } from "@/lib/types";
import { numeroValide } from "@/lib/telephone";
import type { FicheResume, RepasSemaine } from "@/app/(espace)/admin/clients/ClientsClient";

type Onglet = "prospects" | "clients" | "tous";

interface Entree {
  cle: string;
  href: string;
  nom: string;
  type: "client" | "prospect";
  palier: string | null;
  telephone: string | null;
  info: string;
  badge: { texte: string; ton: "vert" | "or" | "gris" | "rouge" } | null;
  recherche: string;
  semaine: boolean; // mange cette semaine ou la suivante
  aRelancer: boolean;
  appli: boolean;
  partenaire: boolean;
  sansWhatsApp: boolean;
  suivi: string | null; // prospects : a_contacter, contacte, pas_interesse
  ouvert: boolean; // a ouvert son lien
  tri: string;
}

const normaliser = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const fin9 = (t: string | null | undefined) => {
  const c = (t ?? "").replace(/\D/g, "");
  return c.length >= 9 ? c.slice(-9) : null;
};
// « fabien monti » → « Fabien Monti » (noms tapés en minuscules dans le questionnaire).
const joli = (n: string) => (n === n.toLowerCase() ? n.replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : n).trim();
const dateCourte = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

const FILTRES: Record<Onglet, { cle: string; libelle: string; garde: (e: Entree) => boolean }[]> = {
  clients: [
    { cle: "tous", libelle: "Tous", garde: () => true },
    { cle: "semaine", libelle: "Cette semaine", garde: (e) => e.semaine },
    { cle: "relance", libelle: "À relancer", garde: (e) => e.aRelancer },
    { cle: "appli", libelle: "Avec l'appli", garde: (e) => e.appli },
    { cle: "partenaires", libelle: "Partenaires", garde: (e) => e.partenaire },
    { cle: "sansWa", libelle: "Numéro à vérifier", garde: (e) => e.sansWhatsApp },
  ],
  prospects: [
    { cle: "tous", libelle: "Tous", garde: (e) => e.suivi !== "pas_interesse" },
    { cle: "a_contacter", libelle: "À contacter", garde: (e) => e.suivi === "a_contacter" },
    { cle: "contacte", libelle: "Contacté", garde: (e) => e.suivi === "contacte" },
    { cle: "ouverts", libelle: "Ont ouvert leur lien", garde: (e) => e.ouvert },
    { cle: "pas_interesse", libelle: "Pas intéressé", garde: (e) => e.suivi === "pas_interesse" },
    { cle: "sansWa", libelle: "Numéro à vérifier", garde: (e) => e.sansWhatsApp && e.suivi !== "pas_interesse" },
  ],
  tous: [{ cle: "tous", libelle: "Tous", garde: () => true }],
};

const TONS = {
  vert: "bg-emerald-600/10 text-emerald-700",
  or: "bg-c2b-gold/15 text-[#8a6420]",
  gris: "bg-c2b-cream-2 text-c2b-muted",
  rouge: "bg-red-600/10 text-red-700",
};

// Tout le monde au même endroit : prospects (questionnaire, jamais mangé),
// clients (ont déjà mangé ou ont l'appli), tous. Un nom → sa fiche.
export function Annuaire({
  fiches,
  questionnaires,
  comptes,
  repasSemaine,
  relance,
}: {
  fiches: FicheResume[];
  questionnaires: Questionnaire[];
  comptes: Client[];
  repasSemaine: RepasSemaine[];
  relance: { lundi: string; aujourdhui: string; dejaCommande: string[] } | null;
}) {
  const [onglet, setOnglet] = useState<Onglet>("clients");
  const [filtre, setFiltre] = useState("tous");
  const [recherche, setRecherche] = useState("");

  const entrees = useMemo(() => {
    const liste: Entree[] = [];
    const nomsSemaine = new Set(repasSemaine.map((r) => r.nom.trim().toLowerCase()));
    const comptesSemaine = new Set(repasSemaine.map((r) => r.clientId).filter(Boolean));
    const dejaCommande = new Set(relance?.dejaCommande ?? []);
    const il4Semaines = relance ? new Date(new Date(`${relance.aujourdhui}T12:00:00Z`).getTime() - 28 * 86400000).toISOString().slice(0, 10) : "";
    // Questionnaires : le plus récent par numéro (ou par nom sans numéro).
    const questionnaireDe = new Map<string, Questionnaire>();
    for (const q of questionnaires) {
      const k = fin9(q.telephone) ?? `n:${q.nom.trim().toLowerCase()}`;
      const deja = questionnaireDe.get(k);
      if (!deja || deja.created_at < q.created_at) questionnaireDe.set(k, q);
    }
    const questionnairesPris = new Set<string>();
    const numerosClients = new Set<string>();
    for (const q of questionnaires) if (q.suivi === "client" && fin9(q.telephone)) numerosClients.add(fin9(q.telephone)!);
    const comptesPris = new Set<string>();

    for (const f of fiches) {
      const n = fin9(f.telephone);
      const q = (n && questionnaireDe.get(n)) || questionnaireDe.get(`n:${f.nom.trim().toLowerCase()}`) || null;
      if (q) questionnairesPris.add(q.id);
      const compte = f.client_id ? comptes.find((c) => c.id === f.client_id) : undefined;
      if (compte) comptesPris.add(compte.id);
      const client = !!f.dernier || !!f.partenaire || !!compte || (!!n && numerosClients.has(n));
      const cleNom = f.nom.trim().toLowerCase();
      const semaine = nomsSemaine.has(cleNom) || (!!f.client_id && comptesSemaine.has(f.client_id));
      const aRelancer =
        client && !f.partenaire && !!f.dernier && f.dernier >= il4Semaines && !!n && !dejaCommande.has(cleNom) && !semaine;
      const suivi = client ? null : q?.suivi ?? "a_contacter";
      liste.push({
        cle: `f:${f.id}`,
        href: `/admin/clients/fiche?f=${f.id}`,
        nom: f.nom.trim(),
        type: client ? "client" : "prospect",
        palier: f.palier,
        telephone: f.telephone,
        info: client
          ? f.partenaire
            ? "Partenaire"
            : f.dernier
              ? `Dernier repas le ${dateCourte(f.dernier)}`
              : "Pas encore de repas"
          : q?.calories
            ? `${q.calories} kcal · questionnaire du ${dateCourte(q.created_at)}`
            : "Lien envoyé, pas encore commandé",
        badge: f.partenaire
          ? { texte: "Partenaire", ton: "or" }
          : semaine
            ? { texte: "Cette semaine", ton: "vert" }
            : aRelancer
              ? { texte: "À relancer", ton: "or" }
              : !client && f.vu_le
                ? { texte: "A ouvert", ton: "or" }
                : null,
        recherche: normaliser([f.nom, f.telephone, f.adresse, q?.email].filter(Boolean).join(" ")),
        semaine,
        aRelancer,
        appli: !!compte,
        partenaire: !!f.partenaire,
        sansWhatsApp: !f.partenaire && !numeroValide(f.telephone),
        suivi,
        ouvert: !!f.vu_le,
        tri: f.dernier ?? "",
      });
    }
    // Comptes de l'appli sans fiche de cuisine.
    for (const c of comptes) {
      if (comptesPris.has(c.id)) continue;
      liste.push({
        cle: `c:${c.id}`,
        href: `/admin/clients/fiche?c=${c.id}`,
        nom: c.nom.trim(),
        type: "client",
        palier: c.palier,
        telephone: c.telephone,
        info: `Compte appli depuis le ${dateCourte(c.created_at)}`,
        badge: comptesSemaine.has(c.id) ? { texte: "Cette semaine", ton: "vert" } : { texte: "Appli", ton: "gris" },
        recherche: normaliser([c.nom, c.telephone].filter(Boolean).join(" ")),
        semaine: comptesSemaine.has(c.id),
        aRelancer: false,
        appli: true,
        partenaire: false,
        sansWhatsApp: !numeroValide(c.telephone),
        suivi: null,
        ouvert: false,
        tri: c.created_at.slice(0, 10),
      });
    }
    // Questionnaires sans fiche : prospects (ou clients s'ils sont marqués « client »).
    for (const q of questionnaireDe.values()) {
      if (questionnairesPris.has(q.id)) continue;
      const client = q.suivi === "client";
      liste.push({
        cle: `q:${q.id}`,
        href: `/admin/clients/fiche?q=${q.id}`,
        nom: joli(q.nom),
        type: client ? "client" : "prospect",
        palier: q.palier,
        telephone: q.telephone,
        info: `${q.calories ? `${q.calories} kcal · ` : ""}questionnaire du ${dateCourte(q.created_at)}`,
        badge: client ? null : q.suivi === "contacte" ? { texte: "Contacté", ton: "gris" } : { texte: "À contacter", ton: "or" },
        recherche: normaliser([q.nom, q.telephone, q.email].filter(Boolean).join(" ")),
        semaine: false,
        aRelancer: false,
        appli: false,
        partenaire: false,
        sansWhatsApp: !numeroValide(q.telephone),
        suivi: client ? null : q.suivi ?? "a_contacter",
        ouvert: false,
        tri: q.created_at.slice(0, 10),
      });
    }
    return liste.sort((a, b) => Number(b.semaine) - Number(a.semaine) || b.tri.localeCompare(a.tri) || a.nom.localeCompare(b.nom, "fr"));
  }, [fiches, questionnaires, comptes, repasSemaine, relance]);

  const saisie = normaliser(recherche);
  const chiffres = recherche.replace(/\D/g, "");
  const correspond = (e: Entree) =>
    !saisie || e.recherche.includes(saisie) || (chiffres.length >= 4 && (e.telephone ?? "").replace(/\D/g, "").includes(chiffres));
  const dansOnglet = (e: Entree, o: Onglet) => o === "tous" || (o === "clients" ? e.type === "client" : e.type === "prospect");
  const nombre = (o: Onglet) => entrees.filter((e) => dansOnglet(e, o) && correspond(e) && (o !== "prospects" || e.suivi !== "pas_interesse")).length;
  const garde = (FILTRES[onglet].find((f) => f.cle === filtre) ?? FILTRES[onglet][0]).garde;
  const visibles = entrees.filter((e) => dansOnglet(e, onglet) && correspond(e) && garde(e));
  const [limite, setLimite] = useState(60);

  return (
    <section className="space-y-3">
      <div className="relative">
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-c2b-muted" />
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Nom ou numéro…"
          autoComplete="off"
          className="champ py-3.5 pl-10 pr-10"
        />
        {recherche && (
          <button
            onClick={() => setRecherche("")}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-c2b-muted"
            aria-label="Effacer la recherche"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-c2b-cream-2 p-1">
        {(["prospects", "clients", "tous"] as Onglet[]).map((o) => (
          <button
            key={o}
            onClick={() => {
              setOnglet(o);
              setFiltre("tous");
            }}
            className={`rounded-xl py-2.5 text-[13px] font-bold transition ${onglet === o ? "bg-white text-c2b-green shadow-sm" : "text-c2b-muted"}`}
          >
            {o === "prospects" ? "Prospects" : o === "clients" ? "Clients" : "Tous"} · {nombre(o)}
          </button>
        ))}
      </div>

      {FILTRES[onglet].length > 1 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {FILTRES[onglet].map((f) => {
            const n = entrees.filter((e) => dansOnglet(e, onglet) && correspond(e) && f.garde(e)).length;
            return (
              <button
                key={f.cle}
                onClick={() => setFiltre(f.cle)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                  filtre === f.cle ? "border-c2b-green bg-c2b-green text-c2b-cream" : "border-c2b-green/15 bg-white text-c2b-green"
                }`}
              >
                {f.libelle} ({n})
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-1.5">
        {visibles.slice(0, limite).map((e) => (
          <Link
            key={e.cle}
            href={e.href}
            className="flex items-center gap-3 rounded-2xl border border-transparent bg-white px-3 py-2.5 transition hover:border-c2b-gold/50 active:scale-[0.99]"
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                e.type === "client" ? "bg-c2b-green text-c2b-cream" : "bg-c2b-cream-2 text-c2b-gold"
              }`}
            >
              {e.nom
                .split(/\s+/)
                .map((m) => m[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-extrabold text-c2b-green">{e.nom}</span>
                {e.palier && <span className="shrink-0 rounded-full bg-c2b-gold/15 px-1.5 text-[10px] font-bold text-[#8a6420]">{e.palier}</span>}
              </span>
              <span className="block truncate text-xs text-c2b-muted">
                {onglet === "tous" && (e.type === "client" ? "Client · " : "Prospect · ")}
                {e.info}
              </span>
            </span>
            {e.sansWhatsApp && <span className="shrink-0 rounded-full bg-red-600/10 px-2 py-0.5 text-[10.5px] font-extrabold text-red-700">⚠️ N°</span>}
            {e.badge && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${TONS[e.badge.ton]}`}>{e.badge.texte}</span>}
            <ChevronRight size={16} className="shrink-0 text-c2b-muted/60" />
          </Link>
        ))}
        {visibles.length === 0 && (
          <p className="py-6 text-center text-sm text-c2b-muted">Personne ici. Essaie un autre filtre ou une autre recherche.</p>
        )}
        {visibles.length > limite && (
          <button onClick={() => setLimite((l) => l + 100)} className="btn-secondary w-full py-2.5 text-sm">
            Voir plus ({visibles.length - limite})
          </button>
        )}
      </div>
    </section>
  );
}
