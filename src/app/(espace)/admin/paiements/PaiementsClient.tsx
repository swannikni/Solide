"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Download, MessageCircle, RotateCcw, Trash2 } from "lucide-react";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import { createClient } from "@/lib/supabase/client";
import { montantAuto, prixSemaine, type SemaineRepas, type Tarifs } from "@/lib/paiements";
import { decalerDate } from "@/lib/dates";

export interface Paiement {
  id: string;
  nom: string;
  client_id: string | null;
  montant: number; // dû (DH)
  montant_manuel: boolean; // modifié à la main : plus recalculé
  recu: number; // encaissé (DH)
  moyen: Moyen | null;
  paye_le: string | null;
  note: string | null;
}

// Personne de la fiche cuisine de la semaine : repas, formule, offre éventuelle.
export interface PersonneMois {
  cle: string; // « c:<client> » ou « n:<nom en minuscules> »
  nom: string;
  clientId: string | null;
  telephone: string | null;
  repas: number;
  semaines: SemaineRepas[];
  offre: Offre | null;
  montantAuto: number;
}
type Offre = { prix: number; note: string | null };

type Moyen = "especes" | "virement" | "carte" | "autre";
const MOYENS: Record<Moyen, string> = { especes: "Espèces", virement: "Virement", carte: "Carte", autre: "Autre" };

const dh = (n: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n)} DH`;
const sansAccents = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
const cleDe = (p: Paiement) => (p.client_id ? `c:${p.client_id}` : `n:${p.nom.trim().toLowerCase()}`);
const nombre = (texte: string) => Math.max(0, Math.round((Number(texte.replace(",", ".")) || 0) * 100) / 100);
const dateCourte = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const reste = (p: Paiement) => Math.max(0, p.montant - p.recu);
const estPaye = (p: Paiement) => p.montant > 0 && p.recu >= p.montant;

// « du 5 au 9 oct. » (lundi → vendredi)
function libelleSemaine(lundi: string) {
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { ...o, timeZone: "UTC" });
  const vendredi = decalerDate(lundi, 4);
  const memeMois = lundi.slice(0, 7) === vendredi.slice(0, 7);
  return `du ${f(lundi, memeMois ? { day: "numeric" } : { day: "numeric", month: "short" })} au ${f(vendredi, { day: "numeric", month: "short" })}`;
}
function libelleMois(lundi: string) {
  const t = new Date(`${lundi}T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });
  return t;
}

// Numéro marocain → format international pour wa.me (0612… → 212612…).
function numeroWhatsApp(telephone: string | null) {
  if (!telephone) return "";
  let n = telephone.replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  else if (n.length === 10 && n.startsWith("0")) n = `212${n.slice(1)}`;
  return n.length >= 8 ? n : "";
}

