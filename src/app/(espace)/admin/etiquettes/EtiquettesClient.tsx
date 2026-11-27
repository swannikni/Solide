"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Tag } from "lucide-react";
import type { jsPDF as JsPDF } from "jspdf";
import { createClient } from "@/lib/supabase/client";
import { genererEtiquettesPdf, prenomEtiquette, type Etiquette, type Macros } from "@/lib/etiquettes-pdf";
import type { Palier } from "@/lib/types";

type Service = "dejeuner" | "diner";
type Champ = keyof Macros;

export interface LigneEtiquette {
  nom: string;
  palier: Palier | null;
  quantite: number;
}
export interface JourEtiquettes {
  date: string;
  plats: Record<Service, string>;
  lignes: Record<Service, LigneEtiquette[]>;
}
export type MacrosPlat = Macros & { plat_cle: string; palier: Palier };

const PALIERS: Palier[] = ["P1", "P2", "P3"];
const CHAMPS: { cle: Champ; libelle: string }[] = [
  { cle: "proteines", libelle: "Prot. g" },
  { cle: "glucides", libelle: "Gluc. g" },
  { cle: "lipides", libelle: "Lip. g" },
  { cle: "kcal", libelle: "kcal" },
];
const cleDuPlat = (plat: string) => plat.trim().toLowerCase().slice(0, 120);
const versNombre = (t: string) => {
  const n = Number(t.replace(",", ".").trim());
  return t.trim() && Number.isFinite(n) && n >= 0 ? n : null;
};
const jourLong = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const jourCourt = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" }).replace(".", "");

