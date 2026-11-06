"use client";

import { useState } from "react";
import { Copy, FileDown, Send } from "lucide-react";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import {
  BASE,
  PALIERS_RECETTE,
  RECETTES,
  facteurDe,
  facteurs,
  quantite,
  totalElement,
  type Effectifs,
  type Recette,
} from "@/lib/recettes";

type Service = "dejeuner" | "diner";

// Effectifs par palier d'un service de la semaine (planning de la cuisine).
export interface JourPlanning {
  date: string;
  dejeuner: Effectifs & { sans: number };
  diner: Effectifs & { sans: number };
  plats: Record<Service, string | null>;
}

const jourCourt = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" }).replace(".", "");
const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Une recette dont le nom figure dans le plat du jour (« Salade César », …).
const recetteDuPlat = (plat: string | null) => (plat ? RECETTES.find((r) => sansAccents(plat).includes(sansAccents(r.nom))) : undefined);

// Toute la fiche, calculée pour ces effectifs.
function calculer(r: Recette, eff: Effectifs) {
  const f = facteurs(r, eff);
  const total = PALIERS_RECETTE.reduce((t, p) => t + (eff[p] || 0), 0);
  const aliments = r.aliments.map((a) => {
    const k = facteurDe(a.suit, f);
    return { ...a, cruCalc: a.cru != null ? a.cru * k : null, cuitCalc: a.cuit != null ? a.cuit * k : null };
  });
  const preparations = r.preparations.map((p) => {
    const k = facteurDe(p.suit, f);
    const ingredients = p.ingredients.map((i) => ({ ...i, qteCalc: i.qte * k, maxCalc: i.max != null ? i.max * k : null }));
    const totalG = ingredients.filter((i) => i.unite === "g" || i.unite === "ml").reduce((t, i) => t + i.qteCalc, 0);
    return { ...p, ingredients, totalG };
  });
  const elements = r.elements.map((e) => ({ ...e, total: totalElement(e, eff) }));
  const remplacer = (t: string) => t.replace(/\{(\w+)\}/g, (_, id) => quantite(elements.find((e) => e.id === id)?.total ?? 0));
  return { total, aliments, preparations, elements, cuisine: r.cuisine.map(remplacer) };
}

const fmtIngredient = (i: { qteCalc: number; maxCalc: number | null; unite: string }) =>
  i.maxCalc != null ? `${quantite(i.qteCalc, i.unite)} à ${quantite(i.maxCalc, i.unite)}` : quantite(i.qteCalc, i.unite);

