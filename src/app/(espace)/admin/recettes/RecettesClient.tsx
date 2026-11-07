"use client";

import { useEffect, useState } from "react";
import type { jsPDF as JsPDF } from "jspdf";
import { genererRecettePdf } from "@/lib/recette-pdf";
import { Copy, FileDown, Send } from "lucide-react";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import {
  BASE,
  PALIERS_RECETTE,
  RECETTES,
  facteurDe,
  facteurs,
  portionTexte,
  quantite,
  totalElement,
  totalTexte,
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
  // Par défaut : le prochain jour de livraison (lundi → mardi, vendredi → lundi),
  // le midi sauf si seul le soir a une recette du catalogue.
  const prochain = jours.find((j) => j.date > aujourdhui) ?? jours[jours.length - 1];
  const serviceDefaut: Service = !recetteDuPlat(prochain.plats.dejeuner) && recetteDuPlat(prochain.plats.diner) ? "diner" : "dejeuner";
  const recetteDefaut = recetteDuPlat(prochain.plats[serviceDefaut]);
  const [recetteId, setRecetteId] = useState(recetteDefaut?.id ?? RECETTES[0].id);
  const [eff, setEff] = useState<Effectifs>({ P1: prochain[serviceDefaut].P1, P2: prochain[serviceDefaut].P2, P3: prochain[serviceDefaut].P3 });
  const [source, setSource] = useState<string>(`${prochain.date}|${serviceDefaut}`);
  const [semaine, setSemaine] = useState(jours.indexOf(prochain) >= 5 ? 1 : 0);
  const [recherche, setRecherche] = useState("");
  const [copie, setCopie] = useState(false);
  const r = RECETTES.find((x) => x.id === recetteId)!;
  const c = calculer(r, eff);
  const sansPalier = source ? jours.find((j) => j.date === source.split("|")[0])?.[source.split("|")[1] as Service].sans ?? 0 : 0;

  const resultats = recherche.trim()
    ? RECETTES.filter((x) => sansAccents(`${x.nom} ${x.sousTitre} ${x.description}`).includes(sansAccents(recherche.trim())))
    : [];
  const [dateSource, serviceSource] = source.split("|") as [string, Service | undefined];
  const jourSource = jours.find((j) => j.date === dateSource);
  const platSource = jourSource && serviceSource ? jourSource.plats[serviceSource] : null;

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
          `• ${a.nom} : ${a.cruCalc != null ? quantite(a.cruCalc, a.unite) : (a.texte ?? "—")}${a.cuitCalc != null && a.cuitCalc !== a.cruCalc ? ` → ${quantite(a.cuitCalc, a.unite)} cuit` : ""}${a.note ? ` (${a.note})` : ""}`
      ),
    ];
    for (const p of c.preparations) {
      l.push("", `*${p.titre.toUpperCase()}*${p.totalG ? ` (≈ ${quantite(p.totalG)})` : ""}`, ...p.ingredients.map((i) => `• ${i.nom} : ${fmtIngredient(i)}`));
    }
    l.push("", "*CUISINE*", ...c.cuisine.map((e, i) => `${i + 1}. ${e}`));
    l.push("", "*MONTAGE (portions par box)*");
    for (const e of c.elements)
      l.push(`• ${e.nom} : ${PALIERS_RECETTE.map((p) => portionTexte(e, p)).join(" / ")}${e.texte ? "" : ` — total ${totalTexte(e, eff)}`}`);
    l.push(...r.montage.map((m) => `→ ${m}`), "", `⚠️ Allergènes : ${r.allergenes}`);
    return l.join("\n");
  }

  // Bibliothèque PDF et logo chargés d'avance : le PDF se fabrique sans
  // attente au toucher, ce qu'exige le partage sur iPhone.
  const [JsPdf, setJsPdf] = useState<typeof JsPDF | null>(null);
  const [logo, setLogo] = useState<{ data: string; ratio: number } | null>(null);
  useEffect(() => {
    import("jspdf").then((m) => setJsPdf(() => m.jsPDF)).catch(() => {});
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      setLogo({ data: canvas.toDataURL("image/png"), ratio: image.naturalWidth / image.naturalHeight });
    };
    image.src = "/logo-fiche.png";
  }, []);

  async function pdf() {
    if (!JsPdf) return;
    const blob = genererRecettePdf(
      JsPdf,
      {
        nom: r.nom,
        sousTitre: r.sousTitre,
        description: r.description,
        effectifs: eff,
        total: c.total,
        aliments: c.aliments.map((a) => ({
          nom: a.nom,
          note: a.note,
          cru: a.cruCalc != null ? quantite(a.cruCalc, a.unite) : (a.texte ?? "-"),
          cuit: a.cuitCalc != null ? quantite(a.cuitCalc, a.unite) : "-",
        })),
        preparations: c.preparations.map((p) => ({
          titre: p.titre,
          total: p.totalG > 0 ? quantite(p.totalG) : null,
          ingredients: p.ingredients.map((i) => ({ nom: i.nom, qte: fmtIngredient(i) })),
          etapes: p.etapes,
        })),
        cuisine: c.cuisine,
        elements: c.elements.map((e) => ({
          nom: e.nom,
          portions: { P1: portionTexte(e, "P1"), P2: portionTexte(e, "P2"), P3: portionTexte(e, "P3") },
          total: totalTexte(e, eff),
        })),
        montage: r.montage,
        notes: r.notes,
        allergenes: r.allergenes,
      },
      logo
    );
    const fichier = `Chef2Box_${r.id}_${c.total}box.pdf`;
    const file = new File([blob], fichier, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: r.nom }).catch(() => {});
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fichier;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
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

      {/* Jour : le plat et les effectifs du planning */}
      <section className="carte space-y-2 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-c2b-green">{semaine === 0 ? "Cette semaine" : "Semaine prochaine"}</p>
          <button onClick={() => setSemaine(semaine === 0 ? 1 : 0)} className="text-xs font-bold text-c2b-gold">
            {semaine === 0 ? "Semaine prochaine →" : "← Cette semaine"}
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {jours.slice(semaine * 5, semaine * 5 + 5).map((j) => (
            <div key={j.date} className="space-y-1">
              <p className={`text-center text-[10px] font-bold first-letter:uppercase ${j.date === aujourdhui ? "text-c2b-gold" : "text-c2b-muted"}`}>
                {jourCourt(j.date)}
              </p>
              {(["dejeuner", "diner"] as Service[]).map((sv) => {
                const n = j[sv].P1 + j[sv].P2 + j[sv].P3 + j[sv].sans;
                const actif = source === `${j.date}|${sv}`;
                const rec = recetteDuPlat(j.plats[sv]);
                return (
                  <button
                    key={sv}
                    disabled={n === 0}
                    onClick={() => reprendre(j, sv)}
                    className={`w-full rounded-lg px-0.5 py-1.5 text-[11px] font-bold leading-tight disabled:opacity-30 ${
                      actif ? (sv === "dejeuner" ? "bg-amber-400 text-amber-950" : "bg-indigo-500 text-white") : "border border-c2b-green/15 bg-white text-c2b-green"
                    }`}
                  >
                    {sv === "dejeuner" ? "☀️" : "🌙"} {n}
                    {rec && <span className="block truncate text-[9px] font-semibold opacity-80">{rec.nom}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {jourSource && serviceSource && (
          <p className="text-xs text-c2b-muted first-letter:uppercase">
            {new Date(`${dateSource}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} ·{" "}
            {serviceSource === "dejeuner" ? "midi" : "soir"} · plat : <strong className="text-c2b-green">{platSource || "non renseigné"}</strong>
            {platSource && !recetteDuPlat(platSource) && " (pas de fiche : cherchez-la ci-dessous)"}
          </p>
        )}
      </section>

      {/* Recherche d'une recette */}
      <section className="relative">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={`🔍 Chercher une recette (${RECETTES.length} fiches)…`}
          className="champ py-3 text-sm"
        />
        {recherche.trim() && (
          <div className="carte absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto p-1">
            {resultats.length === 0 ? (
              <p className="px-3 py-2 text-sm text-c2b-muted">Aucune recette trouvée.</p>
            ) : (
              resultats.map((x) => (
                <button
                  key={x.id}
                  onClick={() => {
                    setRecetteId(x.id);
                    setRecherche("");
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left hover:bg-c2b-cream"
                >
                  <span className="font-bold text-c2b-green">{x.nom}</span> <span className="text-xs text-c2b-muted">· {x.sousTitre}</span>
                </button>
              ))
            )}
          </div>
        )}
      </section>

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
                        <td className="py-1.5 pr-2 font-bold tabular-nums text-c2b-green">{a.cruCalc != null ? quantite(a.cruCalc, a.unite) : (a.texte ?? "—")}</td>
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
              <h3 className="mb-1.5 text-sm font-bold uppercase text-c2b-green">Montage · portions par box</h3>
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
                            {portionTexte(e, p)}
                          </td>
                        ))}
                        <td className="whitespace-nowrap py-1.5 pl-2 text-right font-bold tabular-nums text-c2b-green">{totalTexte(e, eff)}</td>
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
              <button onClick={pdf} disabled={!JsPdf} className="btn-primary px-3 py-2.5 text-sm">
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
