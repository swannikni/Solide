"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import { PaiementsOnglets } from "@/app/(espace)/admin/paiements/PaiementsOnglets";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, categorie, type CategorieDepense, type Depense } from "@/lib/depenses";

const MOYENS = { especes: "Espèces", virement: "Virement", carte: "Carte", autre: "Autre" } as const;
type Moyen = keyof typeof MOYENS;
const COLONNES = "id, date, categorie, montant, libelle, moyen";

const dh = (n: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n)} DH`;
const nombre = (t: string) => Math.max(0, Math.round((Number(t.replace(",", ".").replace(/\s/g, "")) || 0) * 100) / 100);
function nomMois(mois: string) {
  const t = new Date(`${mois}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function decalerMois(mois: string, n: number) {
  const [a, m] = mois.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}
const jourLong = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function DepensesClient({
  mois,
  aujourdhui,
  depensesInitiales,
  habituelles,
}: {
  mois: string;
  aujourdhui: string;
  depensesInitiales: Depense[];
  habituelles: { categorie: CategorieDepense; libelle: string; montant: number }[];
}) {
  const supabase = createClient();
  const [depenses, setDepenses] = useState(depensesInitiales);
  const dateParDefaut = aujourdhui.startsWith(mois) ? aujourdhui : `${mois}-01`;
  const [saisie, setSaisie] = useState<{ categorie: CategorieDepense; montant: string; libelle: string; date: string; moyen: Moyen }>({
    categorie: "courses",
    montant: "",
    libelle: "",
    date: dateParDefaut,
    moyen: "especes",
  });
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [enCours, setEnCours] = useState(false);

  const total = depenses.reduce((t, d) => t + d.montant, 0);
  const parCategorie = CATEGORIES.map((c) => ({ ...c, total: depenses.filter((d) => d.categorie === c.cle).reduce((t, d) => t + d.montant, 0) }));
  const maxCategorie = Math.max(1, ...parCategorie.map((c) => c.total));

  const parJour = new Map<string, Depense[]>();
  for (const d of [...depenses].sort((a, b) => b.date.localeCompare(a.date))) parJour.set(d.date, [...(parJour.get(d.date) ?? []), d]);

  const suggestions = habituelles.filter((h) => h.categorie === saisie.categorie).slice(0, 8);

  async function ajouter() {
    const montant = nombre(saisie.montant);
    if (!montant) return setMessage("Indiquez le montant.");
    if (!saisie.date.startsWith(mois) && !confirm(`Cette dépense est datée hors de ${nomMois(mois).toLowerCase()}. L'enregistrer quand même ?`)) return;
    setEnCours(true);
    const { data, error } = await supabase
      .from("application_depenses")
      .insert({ date: saisie.date, categorie: saisie.categorie, montant, libelle: saisie.libelle.trim().slice(0, 120) || null, moyen: saisie.moyen })
      .select(COLONNES)
      .single<Depense>();
    setEnCours(false);
    if (error || !data) return setMessage("Non enregistré, réessayez.");
    setMessage("");
    if (data.date.startsWith(mois)) setDepenses((prev) => [{ ...data, montant: Number(data.montant) }, ...prev]);
    setSaisie((s) => ({ ...s, montant: "", libelle: "" }));
  }

  async function modifier(d: Depense, maj: Partial<Omit<Depense, "id">>) {
    const avant = depenses;
    setDepenses((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...maj } : x)));
    const { error } = await supabase.from("application_depenses").update(maj).eq("id", d.id);
    if (error) {
      setDepenses(avant);
      setMessage("Non enregistré, réessayez.");
    }
  }

  async function supprimer(d: Depense) {
    if (!confirm(`Supprimer la dépense de ${dh(d.montant)} (${d.libelle || categorie(d.categorie).libelle}) ?`)) return;
    const { error } = await supabase.from("application_depenses").delete().eq("id", d.id);
    if (error) return setMessage("Non supprimé, réessayez.");
    setDepenses((prev) => prev.filter((x) => x.id !== d.id));
  }

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
      <AdminOnglets />
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="lbl mb-2">Espace admin</span>
          <h1 className="titre text-[34px]">
            <em>Dépenses</em>
          </h1>
        </div>
        <div className="flex items-center gap-1 pb-1">
          <Link
            href={`/admin/paiements/depenses?mois=${decalerMois(mois, -1)}`}
            className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
            aria-label="Mois précédent"
          >
            <ChevronLeft size={20} />
          </Link>
          <span className="min-w-[110px] text-center text-sm font-bold text-c2b-green">{nomMois(mois)}</span>
          <Link
            href={`/admin/paiements/depenses?mois=${decalerMois(mois, 1)}`}
            className="w-9 h-9 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
            aria-label="Mois suivant"
          >
            <ChevronRight size={20} />
          </Link>
        </div>
      </div>

      <PaiementsOnglets actif="depenses" mois={mois} />

      {/* Ajout rapide */}
      <section className="carte p-4 space-y-3">
        <div className="grid grid-cols-5 gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.cle}
              onClick={() => setSaisie((s) => ({ ...s, categorie: c.cle }))}
              className={`flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-bold ${
                saisie.categorie === c.cle ? "text-white" : "border border-c2b-green/15 bg-white text-c2b-green"
              }`}
              style={saisie.categorie === c.cle ? { backgroundColor: c.couleur } : undefined}
              aria-pressed={saisie.categorie === c.cle}
            >
              <span className="text-lg leading-none">{c.emoji}</span>
              {c.libelle}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_110px] gap-2">
          <input
            value={saisie.libelle}
            onChange={(e) => setSaisie({ ...saisie, libelle: e.target.value })}
            placeholder={
              { courses: "Ex. Marjane, marché, poulet…", emballage: "Ex. boîtes, sacs, étiquettes…", livraison: "Ex. livreur, essence…", marketing: "Ex. pub Instagram, flyers…", autres: "Ex. gaz, loyer, matériel…" }[
                saisie.categorie
              ]
            }
            maxLength={120}
            className="champ py-2 text-sm"
          />
          <div className="relative">
            <input
              value={saisie.montant}
              onChange={(e) => setSaisie({ ...saisie, montant: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && ajouter()}
              inputMode="decimal"
              placeholder="0"
              className="champ py-2 pr-9 text-right text-sm font-bold"
              aria-label="Montant"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-c2b-muted">DH</span>
          </div>
        </div>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((h) => (
              <button
                key={h.libelle}
                onClick={() => setSaisie((s) => ({ ...s, libelle: h.libelle, montant: s.montant || String(h.montant) }))}
                className="rounded-full border border-c2b-green/15 bg-white px-3 py-1 text-xs font-semibold text-c2b-green"
              >
                {h.libelle}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-[1fr_1fr] gap-2">
          <input
            type="date"
            value={saisie.date}
            onChange={(e) => setSaisie({ ...saisie, date: e.target.value || dateParDefaut })}
            className="champ py-2 text-sm"
            aria-label="Date"
          />
          <select
            value={saisie.moyen}
            onChange={(e) => setSaisie({ ...saisie, moyen: e.target.value as Moyen })}
            className="champ py-2 text-sm"
            aria-label="Payé par"
          >
            {(Object.keys(MOYENS) as Moyen[]).map((m) => (
              <option key={m} value={m}>
                {MOYENS[m]}
              </option>
            ))}
          </select>
        </div>
        <button onClick={ajouter} disabled={enCours} className="btn-primary flex w-full items-center justify-center gap-1.5">
          <Plus size={16} /> {enCours ? "Enregistrement..." : "Ajouter la dépense"}
        </button>
        {message && <p className="text-sm font-semibold text-red-700">{message}</p>}
      </section>

      {/* Totaux */}
      <section className="carte p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-red-700">Dépenses de {nomMois(mois).toLowerCase()}</p>
        <p className="mt-1 font-serif text-[32px] leading-none text-c2b-green">{dh(total)}</p>
        <ul className="mt-3 space-y-2">
          {parCategorie.map((c) => (
            <li key={c.cle}>
              <p className="flex justify-between text-sm">
                <span>
                  {c.emoji} {c.libelle}
                </span>
                <span className="tabular-nums font-semibold">
                  {dh(c.total)}
                  {total > 0 && c.total > 0 && <span className="ml-1 text-xs text-c2b-muted">({Math.round((c.total / total) * 100)} %)</span>}
                </span>
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/5">
                <div className="h-full rounded-full" style={{ width: `${(c.total / maxCategorie) * 100}%`, backgroundColor: c.couleur }} />
              </div>
            </li>
          ))}
        </ul>
        <Link href={`/admin/paiements/bilan?mois=${mois}`} className="mt-3 block text-sm font-semibold text-c2b-gold">
          Voir le bénéfice dans le bilan du mois →
        </Link>
      </section>

      {/* Liste */}
      <section className="carte overflow-hidden">
        {depenses.length === 0 ? (
          <p className="p-5 text-center text-sm text-c2b-muted">Aucune dépense en {nomMois(mois).toLowerCase()}.</p>
        ) : (
          [...parJour.entries()].map(([jour, liste]) => (
            <div key={jour}>
              <p className="flex justify-between bg-c2b-cream/60 px-4 py-1.5 text-xs font-bold text-c2b-muted first-letter:uppercase">
                <span className="first-letter:uppercase">{jourLong(jour)}</span>
                <span className="tabular-nums">{dh(liste.reduce((t, d) => t + d.montant, 0))}</span>
              </p>
              <ul className="divide-y divide-black/5">
                {liste.map((d) => {
                  const c = categorie(d.categorie);
                  return (
                    <li key={d.id}>
                      <button onClick={() => setOuverte(ouverte === d.id ? null : d.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
                        <span
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm"
                          style={{ backgroundColor: `${c.couleur}22` }}
                        >
                          {c.emoji}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-c2b-green">{d.libelle || c.libelle}</span>
                          <span className="text-xs text-c2b-muted">
                            {c.libelle}
                            {d.moyen ? ` · ${MOYENS[d.moyen]}` : ""}
                          </span>
                        </span>
                        <span className="tabular-nums text-sm font-bold text-c2b-text">{dh(d.montant)}</span>
                      </button>
                      {ouverte === d.id && (
                        <div className="space-y-2 bg-c2b-cream/40 px-4 pb-3 pt-1">
                          <div className="grid grid-cols-[1fr_110px] gap-2">
                            <input
                              defaultValue={d.libelle ?? ""}
                              onBlur={(e) => {
                                const libelle = e.target.value.trim().slice(0, 120) || null;
                                if (libelle !== d.libelle) modifier(d, { libelle });
                              }}
                              placeholder="Libellé"
                              className="champ py-1.5 text-sm"
                            />
                            <input
                              defaultValue={d.montant}
                              inputMode="decimal"
                              onBlur={(e) => {
                                const montant = nombre(e.target.value);
                                if (montant > 0 && montant !== d.montant) modifier(d, { montant });
                              }}
                              className="champ py-1.5 text-right text-sm font-bold"
                              aria-label="Montant"
                            />
                          </div>
                          <div className="grid grid-cols-5 gap-1">
                            {CATEGORIES.map((x) => (
                              <button
                                key={x.cle}
                                onClick={() => modifier(d, { categorie: x.cle })}
                                className={`rounded-full py-1 text-[10px] font-bold ${
                                  d.categorie === x.cle ? "text-white" : "border border-c2b-green/15 bg-white text-c2b-green"
                                }`}
                                style={d.categorie === x.cle ? { backgroundColor: x.couleur } : undefined}
                              >
                                {x.libelle}
                              </button>
                            ))}
                          </div>
                          <button onClick={() => supprimer(d)} className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                            <Trash2 size={13} /> Supprimer
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