export function RecettesClient({ jours, aujourdhui }: { jours: JourPlanning[]; aujourdhui: string }) {
  // Par défaut : le prochain service du planning qui a une recette du catalogue.
  const depart =
    jours
      .filter((j) => j.date >= aujourdhui)
      .flatMap((j) => (["dejeuner", "diner"] as Service[]).map((s) => ({ j, s })))
      .find(({ j, s }) => recetteDuPlat(j.plats[s])) ?? null;
  const [recetteId, setRecetteId] = useState(depart ? recetteDuPlat(depart.j.plats[depart.s])!.id : RECETTES[0].id);
  const [eff, setEff] = useState<Effectifs>(depart ? { P1: depart.j[depart.s].P1, P2: depart.j[depart.s].P2, P3: depart.j[depart.s].P3 } : { P1: 0, P2: BASE, P3: 0 });
  const [source, setSource] = useState<string>(depart ? `${depart.j.date}|${depart.s}` : "");
  const [copie, setCopie] = useState(false);

  const r = RECETTES.find((x) => x.id === recetteId)!;
  const c = calculer(r, eff);
  const sansPalier = source ? jours.find((j) => j.date === source.split("|")[0])?.[source.split("|")[1] as Service].sans ?? 0 : 0;

  function reprendre(j: JourPlanning, s: Service) {
    setEff({ P1: j[s].P1, P2: j[s].P2, P3: j[s].P3 });
    setSource(`${j.date}|${s}`);
    const rec = recetteDuPlat(j.plats[s]);
    if (rec) setRecetteId(rec.id);
    setCopie(false);
  }

  function texte() {
    const l = [
      `🍳 *${r.nom.toUpperCase()} — ${r.sousTitre}*`,
      `${c.total} box : P1 × ${eff.P1} · P2 × ${eff.P2} · P3 × ${eff.P3}`,
      "",
      "*À PRÉPARER*",
      ...c.aliments.map(
        (a) =>
          `• ${a.nom} : ${a.cruCalc != null ? quantite(a.cruCalc, a.unite) : "—"}${a.cuitCalc != null && a.cuitCalc !== a.cruCalc ? ` → ${quantite(a.cuitCalc, a.unite)} cuit` : ""}${a.note ? ` (${a.note})` : ""}`
      ),
    ];
    for (const p of c.preparations) {
      l.push("", `*${p.titre.toUpperCase()}*${p.totalG ? ` (≈ ${quantite(p.totalG)})` : ""}`, ...p.ingredients.map((i) => `• ${i.nom} : ${fmtIngredient(i)}`));
    }
    l.push("", "*CUISINE*", ...c.cuisine.map((e, i) => `${i + 1}. ${e}`));
    l.push("", "*MONTAGE (poids cuits par box)*");
    for (const e of c.elements) l.push(`• ${e.nom} : ${e.portions.P1} / ${e.portions.P2} / ${e.portions.P3} g — total ${quantite(e.total)}`);
    l.push(...r.montage.map((m) => `→ ${m}`), "", `⚠️ Allergènes : ${r.allergenes}`);
    return l.join("\n");
  }

  async function pdf() {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const marge = 14;
    let y = 16;
    const ligne = (t: string, taille = 10, gras = false, ecart = 5) => {
      doc.setFont("helvetica", gras ? "bold" : "normal");
      doc.setFontSize(taille);
      for (const morceau of doc.splitTextToSize(t, 182) as string[]) {
        if (y > 282) {
          doc.addPage();
          y = 16;
        }
        doc.text(morceau, marge, y);
        y += ecart;
      }
    };
    ligne("CHEF2BOX · FICHE CUISINE", 9, true);
    ligne(`${r.nom.toUpperCase()} — ${r.sousTitre}`, 18, true, 8);
    ligne(`${c.total} box : P1 × ${eff.P1} · P2 × ${eff.P2} · P3 × ${eff.P3}`, 11, true, 8);
    ligne("À PRÉPARER (cru / net → cuit)", 12, true, 6);
    for (const a of c.aliments)
      ligne(
        `• ${a.nom} : ${a.cruCalc != null ? quantite(a.cruCalc, a.unite) : "—"}${a.cuitCalc != null && a.cuitCalc !== a.cruCalc ? ` → ${quantite(a.cuitCalc, a.unite)} cuit` : ""}${a.note ? ` (${a.note})` : ""}`
      );
    for (const p of c.preparations) {
      y += 2;
      ligne(`${p.titre.toUpperCase()}${p.totalG ? ` (≈ ${quantite(p.totalG)})` : ""}`, 12, true, 6);
      for (const i of p.ingredients) ligne(`• ${i.nom} : ${fmtIngredient(i)}`);
      for (const e of p.etapes) ligne(`  ${e}`, 9);
    }
    y += 2;
    ligne("CUISINE", 12, true, 6);
    c.cuisine.forEach((e, i) => ligne(`${i + 1}. ${e}`));
    y += 2;
    ligne("MONTAGE — poids cuits par box (P1 / P2 / P3)", 12, true, 6);
    for (const e of c.elements) ligne(`• ${e.nom} : ${e.portions.P1} / ${e.portions.P2} / ${e.portions.P3} g — total ${quantite(e.total)}`);
    for (const m of r.montage) ligne(`→ ${m}`);
    for (const n of r.notes) ligne(n, 9);
    y += 2;
    ligne(`Allergènes : ${r.allergenes}`, 10, true);
    const fichier = `Chef2Box_${r.id}_${c.total}box.pdf`;
    const blob = doc.output("blob");
    const file = new File([blob], fichier, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: r.nom }).catch(() => {});
    else doc.save(fichier);
  }

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
      <AdminOnglets />
      <div>
        <span className="lbl mb-2">Espace admin</span>
        <h1 className="titre text-[34px]">
          <em>Recettes</em>
        </h1>
        <p className="text-sm text-c2b-muted">Choisissez la recette et le nombre de box par palier : les quantités se recalculent.</p>
      </div>

      {/* Catalogue */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {RECETTES.map((x) => (
          <button
            key={x.id}
            onClick={() => setRecetteId(x.id)}
            className={`rounded-2xl px-3 py-3 text-left ${x.id === recetteId ? "bg-c2b-green text-c2b-cream" : "carte text-c2b-green"}`}
          >
            <p className="font-bold leading-tight">{x.nom}</p>
            <p className={`text-xs ${x.id === recetteId ? "text-c2b-cream/80" : "text-c2b-muted"}`}>{x.sousTitre}</p>
          </button>
        ))}
      </div>

      {/* Effectifs */}
      <section className="carte space-y-3 p-4">
        <p className="text-sm font-bold text-c2b-green">Nombre de box</p>
        <div className="grid grid-cols-3 gap-2">
          {PALIERS_RECETTE.map((p) => (
            <label key={p} className="text-center text-xs font-bold text-c2b-muted">
              {p}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                value={eff[p] || ""}
                placeholder="0"
                onChange={(e) => {
                  setEff({ ...eff, [p]: Math.max(0, Math.min(999, Number(e.target.value) || 0)) });
                  setSource("");
                }}
                className="champ mt-1 py-2.5 text-center text-lg font-bold text-c2b-green"
              />
            </label>
          ))}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold text-c2b-muted">Reprendre le planning de la cuisine</p>
          <div className="grid grid-cols-5 gap-1">
            {jours.map((j) => (
              <div key={j.date} className="space-y-1">
                <p className="text-center text-[10px] font-bold text-c2b-muted first-letter:uppercase">{jourCourt(j.date)}</p>
                {(["dejeuner", "diner"] as Service[]).map((s) => {
                  const n = j[s].P1 + j[s].P2 + j[s].P3 + j[s].sans;
                  const actif = source === `${j.date}|${s}`;
                  return (
                    <button
                      key={s}
                      disabled={n === 0}
                      onClick={() => reprendre(j, s)}
                      title={j.plats[s] ?? undefined}
                      className={`w-full rounded-lg py-1.5 text-[11px] font-bold disabled:opacity-30 ${
                        actif ? (s === "dejeuner" ? "bg-amber-400 text-amber-950" : "bg-indigo-500 text-white") : "border border-c2b-green/15 bg-white text-c2b-green"
                      }`}
                    >
                      {s === "dejeuner" ? "☀️" : "🌙"} {n}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {sansPalier > 0 && (
            <p className="mt-1.5 text-xs font-bold text-red-700">⚠️ {sansPalier} repas sans palier dans ce service : ajoutez-les à la main.</p>
          )}
        </div>
      </section>

      {/* La fiche */}
      <section className="carte space-y-5 p-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-c2b-gold">Fiche cuisine</p>
          <h2 className="font-serif text-2xl text-c2b-green">
            {r.nom} <span className="text-base text-c2b-muted">· {r.sousTitre}</span>
          </h2>
          <p className="text-sm text-c2b-muted">{r.description}</p>
          <p className="mt-2 text-sm font-bold text-c2b-green">
            {c.total} box · P1 × {eff.P1} · P2 × {eff.P2} · P3 × {eff.P3}
          </p>
        </div>

        {c.total === 0 ? (
          <p className="rounded-xl bg-c2b-cream p-4 text-center text-sm text-c2b-muted">Indiquez le nombre de box par palier.</p>
        ) : (
          <>
            <div>
              <h3 className="mb-1.5 text-sm font-bold uppercase text-c2b-green">À préparer</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-c2b-muted">
                      <th className="py-1 pr-2 font-semibold">Aliment</th>
                      <th className="py-1 pr-2 font-semibold">Cru / net</th>
                      <th className="py-1 font-semibold">Cuit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.aliments.map((a) => (
                      <tr key={a.nom} className="border-t border-c2b-green/10 align-top">
                        <td className="py-1.5 pr-2">
                          <span className="font-semibold text-c2b-green">{a.nom}</span>
                          {a.note && <span className="block text-[11px] text-c2b-muted">{a.note}</span>}
                        </td>
                        <td className="py-1.5 pr-2 font-bold tabular-nums text-c2b-green">{a.cruCalc != null ? quantite(a.cruCalc, a.unite) : "—"}</td>
                        <td className="py-1.5 tabular-nums">{a.cuitCalc != null ? quantite(a.cuitCalc, a.unite) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {c.preparations.map((p) => (
              <div key={p.titre}>
                <h3 className="mb-1.5 text-sm font-bold uppercase text-c2b-green">
                  {p.titre} {p.totalG > 0 && <span className="font-normal normal-case text-c2b-muted">≈ {quantite(p.totalG)}</span>}
                </h3>
                <ul className="space-y-0.5 text-sm">
                  {p.ingredients.map((i) => (
                    <li key={i.nom} className="flex justify-between gap-3 border-b border-c2b-green/5 py-1">
                      <span>{i.nom}</span>
                      <span className="font-bold tabular-nums text-c2b-green">{fmtIngredient(i)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-c2b-muted">{p.etapes.join(" ")}</p>
              </div>
            ))}

            <div>
              <h3 className="mb-1.5 text-sm font-bold uppercase text-c2b-green">Cuisine</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {c.cuisine.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ol>
            </div>

            <div>
              <h3 className="mb-1.5 text-sm font-bold uppercase text-c2b-green">Montage · poids cuits par box</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-c2b-muted">
                      <th className="py-1 pr-2 text-left font-semibold">Dans la box</th>
                      {PALIERS_RECETTE.map((p) => (
                        <th key={p} className="py-1 px-1 text-right font-semibold">
                          {p}
                        </th>
                      ))}
                      <th className="py-1 pl-2 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.elements.map((e) => (
                      <tr key={e.id} className="border-t border-c2b-green/10">
                        <td className="py-1.5 pr-2 font-semibold text-c2b-green">{e.nom}</td>
                        {PALIERS_RECETTE.map((p) => (
                          <td key={p} className="whitespace-nowrap py-1.5 px-1 text-right tabular-nums">
                            {e.portions[p]} g
                          </td>
                        ))}
                        <td className="whitespace-nowrap py-1.5 pl-2 text-right font-bold tabular-nums text-c2b-green">{quantite(e.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="mt-2 space-y-0.5 text-sm">
                {r.montage.map((m) => (
                  <li key={m}>→ {m}</li>
                ))}
              </ul>
              <ul className="mt-2 space-y-0.5 text-xs text-c2b-muted">
                {r.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>

            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">⚠️ Allergènes : {r.allergenes}</p>

            <div className="grid grid-cols-3 gap-2">
              <button onClick={pdf} className="btn-primary px-3 py-2.5 text-sm">
                <FileDown size={15} /> PDF
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(texte())}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-3 py-2.5 text-sm font-bold text-white"
              >
                <Send size={15} /> Texte
              </a>
              <button
                onClick={() =>
                  navigator.clipboard
                    .writeText(texte())
                    .then(() => setCopie(true))
                    .catch(() => window.prompt("Copiez la fiche :", texte()))
                }
                className="btn-secondary px-3 py-2 text-sm"
              >
                <Copy size={15} /> {copie ? "Copié ✓" : "Copier"}
              </button>
            </div>
          </>
        )}
      </section>
      <p className="pb-4 text-center text-xs text-c2b-muted">
        Fiches de base : 10 personnes en P2. Poids crus indicatifs, à ajuster selon le rendement.
      </p>
    </main>
  );
}