export function EtiquettesClient({ jours, macrosInitiales, aujourdhui }: { jours: JourEtiquettes[]; macrosInitiales: MacrosPlat[]; aujourdhui: string }) {
  const supabase = createClient();
  const [JsPdf, setJsPdf] = useState<typeof JsPDF | null>(null);
  useEffect(() => {
    import("jspdf").then((m) => setJsPdf(() => m.jsPDF)).catch(() => {});
  }, []);

  const [date, setDate] = useState(() => (jours.find((j) => j.date >= aujourdhui) ?? jours[jours.length - 1])?.date ?? "");
  const j = jours.find((x) => x.date === date);
  const [service, setService] = useState<Service>("dejeuner");
  const [nomPlat, setNomPlat] = useState("");
  const [macros, setMacros] = useState(macrosInitiales);
  const [saisie, setSaisie] = useState<Record<string, Record<Champ, string>>>({});
  const [message, setMessage] = useState("");
  const [enCours, setEnCours] = useState(false);

  // Le plat du service (modifiable ici si le menu n'a pas de nom), et ses macros enregistrées.
  useEffect(() => {
    const plat = j?.plats[service] ?? "";
    setNomPlat(plat);
  }, [date, service, j]);
  useEffect(() => {
    const s: Record<string, Record<Champ, string>> = {};
    for (const p of PALIERS) {
      const m = macros.find((x) => x.plat_cle === cleDuPlat(nomPlat) && x.palier === p);
      s[p] = { proteines: m?.proteines?.toString() ?? "", glucides: m?.glucides?.toString() ?? "", lipides: m?.lipides?.toString() ?? "", kcal: m?.kcal?.toString() ?? "" };
    }
    setSaisie(s);
  }, [nomPlat, macros]);

  // Ordre de la fiche cuisine : palier (P1, P2, P3, sans), puis nom ; ×2 = 2 étiquettes.
  const lignes = useMemo(
    () =>
      [...(j?.lignes[service] ?? [])].sort(
        (a, b) => [...PALIERS, null].indexOf(a.palier) - [...PALIERS, null].indexOf(b.palier) || a.nom.localeCompare(b.nom, "fr")
      ),
    [j, service]
  );
  const total = lignes.reduce((t, l) => t + Math.max(1, l.quantite), 0);
  const paliersPresents = PALIERS.filter((p) => lignes.some((l) => l.palier === p));
  const macrosDe = (p: Palier | null): Macros | null => {
    if (!p) return null;
    const m = saisie[p];
    if (!m || !Object.values(m).some((v) => v.trim())) return null;
    return { proteines: versNombre(m.proteines), glucides: versNombre(m.glucides), lipides: versNombre(m.lipides), kcal: versNombre(m.kcal) };
  };
  const etiquettes: Etiquette[] = lignes.flatMap((l) =>
    Array.from({ length: Math.max(1, l.quantite) }, () => ({ prenom: prenomEtiquette(l.nom), palier: l.palier, macros: macrosDe(l.palier) }))
  );

  async function enregistrer() {
    const plat = cleDuPlat(nomPlat);
    if (!plat) return false;
    const lignesMacros = PALIERS.filter((p) => macrosDe(p)).map((p) => ({ plat_cle: plat, palier: p, ...macrosDe(p)!, updated_at: new Date().toISOString() }));
    if (!lignesMacros.length) return true;
    const { error } = await supabase.from("application_macros_plats").upsert(lignesMacros, { onConflict: "plat_cle,palier" });
    if (error) {
      setMessage("Macros non enregistrées, réessayez.");
      return false;
    }
    setMacros((prev) => [...prev.filter((m) => m.plat_cle !== plat || !lignesMacros.some((x) => x.palier === m.palier)), ...lignesMacros]);
    return true;
  }

  async function creerPdf(liste: Etiquette[], suffixe: string) {
    if (!nomPlat.trim()) return setMessage("Écrivez le nom du plat.");
    if (!JsPdf) return setMessage("Préparation du PDF, réessayez dans une seconde.");
    const sansMacros = liste.filter((e) => !e.macros).length;
    if (sansMacros && !window.confirm(`${sansMacros} étiquette${sansMacros > 1 ? "s" : ""} sans macros (palier non rempli). Créer le PDF quand même ?`)) return;
    setEnCours(true);
    try {
      if (!(await enregistrer())) return;
      const { CORMORANT_BOLD, DMSANS_LEGER, DMSANS_MOYEN } = await import("@/lib/polices-etiquettes");
      const blob = genererEtiquettesPdf(JsPdf, { serif: CORMORANT_BOLD, leger: DMSANS_LEGER, moyen: DMSANS_MOYEN }, nomPlat, liste);
      const fichier = new File([blob], `etiquettes-${date}-${service === "dejeuner" ? "midi" : "soir"}${suffixe}.pdf`, { type: "application/pdf" });
      // iPhone : menu de partage → « Imprimer ». Sinon : le PDF s'ouvre.
      if (navigator.canShare?.({ files: [fichier] })) {
        try {
          await navigator.share({ files: [fichier], title: `Étiquettes ${nomPlat}` });
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = fichier.name;
      lien.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } finally {
      setEnCours(false);
    }
  }

  // Test : une étiquette par palier présent (2 ou 3 étiquettes).
  const test = paliersPresents.map((p) => etiquettes.find((e) => e.palier === p)!).filter(Boolean);
  const exemple = etiquettes[0];

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 pt-6">
      <header>
        <span className="lbl mb-2">Cuisine</span>
        <h1 className="titre text-[34px]">
          Les <em>étiquettes</em>
        </h1>
        <p className="mt-1 text-sm text-c2b-muted">Une étiquette 62 × 29 mm par box, dans l&apos;ordre de la fiche cuisine. Rouleau Brother DK-11209.</p>
      </header>

      {jours.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-c2b-muted">Aucun repas au planning ces prochains jours.</p>
      ) : (
        <>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
            {jours.map((x) => (
              <button
                key={x.date}
                onClick={() => setDate(x.date)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold capitalize ${
                  x.date === date ? "bg-c2b-green text-c2b-cream" : "border border-c2b-green/15 bg-white text-c2b-green"
                }`}
              >
                {jourCourt(x.date)}
                {x.date === aujourdhui && " · auj."}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-c2b-cream-2 p-1">
            {(["dejeuner", "diner"] as Service[]).map((s) => {
              const n = (j?.lignes[s] ?? []).reduce((t, l) => t + Math.max(1, l.quantite), 0);
              return (
                <button
                  key={s}
                  onClick={() => setService(s)}
                  className={`rounded-xl py-2.5 text-sm font-bold ${service === s ? "bg-white text-c2b-green shadow-sm" : "text-c2b-muted"}`}
                >
                  {s === "dejeuner" ? "☀️ Midi" : "🌙 Soir"} · {n} repas
                </button>
              );
            })}
          </div>

          <section className="space-y-3 rounded-2xl bg-white p-4">
            <p className="text-sm font-bold capitalize text-c2b-green">{jourLong(date)}</p>
            <label className="block text-xs font-bold text-c2b-muted">
              Plat
              <input value={nomPlat} onChange={(e) => setNomPlat(e.target.value)} maxLength={120} placeholder="Nom du plat" className="champ mt-1 py-2.5" />
            </label>
            {total > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-bold text-c2b-muted">Macros pour 1 portion (saisies une fois par plat, gardées ensuite)</p>
                <div className="grid grid-cols-[34px_repeat(4,minmax(0,1fr))] items-center gap-1.5 text-center text-[10px] font-bold uppercase text-c2b-muted">
                  <span />
                  {CHAMPS.map((c) => (
                    <span key={c.cle}>{c.libelle}</span>
                  ))}
                  {paliersPresents.map((p) => (
                    <Fragment key={p}>
                      <span className="text-sm font-extrabold text-c2b-green">{p}</span>
                      {CHAMPS.map((c) => (
                        <input
                          key={c.cle}
                          value={saisie[p]?.[c.cle] ?? ""}
                          onChange={(e) => setSaisie((m) => ({ ...m, [p]: { ...(m[p] ?? { proteines: "", glucides: "", lipides: "", kcal: "" }), [c.cle]: e.target.value } }))}
                          inputMode="decimal"
                          aria-label={`${p} ${c.libelle}`}
                          className="champ px-1 py-2 text-center text-base"
                        />
                      ))}
                    </Fragment>
                  ))}
                </div>
                {lignes.some((l) => !l.palier) && (
                  <p className="mt-1.5 text-[11px] font-semibold text-red-700">Des repas sans palier : leurs étiquettes n&apos;auront pas de macros.</p>
                )}
              </div>
            )}
          </section>

          {exemple && (
            <section className="space-y-2">
              <p className="text-xs font-bold text-c2b-muted">Aperçu</p>
              {/* Aperçu à l'écran, proportions 62 × 29 mm. */}
              <div className="mx-auto aspect-[62/29] w-full max-w-sm rounded-md border border-c2b-green/15 bg-white flex flex-col justify-center px-[4.5%] py-[2%] text-center text-black shadow-sm">
                <p className="truncate font-serif text-[clamp(17px,5.6vw,24px)] leading-tight">{nomPlat || "Nom du plat"}</p>
                <p className="text-[clamp(12px,3.6vw,15px)] font-medium leading-tight">{exemple.prenom}</p>
                <p className="mt-0.5 text-[clamp(7px,2vw,9px)] font-light tracking-[0.15em]">TES MACROS · POUR 1 PORTION{exemple.palier ? ` · ${exemple.palier}` : ""}</p>
                <div className="mt-[3%] grid grid-cols-4 gap-[2%]">
                  {CHAMPS.map((c) => (
                    <div key={c.cle} className="rounded-md border border-black/80 py-[8%]">
                      <p className="text-[clamp(6px,1.8vw,8px)] font-light tracking-wider">{["PROTÉINES", "GLUCIDES", "LIPIDES", "CALORIES"][CHAMPS.indexOf(c)]}</p>
                      <p className="text-[clamp(14px,4.4vw,19px)] font-medium leading-tight">
                        {exemple.macros?.[c.cle] ?? "—"}
                        {exemple.macros?.[c.cle] != null && <span className="text-[0.6em] font-light"> {c.cle === "kcal" ? "kcal" : "g"}</span>}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {total > 0 ? (
            <>
              <div className="grid gap-2">
                <button onClick={() => creerPdf(etiquettes, "")} disabled={enCours} className="btn-primary w-full py-3">
                  <Tag size={16} /> Créer le PDF · {total} étiquette{total > 1 ? "s" : ""}
                </button>
                {test.length > 1 && (
                  <button onClick={() => creerPdf(test, "-test")} disabled={enCours} className="btn-secondary w-full py-2.5 text-sm">
                    Tester avec {test.length} étiquettes ({test.map((e) => `${e.prenom} ${e.palier}`).join(", ")})
                  </button>
                )}
              </div>
              <p className="text-[11px] text-c2b-muted">Sur iPhone : Partager → Imprimer. Brother QL : rouleau 29 × 62 mm, échelle 100 %.</p>
              {message && <p className="text-sm font-bold text-red-700">{message}</p>}
              <section className="rounded-2xl bg-white p-4">
                <p className="mb-2 text-xs font-bold text-c2b-muted">Ordre d&apos;impression</p>
                <ol className="space-y-1 text-sm">
                  {lignes.map((l, i) => (
                    <li key={`${l.nom}-${i}`} className="flex justify-between gap-3">
                      <span className="font-semibold text-c2b-green">
                        {prenomEtiquette(l.nom)}
                        {l.quantite > 1 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs font-extrabold text-white">×{l.quantite}</span>}
                      </span>
                      <span className={l.palier && macrosDe(l.palier) ? "text-c2b-muted" : "font-bold text-red-700"}>{l.palier ?? "sans palier"}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          ) : (
            <p className="rounded-2xl bg-white p-4 text-sm text-c2b-muted">Pas de repas pour ce service.</p>
          )}
        </>
      )}
    </main>
  );
}
