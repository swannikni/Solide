"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Share2 } from "lucide-react";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import { decalerDate } from "@/lib/dates";
import { PaiementsOnglets } from "@/app/(espace)/admin/paiements/PaiementsOnglets";
import { CATEGORIES, type CategorieDepense } from "@/lib/depenses";

export interface LigneBilan {
  semaine: string;
  nom: string;
  montant: number;
  recu: number;
  moyen: "especes" | "virement" | "carte" | "autre" | null;
  montant_manuel: boolean;
}

const MOYENS = { especes: "Espèces", virement: "Virement", carte: "Carte", autre: "Autre" } as const;
const dh = (n: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n))} DH`;
// Montant vide mais paiement reçu : le reçu fait office de montant.
const attendu = (l: { montant: number; recu: number }) => l.montant || l.recu;
const encaisse = (l: { montant: number; recu: number }) => Math.min(l.recu, attendu(l));
const reste = (l: { montant: number; recu: number }) => Math.max(0, l.montant - l.recu);

function nomMois(mois: string, annee = true) {
  const t = new Date(`${mois}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", ...(annee ? { year: "numeric" } : {}), timeZone: "UTC" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function decalerMois(mois: string, n: number) {
  const [a, m] = mois.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}
function libelleSemaine(lundi: string) {
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { ...o, timeZone: "UTC" });
  const vendredi = decalerDate(lundi, 4);
  const memeMois = lundi.slice(0, 7) === vendredi.slice(0, 7);
  return `${f(lundi, memeMois ? { day: "numeric" } : { day: "numeric", month: "short" })} – ${f(vendredi, { day: "numeric", month: "short" })}`;
}

