"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Portail } from "@/components/Portail";
import { libelleQuantite } from "@/components/MealCard";
import { ORDRE_REPAS, REPAS_TYPE_LABELS } from "@/lib/macros";
import type { RepasJournal } from "@/lib/types";

export type Nutriment = "calories" | "proteines" | "glucides" | "lipides";

const INFOS: Record<Nutriment, { libelle: string; unite: string; couleur: string }> = {
  calories: { libelle: "Calories", unite: "kcal", couleur: "#c9973a" },
  proteines: { libelle: "Protéines", unite: "g", couleur: "#1c2e1e" },
  glucides: { libelle: "Glucides", unite: "g", couleur: "#c9973a" },
  lipides: { libelle: "Lipides", unite: "g", couleur: "#7fa184" },
};

// Idées simples pour finir ses protéines (portion → protéines apportées).
const IDEES_PROTEINES = [
  { nom: "Blanc de poulet", portion: "150 g", proteines: 46 },
  { nom: "Thon au naturel", portion: "1 boîte", proteines: 25 },
  { nom: "Whey", portion: "1 dose", proteines: 24 },
  { nom: "Skyr / fromage blanc", portion: "1 pot", proteines: 15 },
  { nom: "Œufs", portion: "2 œufs", proteines: 13 },
  { nom: "Lentilles cuites", portion: "200 g", proteines: 18 },
];

const valeur = (r: RepasJournal, n: Nutriment) => Number(r[n]) * Number(r.quantite);

