"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Download, MessageCircle, Trash2 } from "lucide-react";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import { createClient } from "@/lib/supabase/client";

export interface Paiement {
  id: string;
  nom: string;
  client_id: string | null;
  montant: number; // dû (DH)
  recu: number; // encaissé (DH)
  moyen: Moyen | null;
  paye_le: string | null;
  note: string | null;
}

// Personne de la fiche cuisine du mois, avec son nombre de repas.
export interface PersonneMois {
  cle: string;
  nom: string;
  clientId: string | null;
  telephone: string | null;
  repas: number;
}

type Moyen = "especes" | "virement" | "carte" | "autre";
const MOYENS: Record<Moyen, string> = { especes: "Espèces", virement: "Virement", carte: "Carte", autre: "Autre" };

const dh = (n: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n)} DH`;
const sansAccents = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
const reste = (p: Paiement) => Math.max(0, p.montant - p.recu);
const estPaye = (p: Paiement) => p.montant > 0 && p.recu >= p.montant;

function libelleMois(mois: string) {
  const t = new Date(`${mois}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function decalerMois(mois: string, n: number) {
  const [a, m] = mois.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
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
  mois,
  aujourdhui,
  paiementsInitiaux,
  personnes,
}: {
  mois: string;
  aujourdhui: string;
  paiementsInitiaux: Paiement[];
  personnes: PersonneMois[];
}) {
  const supabase = createClient();
  const [paiements, setPaiements] = useState(paiementsInitiaux);
  const [filtre, setFiltre] = useState<"tous" | "non_payes" | "payes">("tous");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  // Personne liée à une ligne : même client, sinon même nom.
  const personneDe = (p: Paiement) =>
    personnes.find((x) => (p.client_id ? x.clientId === p.client_id : !x.clientId && sansAccents(x.nom) === sansAccents(p.nom))) ??
    personnes.find((x) => sansAccents(x.nom) === sansAccents(p.nom));

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


  async function supprimer(p: Paiement) {
    if (!window.confirm(`Supprimer la ligne de ${p.nom} pour ${libelleMois(mois).toLowerCase()} ?`)) return;
    const { error } = await supabase.from("application_paiements").delete().eq("id", p.id);
    if (error) return setMessage("Non supprimé, réessayez.");
    setPaiements((prev) => prev.filter((x) => x.id !== p.id));
  }

  // Export pour la comptabilité (ouvre dans Excel / Numbers / Google Sheets).
  function exporter() {
    const champ = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lignes = [
      ["Mois", "Nom", "Repas", "Montant (DH)", "Reçu (DH)", "Reste (DH)", "Statut", "Moyen", "Payé le", "Note"],
      ...[...paiements]
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
        .map((p) => [
          mois,
          p.nom,
          personneDe(p)?.repas ?? "",
          p.montant,
          p.recu,
          reste(p),
          estPaye(p) ? "Payé" : p.recu > 0 ? "Partiel" : "Non payé",
          p.moyen ? MOYENS[p.moyen] : "",
          p.paye_le ?? "",
          p.note ?? "",
        ]),
      [],
      ["", "TOTAL", "", totalDu, totalPaye, totalReste],
    ];
    const csv = "﻿" + lignes.map((l) => l.map(champ).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `paiements-chef2box-${mois}.csv`;
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
            href={`/admin/paiements?mois=${decalerMois(mois, -1)}`}
            className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
            aria-label="Mois précédent"
          >
            <ChevronLeft size={20} />
          </Link>
          <span className="min-w-[120px] text-center text-sm font-bold text-c2b-green">{libelleMois(mois)}</span>
          <Link
            href={`/admin/paiements?mois=${decalerMois(mois, 1)}`}
            className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
            aria-label="Mois suivant"
          >
            <ChevronRight size={20} />
          </Link>
        </div>
      </div>

      <p className="-mt-2 text-sm text-c2b-muted">
        <Link href="/admin/cuisine" className="font-semibold text-c2b-green underline">
          Cuisine
        </Link>{" "}
        →{" "}
        <Link href="/admin/livraison" className="font-semibold text-c2b-green underline">
          Livraison
        </Link>{" "}
        → <strong className="text-c2b-green">Paiements</strong> : chaque personne de la fiche cuisine du mois a sa ligne.
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
                ce mois-ci.
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
                    {personne?.repas ? <span className="text-c2b-muted"> · {personne.repas} repas</span> : null}
                  </p>
                </button>
                <label className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    defaultValue={p.montant || ""}
                    onBlur={(e) => {
                      const montant = Math.max(0, Math.round((Number(e.target.value.replace(",", ".")) || 0) * 100) / 100);
                      if (montant !== p.montant) modifier(p, paye ? { montant, recu: montant } : { montant });
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
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs font-bold text-c2b-muted">
                      Reçu (DH)
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        defaultValue={p.recu || ""}
                        onBlur={(e) => {
                          const recu = Math.max(0, Math.round((Number(e.target.value.replace(",", ".")) || 0) * 100) / 100);
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
                          `Bonjour ${p.nom.split(/\s+/)[0]} ! Petit rappel pour le règlement Chef2Box de ${libelleMois(mois).toLowerCase()} : ${dh(reste(p))}. Merci beaucoup 🙏`
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
                    {personne?.repas ? (
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

      {/* Comptabilité du mois */}
      <section className="carte p-4">
        <h2 className="font-serif text-2xl text-c2b-green">Comptabilité · {libelleMois(mois)}</h2>
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
          <Download size={15} /> Exporter le mois (Excel / CSV)
        </button>
      </section>
    </main>
  );
}