export function BilanClient({
  mois,
  moisEnCours,
  lignes,
  repasMidi,
  repasSoir,
  precedent,
  lundis,
  depenses,
}: {
  mois: string;
  moisEnCours: boolean;
  lignes: LigneBilan[];
  repasMidi: number;
  repasSoir: number;
  precedent: { mois: string; du: number; encaisse: number };
  lundis: string[];
  depenses: { categorie: CategorieDepense; montant: number }[];
}) {
  const totalDepenses = depenses.reduce((t, d) => t + d.montant, 0);
  const depensesParCategorie = CATEGORIES.map((c) => ({
    ...c,
    total: depenses.filter((d) => d.categorie === c.cle).reduce((t, d) => t + d.montant, 0),
  })).filter((c) => c.total > 0);
  const du = lignes.reduce((t, l) => t + attendu(l), 0);
  const recu = lignes.reduce((t, l) => t + encaisse(l), 0);
  const resteTotal = lignes.reduce((t, l) => t + reste(l), 0);
  const taux = du > 0 ? Math.round((recu / du) * 100) : 0;
  const clients = new Set(lignes.map((l) => l.nom.trim().toLowerCase())).size;
  const formulesVendues = lignes.filter((l) => attendu(l) > 0).length;
  const panierMoyen = formulesVendues ? du / formulesVendues : 0;
  const evolution = precedent.encaisse > 0 ? Math.round(((recu - precedent.encaisse) / precedent.encaisse) * 100) : null;

  const semaines = lundis.map((lundi) => {
    const l = lignes.filter((x) => x.semaine === lundi);
    return {
      lundi,
      clients: l.length,
      payes: l.filter((x) => attendu(x) > 0 && x.recu >= attendu(x)).length,
      du: l.reduce((t, x) => t + attendu(x), 0),
      recu: l.reduce((t, x) => t + encaisse(x), 0),
      reste: l.reduce((t, x) => t + reste(x), 0),
    };
  });
  // Semaines vides avant la première semaine payée (avant le lancement) : masquées.
  const premiere = semaines.findIndex((s) => s.clients > 0);
  const semainesAffichees = premiere > 0 ? semaines.slice(premiere) : semaines;
  const maxSemaine = Math.max(1, ...semaines.map((s) => s.du));

  const parMoyen = (Object.keys(MOYENS) as (keyof typeof MOYENS)[])
    .map((m) => ({ m, total: lignes.filter((l) => l.moyen === m).reduce((t, l) => t + encaisse(l), 0) }))
    .filter((x) => x.total > 0);

  // Qui doit encore quelque chose sur le mois (toutes semaines confondues).
  const dettes = new Map<string, { nom: string; reste: number; semaines: number }>();
  for (const l of lignes) {
    const r = reste(l);
    if (r <= 0) continue;
    const cle = l.nom.trim().toLowerCase();
    const d = dettes.get(cle) ?? { nom: l.nom, reste: 0, semaines: 0 };
    d.reste += r;
    d.semaines++;
    dettes.set(cle, d);
  }
  const aRelancer = [...dettes.values()].sort((a, b) => b.reste - a.reste);

  const texteBilan = [
    `*Bilan Chef2Box — ${nomMois(mois)}*${moisEnCours ? " (en cours)" : ""}`,
    `Encaissé : *${dh(recu)}* sur ${dh(du)} attendus (${taux} %)`,
    `Reste à encaisser : ${dh(resteTotal)}`,
    `${clients} clients · ${formulesVendues} formules · ${repasMidi + repasSoir} repas préparés`,
    `Dépenses : ${dh(totalDepenses)}`,
    `*Bénéfice : ${dh(recu - totalDepenses)}*${recu > 0 ? ` (marge ${Math.round(((recu - totalDepenses) / recu) * 100)} %)` : ""}`,
    evolution !== null ? `Évolution vs ${nomMois(precedent.mois, false).toLowerCase()} : ${evolution >= 0 ? "+" : ""}${evolution} %` : "",
  ]
    .filter(Boolean)
    .join("\n");

  async function partager() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Bilan ${nomMois(mois)}`, text: texteBilan });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texteBilan)}`, "_blank");
  }

  function exporter() {
    const champ = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [
      ["Semaine (lundi)", "Nom", "Montant (DH)", "Reçu (DH)", "Reste (DH)", "Statut", "Moyen"],
      ...lignes.map((l) => [
        l.semaine,
        l.nom,
        l.montant,
        l.recu,
        reste(l),
        attendu(l) > 0 && l.recu >= attendu(l) ? "Payé" : l.recu > 0 ? "Partiel" : "Non payé",
        l.moyen ? MOYENS[l.moyen] : "",
      ]),
      [],
      ["", "TOTAL", du, recu, resteTotal],
    ]
      .map((l) => l.map(champ).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `bilan-chef2box-${mois}.csv`;
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
            Bilan <em>du mois</em>
          </h1>
        </div>
        <div className="flex items-center gap-1 pb-1">
          <Link
            href={`/admin/paiements/bilan?mois=${decalerMois(mois, -1)}`}
            className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
            aria-label="Mois précédent"
          >
            <ChevronLeft size={20} />
          </Link>
          <span className="min-w-[110px] text-center text-sm font-bold text-c2b-green">{nomMois(mois)}</span>
          <Link
            href={`/admin/paiements/bilan?mois=${decalerMois(mois, 1)}`}
            className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
            aria-label="Mois suivant"
          >
            <ChevronRight size={20} />
          </Link>
        </div>
      </div>

      <PaiementsOnglets actif="bilan" mois={mois} />

      {moisEnCours && (
        <p className="-mt-1 text-xs text-c2b-muted">Mois en cours : le bilan se met à jour à chaque paiement coché.</p>
      )}

      {/* Bénéfice : encaissé − dépenses */}
      {(lignes.length > 0 || totalDepenses > 0) && (
        <section className="carte p-4">
          <p className={`text-[11px] font-bold uppercase tracking-wider ${recu - totalDepenses >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            Bénéfice {moisEnCours ? "à ce jour" : "du mois"}
          </p>
          <p className={`mt-1 font-serif text-[34px] leading-none ${recu - totalDepenses >= 0 ? "text-emerald-800" : "text-red-700"}`}>
            {dh(recu - totalDepenses)}
          </p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-c2b-muted">Encaissé</dt>
              <dd className="tabular-nums font-semibold text-emerald-700">+ {dh(recu)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-c2b-muted">Dépenses</dt>
              <dd className="tabular-nums font-semibold text-red-700">− {dh(totalDepenses)}</dd>
            </div>
            {depensesParCategorie.map((c) => (
              <div key={c.cle} className="flex justify-between pl-4 text-xs">
                <dt className="text-c2b-muted">
                  {c.emoji} {c.libelle}
                </dt>
                <dd className="tabular-nums">{dh(c.total)}</dd>
              </div>
            ))}
            {recu > 0 && (
              <div className="flex justify-between border-t border-black/5 pt-1">
                <dt className="font-bold text-c2b-green">Marge</dt>
                <dd className="tabular-nums font-bold text-c2b-green">{Math.round(((recu - totalDepenses) / recu) * 100)} %</dd>
              </div>
            )}
          </dl>
          <Link href={`/admin/paiements/depenses?mois=${mois}`} className="mt-2 block text-sm font-semibold text-c2b-gold">
            {totalDepenses > 0 ? "Voir les dépenses →" : "Ajouter les dépenses du mois →"}
          </Link>
        </section>
      )}

      {lignes.length === 0 ? (
        <p className="carte p-5 text-center text-sm text-c2b-muted">Aucun paiement enregistré pour {nomMois(mois).toLowerCase()}.</p>
      ) : (
        <>
          {/* Chiffres clés */}
          <section className="carte p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Encaissé</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-serif text-[34px] leading-none text-emerald-800">
              {dh(recu)}
              <span className="font-sans text-sm font-semibold text-c2b-muted">sur {dh(du)} attendus</span>
            </p>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/5">
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, taux)}%` }} />
            </div>
            <p className="mt-1.5 flex justify-between text-xs">
              <span className="font-semibold text-emerald-700">{taux} % encaissé</span>
              {resteTotal > 0 && <span className="font-semibold text-red-700">reste {dh(resteTotal)}</span>}
            </p>
            {evolution !== null && (
              <p className="mt-2 text-xs text-c2b-muted">
                <span className={`font-bold ${evolution >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {evolution >= 0 ? "▲ +" : "▼ "}
                  {evolution} %
                </span>{" "}
                d&apos;encaissé par rapport à {nomMois(precedent.mois, false).toLowerCase()} ({dh(precedent.encaisse)})
              </p>
            )}
          </section>

          <section className="grid grid-cols-3 gap-2">
            {[
              { v: clients, l: "clients" },
              { v: formulesVendues, l: "formules" },
              { v: repasMidi + repasSoir, l: "repas préparés" },
            ].map((x) => (
              <div key={x.l} className="carte p-3 text-center">
                <p className="font-serif text-[26px] leading-none text-c2b-green">{x.v}</p>
                <p className="mt-1 text-[11px] font-semibold text-c2b-muted">{x.l}</p>
              </div>
            ))}
          </section>
          <p className="-mt-2 text-xs text-c2b-muted">
            {repasMidi} midis · {repasSoir} soirs · panier moyen {dh(panierMoyen)} par formule hebdomadaire
          </p>

          {/* Semaine par semaine */}
          <section className="carte p-4">
            <h2 className="font-bold text-c2b-green">Semaine par semaine</h2>
            <ul className="mt-2 space-y-3">
              {semainesAffichees.map((s) => (
                <li key={s.lundi}>
                  <Link href={`/admin/paiements?semaine=${s.lundi}`} className="block">
                    <p className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-semibold text-c2b-green">{libelleSemaine(s.lundi)}</span>
                      <span className="tabular-nums text-xs text-c2b-muted">
                        {s.clients ? `${s.payes}/${s.clients} payés · ` : ""}
                        <strong className="text-c2b-text">{dh(s.recu)}</strong> / {dh(s.du)}
                      </span>
                    </p>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/5">
                      <div className="flex h-full" style={{ width: `${(s.du / maxSemaine) * 100}%` }}>
                        <div className="h-full bg-emerald-600" style={{ width: s.du ? `${(s.recu / s.du) * 100}%` : 0 }} />
                        <div className="h-full bg-red-300" style={{ width: s.du ? `${(s.reste / s.du) * 100}%` : 0 }} />
                      </div>
                    </div>
                    {!s.clients && <p className="mt-0.5 text-[11px] text-c2b-muted">À venir</p>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Moyens de paiement */}
          {parMoyen.length > 0 && (
            <section className="carte p-4">
              <h2 className="font-bold text-c2b-green">Moyens de paiement</h2>
              <dl className="mt-2 space-y-1 text-sm">
                {parMoyen.map((x) => (
                  <div key={x.m} className="flex justify-between">
                    <dt className="text-c2b-muted">{MOYENS[x.m]}</dt>
                    <dd className="tabular-nums font-semibold">
                      {dh(x.total)} <span className="text-xs text-c2b-muted">({Math.round((x.total / Math.max(recu, 1)) * 100)} %)</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Restes à encaisser */}
          {aRelancer.length > 0 && (
            <section className="carte border-red-200 p-4">
              <h2 className="font-bold text-red-700">Reste à encaisser · {aRelancer.length} personne{aRelancer.length > 1 ? "s" : ""}</h2>
              <ul className="mt-2 divide-y divide-black/5 text-sm">
                {aRelancer.map((d) => (
                  <li key={d.nom} className="flex justify-between py-1.5">
                    <span className="text-c2b-text">
                      {d.nom}
                      {d.semaines > 1 && <span className="text-xs text-c2b-muted"> · {d.semaines} semaines</span>}
                    </span>
                    <span className="tabular-nums font-semibold text-red-700">{dh(d.reste)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={partager}
              className="flex items-center justify-center gap-1.5 rounded-full bg-c2b-green py-2.5 text-sm font-bold text-c2b-cream"
            >
              <Share2 size={15} /> Partager le bilan
            </button>
            <button
              onClick={exporter}
              className="flex items-center justify-center gap-1.5 rounded-full border border-c2b-green/20 bg-white py-2.5 text-sm font-bold text-c2b-green"
            >
              <Download size={15} /> Excel / CSV
            </button>
          </div>
        </>
      )}
    </main>
  );
}