// Détail de la journée pour un nutriment : par repas, principales sources,
// répartition des calories. S'ouvre en touchant l'anneau ou une case de macro.
export function DetailNutrition({
  repas,
  objectifs,
  initial,
  onClose,
}: {
  repas: RepasJournal[];
  objectifs: Record<Nutriment, number>;
  initial: Nutriment;
  onClose: () => void;
}) {
  const [n, setN] = useState<Nutriment>(initial);
  const info = INFOS[n];
  const total = repas.reduce((t, r) => t + valeur(r, n), 0);
  const objectif = objectifs[n];
  const reste = objectif - total;
  const arrondi = (v: number) => Math.round(v);

  const parRepas = ORDRE_REPAS.map((type) => ({
    type,
    total: repas.filter((r) => r.repas_type === type).reduce((t, r) => t + valeur(r, n), 0),
  }));
  const maxRepas = Math.max(...parRepas.map((p) => p.total), 1);

  const sources = [...repas]
    .map((r) => ({ r, v: valeur(r, n) }))
    .filter((s) => s.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 6);

  // Part des calories venant de chaque macro (4 kcal/g P et G, 9 kcal/g L).
  const kcal = {
    proteines: repas.reduce((t, r) => t + valeur(r, "proteines"), 0) * 4,
    glucides: repas.reduce((t, r) => t + valeur(r, "glucides"), 0) * 4,
    lipides: repas.reduce((t, r) => t + valeur(r, "lipides"), 0) * 9,
  };
  const totalKcalMacros = kcal.proteines + kcal.glucides + kcal.lipides;
  const kcalObjectif = objectifs.proteines * 4 + objectifs.glucides * 4 + objectifs.lipides * 9;
  const part = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0);

  const statut =
    reste > 0
      ? `Encore ${arrondi(reste)} ${info.unite} pour atteindre l'objectif`
      : n === "proteines"
        ? `✓ Objectif atteint (+${arrondi(-reste)} ${info.unite})`
        : total <= objectif * 1.1
          ? `Objectif atteint, dans la marge (+${arrondi(-reste)} ${info.unite})`
          : `${arrondi(-reste)} ${info.unite} au-dessus de l'objectif`;

  return (
    <Portail>
      <div className="fixed inset-0 z-30 bg-c2b-green/60 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={onClose}>
        <div
          className="bg-c2b-cream w-full max-h-[92dvh] md:max-w-md rounded-t-[24px] md:rounded-[24px] overflow-y-auto overscroll-contain animate-apparition"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label={`Détail ${info.libelle.toLowerCase()} du jour`}
        >
          <div className="sticky top-0 z-10 bg-c2b-cream px-5 pt-4 pb-3 border-b border-black/5">
            <div className="flex items-center justify-between">
              <h2 className="titre text-2xl">
                Détail <em>du jour</em>
              </h2>
              <button onClick={onClose} className="w-10 h-10 -mr-2 flex items-center justify-center text-c2b-green/60" aria-label="Fermer">
                <X size={20} />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {(Object.keys(INFOS) as Nutriment[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setN(k)}
                  aria-pressed={n === k}
                  className={`rounded-full py-1.5 text-[12px] font-bold transition ${
                    n === k ? "bg-c2b-green text-c2b-cream" : "bg-white text-c2b-green border border-c2b-green/15"
                  }`}
                >
                  {INFOS[k].libelle}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 space-y-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <section>
              <p className="flex items-baseline gap-1.5">
                <span className="text-[40px] font-semibold leading-none text-c2b-text">{arrondi(total)}</span>
                <span className="text-sm text-c2b-muted">
                  / {objectif} {info.unite}
                </span>
              </p>
              <div className="mt-3 h-2.5 rounded-full bg-c2b-green/10 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, objectif > 0 ? (total / objectif) * 100 : 0)}%`,
                    backgroundColor: reste < 0 && n !== "proteines" && total > objectif * 1.1 ? "#e07a5f" : info.couleur,
                  }}
                />
              </div>
              <p className="text-sm font-semibold text-c2b-green mt-2">{statut}</p>
            </section>

            <section className="carte p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-c2b-muted mb-3">Par repas</h3>
              <ul className="space-y-2.5">
                {parRepas.map((p) => (
                  <li key={p.type} className="grid grid-cols-[92px_1fr_64px] items-center gap-2 text-sm">
                    <span className="text-c2b-green">{REPAS_TYPE_LABELS[p.type]}</span>
                    <span className="h-2 rounded-full bg-c2b-green/[0.07] overflow-hidden">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${(p.total / maxRepas) * 100}%`, backgroundColor: info.couleur }}
                      />
                    </span>
                    <span className="text-right font-semibold text-c2b-text">
                      {arrondi(p.total)} {info.unite}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="carte p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-c2b-muted mb-3">Principales sources</h3>
              {sources.length === 0 ? (
                <p className="text-sm text-c2b-muted">Rien de noté pour l&apos;instant.</p>
              ) : (
                <ul className="divide-y divide-black/5">
                  {sources.map(({ r, v }) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-c2b-green truncate">{r.nom}</p>
                        <p className="text-[11px] text-c2b-muted">
                          {libelleQuantite(r)} · {REPAS_TYPE_LABELS[r.repas_type].toLowerCase()}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-c2b-text">
                          {arrondi(v)} {info.unite}
                        </p>
                        <p className="text-[11px] text-c2b-muted">{part(v, total)} %</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {n === "calories" && totalKcalMacros > 0 && (
              <section className="carte p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-c2b-muted mb-3">D&apos;où viennent les calories</h3>
                <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
                  {(["proteines", "glucides", "lipides"] as const).map((k) => (
                    <span key={k} style={{ width: `${part(kcal[k], totalKcalMacros)}%`, backgroundColor: INFOS[k].couleur }} />
                  ))}
                </div>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {(["proteines", "glucides", "lipides"] as const).map((k) => {
                    const objectifMacro = k === "lipides" ? objectifs[k] * 9 : objectifs[k] * 4;
                    return (
                      <li key={k} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-c2b-green">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: INFOS[k].couleur }} />
                          {INFOS[k].libelle}
                        </span>
                        <span className="text-c2b-text">
                          <span className="font-semibold">{part(kcal[k], totalKcalMacros)} %</span>
                          <span className="text-c2b-muted"> · objectif {part(objectifMacro, kcalObjectif)} %</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {n === "proteines" && reste >= 15 && (
              <section className="carte p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-c2b-muted mb-1">
                  Idées pour finir vos protéines
                </h3>
                <p className="text-xs text-c2b-muted mb-3">Il vous reste {arrondi(reste)} g.</p>
                <ul className="divide-y divide-black/5">
                  {IDEES_PROTEINES.map((i) => (
                    <li key={i.nom} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="text-c2b-green">
                        {i.nom} <span className="text-c2b-muted">· {i.portion}</span>
                      </span>
                      <span className="font-semibold text-c2b-text">{i.proteines} g</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </Portail>
  );
}