export function PaiementsClient({
  semaine,
  autresSemainesDuMois,
  aujourdhui,
  paiementsInitiaux,
  personnes,
  tarifsInitiaux,
}: {
  semaine: string; // lundi
  // Les autres semaines du même mois (lundi dans le mois), pour le récapitulatif.
  autresSemainesDuMois: { semaines: number; du: number; encaisse: number };
  aujourdhui: string;
  paiementsInitiaux: Paiement[];
  personnes: PersonneMois[];
  tarifsInitiaux: Tarifs;
}) {
  const supabase = createClient();
  const [paiements, setPaiements] = useState(paiementsInitiaux);
  const [filtre, setFiltre] = useState<"tous" | "non_payes" | "payes">("tous");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [tarifs, setTarifs] = useState(tarifsInitiaux);
  const [offres, setOffres] = useState(() => new Map(personnes.filter((x) => x.offre).map((x) => [x.cle, x.offre!])));

  // Personne de la fiche cuisine liée à une ligne : même client, sinon même nom.
  const parCle = new Map(personnes.map((x) => [x.cle, x]));
  const personneDe = (p: Paiement) => parCle.get(cleDe(p)) ?? personnes.find((x) => sansAccents(x.nom) === sansAccents(p.nom));
  const autoDe = (x: PersonneMois, t = tarifs, o = offres) => montantAuto(x.semaines, t, o.get(x.cle)?.prix ?? null);

  const totalDu = paiements.reduce((t, p) => t + p.montant, 0);
  const totalPaye = paiements.reduce((t, p) => t + Math.min(p.recu, p.montant || p.recu), 0);
  const totalReste = paiements.reduce((t, p) => t + reste(p), 0);
  const nbPayes = paiements.filter(estPaye).length;
  const sansMontant = paiements.filter((p) => p.montant === 0).length;
  const parMoyen = (Object.keys(MOYENS) as Moyen[])
    .map((m) => ({ moyen: m, total: paiements.filter((p) => p.moyen === m).reduce((t, p) => t + p.recu, 0) }))
    .filter((x) => x.total > 0);
  const recuSansMoyen = paiements.filter((p) => !p.moyen).reduce((t, p) => t + p.recu, 0);

  const affiches = paiements
    .filter((p) => (filtre === "payes" ? estPaye(p) : filtre === "non_payes" ? !estPaye(p) : true))
    .sort((a, b) => Number(estPaye(a)) - Number(estPaye(b)) || a.nom.localeCompare(b.nom, "fr"));

  async function modifier(p: Paiement, maj: Partial<Omit<Paiement, "id">>) {
    const avant = paiements;
    setPaiements((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...maj } : x)));
    const { error } = await supabase.from("application_paiements").update(maj).eq("id", p.id);
    if (error) {
      setPaiements(avant);
      setMessage("Non enregistré, réessayez.");
    } else setMessage("");
  }

  // Case « payé » : tout le montant reçu aujourd'hui, ou on annule.
  function basculer(p: Paiement) {
    if (estPaye(p)) return modifier(p, { recu: 0, paye_le: null });
    if (p.montant === 0) {
      setOuvert(p.id);
      return setMessage(`Indiquez d'abord le montant de ${p.nom}.`);
    }
    return modifier(p, { recu: p.montant, paye_le: p.paye_le ?? aujourdhui, moyen: p.moyen ?? "especes" });
  }

  // Montant tapé à la main : gardé tel quel (offre, geste…), sauf s'il
  // redevient égal au calcul.
  function changerMontant(p: Paiement, montant: number) {
    const personne = personneDe(p);
    const manuel = !personne || montant !== autoDe(personne);
    const paye = estPaye(p);
    return modifier(p, { montant, montant_manuel: manuel, ...(paye ? { recu: montant } : {}) });
  }

  // Lignes non modifiées à la main : montant recalculé (tarifs ou offre changés).
  async function recalculer(t: Tarifs, o: Map<string, Offre>, seulement?: string) {
    const maj = paiements
      .filter((p) => !p.montant_manuel && (!seulement || cleDe(p) === seulement))
      .map((p) => ({ p, personne: personneDe(p) }))
      .filter((x): x is { p: Paiement; personne: PersonneMois } => !!x.personne && autoDe(x.personne, t, o) !== x.p.montant);
    await Promise.all(maj.map(({ p, personne }) => modifier(p, { montant: autoDe(personne, t, o) })));
  }

  async function enregistrerTarifs(nouveaux: Tarifs) {
    setTarifs(nouveaux);
    const { error } = await supabase.from("application_parametres").upsert({ cle: "tarifs", valeur: nouveaux });
    if (error) return setMessage("Tarifs non enregistrés, réessayez.");
    await recalculer(nouveaux, offres);
  }

  // Offre d'une personne : son prix par semaine, gardé pour les mois suivants.
  async function enregistrerOffre(x: PersonneMois, offre: Offre | null) {
    const { error } = offre
      ? await supabase
          .from("application_tarifs_perso")
          .upsert({ cle: x.cle, prix_semaine: offre.prix, note: offre.note, updated_at: new Date().toISOString() })
      : await supabase.from("application_tarifs_perso").delete().eq("cle", x.cle);
    if (error) return setMessage("Offre non enregistrée, réessayez.");
    const nouvelles = new Map(offres);
    if (offre) nouvelles.set(x.cle, offre);
    else nouvelles.delete(x.cle);
    setOffres(nouvelles);
    await recalculer(tarifs, nouvelles, x.cle);
  }

  async function supprimer(p: Paiement) {
    if (!window.confirm(`Supprimer la ligne de ${p.nom} pour la semaine ${libelleSemaine(semaine)} ?`)) return;
    const { error } = await supabase.from("application_paiements").delete().eq("id", p.id);
    if (error) return setMessage("Non supprimé, réessayez.");
    setPaiements((prev) => prev.filter((x) => x.id !== p.id));
  }

  // Export pour la comptabilité (ouvre dans Excel / Numbers / Google Sheets).
  function exporter() {
    const champ = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lignes = [
      ["Semaine (lundi)", "Nom", "Repas", "Formule", "Montant (DH)", "Montant", "Reçu (DH)", "Reste (DH)", "Statut", "Moyen", "Payé le", "Note"],
      ...[...paiements]
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
        .map((p) => [
          semaine,
          p.nom,
          personneDe(p)?.repas ?? "",
          personneDe(p)?.semaines[0] ? `${personneDe(p)!.semaines[0].formule} repas/j` : "",
          p.montant,
          p.montant_manuel ? "Modifié à la main" : offres.has(cleDe(p)) ? "Offre" : "Tarif",
          p.recu,
          reste(p),
          estPaye(p) ? "Payé" : p.recu > 0 ? "Partiel" : "Non payé",
          p.moyen ? MOYENS[p.moyen] : "",
          p.paye_le ?? "",
          p.note ?? "",
        ]),
      [],
      ["", "TOTAL", "", "", totalDu, "", totalPaye, totalReste],
    ];
    const csv = "﻿" + lignes.map((l) => l.map(champ).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `paiements-chef2box-semaine-${semaine}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
      <AdminOnglets />
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="lbl mb-2">Espace admin</span>
          <h1 className="titre text-[34px]">
            <em>Paiements</em>
          </h1>
        </div>
        <div className="flex items-center gap-1 pb-1">
          <Link
            href={`/admin/paiements?semaine=${decalerDate(semaine, -7)}`}
            className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
            aria-label="Semaine précédente"
          >
            <ChevronLeft size={20} />
          </Link>
          <span className="min-w-[120px] text-center text-sm font-bold leading-tight text-c2b-green">
            Semaine
            <span className="block text-xs font-semibold">{libelleSemaine(semaine)}</span>
          </span>
          <Link
            href={`/admin/paiements?semaine=${decalerDate(semaine, 7)}`}
            className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
            aria-label="Semaine suivante"
          >
            <ChevronRight size={20} />
          </Link>
        </div>
      </div>

      <p className="-mt-2 text-sm text-c2b-muted">
        <Link href="/admin/cuisine" className="font-semibold text-c2b-green underline">
          Cuisine
        </Link>{" "}
        → <strong className="text-c2b-green">Paiements</strong> : chaque personne de la fiche cuisine de la semaine a sa ligne. Chaque lundi, on repart à zéro.
      </p>

      {/* Totaux */}
      <section className="grid grid-cols-2 gap-2">
        <div className="carte p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Total payé</p>
          <p className="mt-1 font-serif text-[28px] leading-none text-emerald-800">{dh(totalPaye)}</p>
          <p className="mt-1 text-xs text-c2b-muted">
            {nbPayes}/{paiements.length} client{paiements.length > 1 ? "s" : ""} à jour
          </p>
        </div>
        <div className={`carte p-4 ${totalReste > 0 ? "border-red-200" : ""}`}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-red-700">Total non payé</p>
          <p className="mt-1 font-serif text-[28px] leading-none text-red-700">{dh(totalReste)}</p>
          <p className="mt-1 text-xs text-c2b-muted">reste à encaisser</p>
        </div>
      </section>

      {message && <p className="text-sm font-semibold text-red-700">{message}</p>}

      {/* Filtres */}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["tous", `Tous (${paiements.length})`],
            ["non_payes", `Non payés (${paiements.length - nbPayes})`],
            ["payes", `Payés (${nbPayes})`],
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

      {/* Lignes */}
      <section className="carte divide-y divide-black/5 overflow-hidden">
        {affiches.length === 0 && (
          <p className="p-5 text-center text-sm text-c2b-muted">
            {paiements.length ? (
              "Personne dans ce filtre."
            ) : (
              <>
                Personne dans la{" "}
                <Link href="/admin/cuisine" className="font-bold text-c2b-green underline">
                  fiche cuisine
                </Link>{" "}
                cette semaine.
              </>
            )}
          </p>
        )}
        {affiches.map((p) => {
          const paye = estPaye(p);
          const personne = personneDe(p);
          const numero = numeroWhatsApp(personne?.telephone ?? null);
          return (
            <div key={p.id} className={paye ? "bg-emerald-50/40" : ""}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => basculer(p)}
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border-2 ${
                    paye ? "border-emerald-600 bg-emerald-600 text-white" : "border-c2b-green/30 bg-white"
                  }`}
                  aria-label={paye ? `${p.nom} : payé (annuler)` : `Marquer ${p.nom} comme payé`}
                  aria-pressed={paye}
                >
                  {paye && <Check size={16} strokeWidth={3} />}
                </button>
                <button onClick={() => setOuvert(ouvert === p.id ? null : p.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-bold text-c2b-green">{p.nom}</p>
                  <p className={`text-xs ${paye ? "text-emerald-700" : p.recu > 0 ? "text-amber-700" : p.montant ? "text-red-700" : "text-c2b-muted"}`}>
                    {paye
                      ? `Payé${p.paye_le ? ` le ${new Date(`${p.paye_le}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}${p.moyen ? ` · ${MOYENS[p.moyen]}` : ""}`
                      : p.recu > 0
                        ? `Partiel : ${dh(p.recu)} reçus · reste ${dh(reste(p))}`
                        : p.montant
                          ? "Non payé"
                          : "Montant à indiquer"}
                    {personne ? (
                      <span className="text-c2b-muted">
                        {" "}
                        · {personne.semaines.length} sem. · {personne.repas} repas
                        {p.montant_manuel ? " · ✎ modifié" : offres.has(personne.cle) ? " · offre" : ""}
                      </span>
                    ) : null}
                  </p>
                </button>
                <label className="flex items-center gap-1">
                  <input
                    key={`${p.id}-${p.montant}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    defaultValue={p.montant || ""}
                    onBlur={(e) => {
                      const montant = nombre(e.target.value);
                      if (montant !== p.montant) changerMontant(p, montant);
                    }}
                    placeholder="0"
                    className="champ w-[84px] px-2 py-1.5 text-right text-sm font-bold"
                    aria-label={`Montant de ${p.nom}`}
                  />
                  <span className="text-xs font-bold text-c2b-muted">DH</span>
                </label>
                <button
                  onClick={() => setOuvert(ouvert === p.id ? null : p.id)}
                  className="p-1 text-c2b-muted"
                  aria-label={`Détails de ${p.nom}`}
                  aria-expanded={ouvert === p.id}
                >
                  <ChevronDown size={18} className={`transition ${ouvert === p.id ? "rotate-180" : ""}`} />
                </button>
              </div>

              {ouvert === p.id && (
                <div className="space-y-2 bg-c2b-cream/50 px-4 pb-4 pt-2">
                  {personne && (
                    <div className="rounded-xl bg-white p-3 text-xs">
                      <p className="font-bold text-c2b-green">Calcul d&apos;après la fiche cuisine</p>
                      <ul className="mt-1 space-y-0.5">
                        {personne.semaines.map((s) => (
                          <li key={s.lundi} className="flex justify-between gap-2">
                            <span className={s.jours < 5 ? "text-amber-700" : "text-c2b-text"}>
                              Sem. du {dateCourte(s.lundi)} · {s.jours} j · {s.formule} repas/j{s.jours < 5 ? " ⚠️ incomplète" : ""}
                            </span>
                            <span className="whitespace-nowrap tabular-nums font-semibold">{dh(prixSemaine(s, tarifs, offres.get(personne.cle)?.prix ?? null))}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 flex justify-between border-t border-black/5 pt-1 font-bold text-c2b-green">
                        <span>Total calculé</span>
                        <span className="tabular-nums">{dh(autoDe(personne))}</span>
                      </p>
                      {p.montant_manuel && (
                        <button
                          onClick={() => modifier(p, { montant: autoDe(personne), montant_manuel: false, ...(paye ? { recu: autoDe(personne) } : {}) })}
                          className="mt-1.5 inline-flex items-center gap-1 font-semibold text-c2b-gold"
                        >
                          <RotateCcw size={12} /> Montant modifié à la main : revenir au calcul ({dh(autoDe(personne))})
                        </button>
                      )}
                      <div className="mt-2 grid grid-cols-[110px_1fr] gap-2 border-t border-black/5 pt-2">
                        <label className="block font-bold text-c2b-muted">
                          Offre / semaine
                          <input
                            key={`offre-${offres.get(personne.cle)?.prix ?? ""}`}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            defaultValue={offres.get(personne.cle)?.prix ?? ""}
                            onBlur={(e) => {
                              const texte = e.target.value.trim();
                              const actuelle = offres.get(personne.cle) ?? null;
                              if (!texte) return actuelle && enregistrerOffre(personne, null);
                              const prix = nombre(texte);
                              if (prix !== actuelle?.prix) enregistrerOffre(personne, { prix, note: actuelle?.note ?? null });
                            }}
                            placeholder="DH"
                            className="champ mt-1 px-2 py-1.5 text-sm"
                          />
                        </label>
                        <label className="block font-bold text-c2b-muted">
                          Raison de l&apos;offre
                          <input
                            key={`note-${offres.get(personne.cle)?.note ?? ""}`}
                            defaultValue={offres.get(personne.cle)?.note ?? ""}
                            disabled={!offres.has(personne.cle)}
                            onBlur={(e) => {
                              const actuelle = offres.get(personne.cle);
                              const note = e.target.value.trim().slice(0, 120) || null;
                              if (actuelle && note !== actuelle.note) enregistrerOffre(personne, { ...actuelle, note });
                            }}
                            placeholder="parrainage, -10 %…"
                            maxLength={120}
                            className="champ mt-1 py-1.5 text-sm disabled:opacity-50"
                          />
                        </label>
                      </div>
                      <p className="mt-1 text-[11px] text-c2b-muted">
                        L&apos;offre remplace le tarif, cette semaine et les suivantes. Videz la case pour l&apos;enlever.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs font-bold text-c2b-muted">
                      Reçu (DH)
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        defaultValue={p.recu || ""}
                        key={`recu-${p.recu}`}
                        onBlur={(e) => {
                          const recu = nombre(e.target.value);
                          if (recu !== p.recu) modifier(p, { recu, paye_le: recu > 0 ? p.paye_le ?? aujourdhui : null });
                        }}
                        placeholder="0"
                        className="champ mt-1 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-xs font-bold text-c2b-muted">
                      Payé le
                      <input
                        type="date"
                        defaultValue={p.paye_le ?? ""}
                        onBlur={(e) => e.target.value !== (p.paye_le ?? "") && modifier(p, { paye_le: e.target.value || null })}
                        className="champ mt-1 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(Object.keys(MOYENS) as Moyen[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => modifier(p, { moyen: p.moyen === m ? null : m })}
                        className={`rounded-full py-1.5 text-xs font-bold ${
                          p.moyen === m ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-green"
                        }`}
                      >
                        {MOYENS[m]}
                      </button>
                    ))}
                  </div>
                  <input
                    defaultValue={p.note ?? ""}
                    onBlur={(e) => {
                      const note = e.target.value.trim().slice(0, 200) || null;
                      if (note !== p.note) modifier(p, { note });
                    }}
                    placeholder="Note (formule, semaine, remise…)"
                    maxLength={200}
                    className="champ py-2 text-sm"
                  />
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {!paye && reste(p) > 0 && numero ? (
                      <a
                        href={`https://wa.me/${numero}?text=${encodeURIComponent(
                          `Bonjour ${p.nom.split(/\s+/)[0]} ! Petit rappel pour le règlement Chef2Box de la semaine ${libelleSemaine(semaine)} : ${dh(reste(p))}. Merci beaucoup 🙏`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-2 text-xs font-bold text-white"
                      >
                        <MessageCircle size={14} /> Rappel WhatsApp
                      </a>
                    ) : (
                      <span />
                    )}
                    {personne ? (
                      <span className="text-[11px] text-c2b-muted">Vient de la fiche cuisine</span>
                    ) : (
                      <button onClick={() => supprimer(p)} className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                        <Trash2 size={14} /> Supprimer
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Tarifs */}
      <section className="carte p-4">
        <h2 className="font-bold text-c2b-green">Tarifs par semaine (du lundi au vendredi)</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              ["un_repas", "1 repas par jour"],
              ["deux_repas", "2 repas par jour"],
            ] as const
          ).map(([cle, libelle]) => (
            <label key={cle} className="block text-xs font-bold text-c2b-muted">
              {libelle}
              <span className="mt-1 flex items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  defaultValue={tarifs[cle]}
                  onBlur={(e) => {
                    const prix = nombre(e.target.value);
                    if (prix > 0 && prix !== tarifs[cle]) enregistrerTarifs({ ...tarifs, [cle]: prix });
                  }}
                  className="champ py-2 text-sm font-bold"
                />
                <span>DH</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-c2b-muted">
          Une formule par semaine pour chaque personne de la fiche cuisine (2 repas si midi et soir un même jour). Les montants
          modifiés à la main ne bougent pas.
        </p>
      </section>

      {/* Comptabilité de la semaine */}
      <section className="carte p-4">
        <h2 className="font-serif text-2xl text-c2b-green">Comptabilité · semaine {libelleSemaine(semaine)}</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-c2b-muted">Chiffre d&apos;affaires attendu</dt>
            <dd className="font-bold tabular-nums text-c2b-green">{dh(totalDu)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-c2b-muted">Encaissé</dt>
            <dd className="font-bold tabular-nums text-emerald-700">{dh(totalPaye)}</dd>
          </div>
          {parMoyen.map((x) => (
            <div key={x.moyen} className="flex justify-between pl-4 text-xs">
              <dt className="text-c2b-muted">dont {MOYENS[x.moyen].toLowerCase()}</dt>
              <dd className="tabular-nums text-c2b-text">{dh(x.total)}</dd>
            </div>
          ))}
          {recuSansMoyen > 0 && (
            <div className="flex justify-between pl-4 text-xs">
              <dt className="text-c2b-muted">dont moyen non indiqué</dt>
              <dd className="tabular-nums text-c2b-text">{dh(recuSansMoyen)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-black/5 pt-1.5">
            <dt className="font-bold text-c2b-green">Reste à encaisser</dt>
            <dd className="font-bold tabular-nums text-red-700">{dh(totalReste)}</dd>
          </div>
        </dl>
        {autresSemainesDuMois.semaines > 0 && (
          <div className="mt-3 rounded-xl bg-c2b-cream/60 px-3 py-2 text-xs">
            <p className="font-bold text-c2b-green">
              Mois de {libelleMois(semaine)} ({autresSemainesDuMois.semaines + 1} semaines)
            </p>
            <p className="mt-0.5 flex justify-between">
              <span className="text-c2b-muted">Encaissé / attendu</span>
              <span className="tabular-nums font-semibold">
                {dh(autresSemainesDuMois.encaisse + totalPaye)} / {dh(autresSemainesDuMois.du + totalDu)}
              </span>
            </p>
          </div>
        )}
        {sansMontant > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            {sansMontant} ligne{sansMontant > 1 ? "s" : ""} sans montant : pas encore comptée{sansMontant > 1 ? "s" : ""}.
          </p>
        )}
        <button
          onClick={exporter}
          disabled={!paiements.length}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-c2b-green/20 bg-white py-2.5 text-sm font-bold text-c2b-green disabled:opacity-40"
        >
          <Download size={15} /> Exporter la semaine (Excel / CSV)
        </button>
      </section>
    </main>
  );
}
