"use client";

import { useEffect, useRef, useState } from "react";

// Couleurs des tracés, vérifiées (contraste >= 3:1 sur fond blanc) :
// vert Chef2Box éclairci pour le poids, or foncé pour les calories.
export const COULEUR_POIDS = "#2e7d4f";
export const COULEUR_CALORIES = "#a8791f";
const GRILLE = "#ece8e0";
const ENCRE_SECONDAIRE = "#6b6b6b";

function useLargeur() {
  const ref = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([e]) => setLargeur(Math.floor(e.contentRect.width)));
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, largeur };
}

function graduations(min: number, max: number, cible = 4) {
  const brut = (max - min) / cible;
  const puissance = 10 ** Math.floor(Math.log10(brut || 1));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * puissance).find((p) => p >= brut) ?? puissance * 10;
  const debut = Math.floor(min / pas) * pas;
  const fin = Math.ceil(max / pas) * pas;
  const ticks: number[] = [];
  for (let v = debut; v <= fin + pas / 1000; v += pas) ticks.push(Math.round(v * 100) / 100);
  return { ticks, debut, fin };
}

const nombre = (n: number, dec = 0) => n.toLocaleString("fr-FR", { maximumFractionDigits: dec });

function jourCourt(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
}
function dateLongue(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function Infobulle({ x, y, largeur, valeur, libelle }: { x: number; y: number; largeur: number; valeur: string; libelle: string }) {
  const gauche = Math.min(Math.max(x - 60, 0), Math.max(largeur - 120, 0));
  return (
    <div
      className="pointer-events-none absolute z-10 w-[120px] rounded-xl bg-white px-3 py-2 shadow-[0_6px_20px_rgba(28,46,30,0.15)] border border-black/5"
      style={{ left: gauche, top: Math.max(y - 64, 0) }}
    >
      <p className="text-sm font-bold text-c2b-text leading-tight">{valeur}</p>
      <p className="text-[11px] text-c2b-muted leading-tight mt-0.5">{libelle}</p>
    </div>
  );
}

// ---------- Calories des 7 derniers jours (colonnes + ligne d'objectif) ----------

export function GraphiqueCalories({ jours, objectif }: { jours: { date: string; calories: number }[]; objectif: number }) {
  const { ref, largeur } = useLargeur();
  const [survol, setSurvol] = useState<number | null>(null);
  const H = 180;
  const marge = { haut: 20, bas: 26, gauche: 40, droite: 8 };
  const maxDonnees = Math.max(objectif, ...jours.map((j) => j.calories));
  const { ticks, fin } = graduations(0, maxDonnees * 1.08);
  const hauteurUtile = H - marge.haut - marge.bas;
  const y = (v: number) => marge.haut + hauteurUtile * (1 - v / fin);
  const bande = largeur > 0 ? (largeur - marge.gauche - marge.droite) / jours.length : 0;
  const epaisseur = Math.min(24, bande * 0.55);

  function colonne(cx: number, v: number) {
    const haut = y(v);
    const bas = y(0);
    const r = Math.min(4, (bas - haut) / 2, epaisseur / 2);
    const g = cx - epaisseur / 2;
    const d = cx + epaisseur / 2;
    return `M${g},${bas} V${haut + r} Q${g},${haut} ${g + r},${haut} H${d - r} Q${d},${haut} ${d},${haut + r} V${bas} Z`;
  }

  const dernier = jours.length - 1;

  return (
    <div ref={ref} className="relative">
      {largeur > 0 && (
        <svg width={largeur} height={H} role="img" aria-label="Calories consommées sur 7 jours" onMouseLeave={() => setSurvol(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={marge.gauche} x2={largeur - marge.droite} y1={y(t)} y2={y(t)} stroke={GRILLE} strokeWidth={1} />
              <text x={marge.gauche - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={ENCRE_SECONDAIRE} style={{ fontVariantNumeric: "tabular-nums" }}>
                {nombre(t)}
              </text>
            </g>
          ))}
          {jours.map((j, i) => {
            const cx = marge.gauche + bande * (i + 0.5);
            return (
              <g
                key={j.date}
                tabIndex={0}
                role="button"
                aria-label={`${dateLongue(j.date)} : ${nombre(j.calories)} kcal`}
                onMouseEnter={() => setSurvol(i)}
                onFocus={() => setSurvol(i)}
                onBlur={() => setSurvol(null)}
                className="outline-none cursor-default"
              >
                <rect x={cx - bande / 2} y={marge.haut} width={bande} height={hauteurUtile + marge.bas} fill="transparent" />
                {j.calories > 0 && (
                  <path d={colonne(cx, j.calories)} fill={COULEUR_CALORIES} opacity={survol === null || survol === i ? 1 : 0.55} />
                )}
                <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill={i === dernier ? "#1a1a1a" : ENCRE_SECONDAIRE} fontWeight={i === dernier ? 700 : 400}>
                  {i === dernier ? "Auj." : jourCourt(j.date)}
                </text>
                {i === dernier && j.calories > 0 && (
                  <text x={cx} y={y(j.calories) - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill="#1a1a1a">
                    {nombre(j.calories)}
                  </text>
                )}
              </g>
            );
          })}
          {/* Objectif : ligne de référence fine, nommée dans la légende sous le titre */}
          <line x1={marge.gauche} x2={largeur - marge.droite} y1={y(objectif)} y2={y(objectif)} stroke="#1c2e1e" strokeWidth={1} opacity={0.7} pointerEvents="none" />
        </svg>
      )}
      {survol !== null && largeur > 0 && (
        <Infobulle
          x={marge.gauche + bande * (survol + 0.5)}
          y={y(Math.max(jours[survol].calories, 0))}
          largeur={largeur}
          valeur={`${nombre(jours[survol].calories)} kcal`}
          libelle={dateLongue(jours[survol].date)}
        />
      )}
      <details className="mt-1 text-xs text-c2b-muted">
        <summary className="cursor-pointer font-semibold">Voir les valeurs</summary>
        <table className="mt-2 w-full">
          <tbody>
            {jours.map((j) => (
              <tr key={j.date} className="border-t border-black/5">
                <td className="py-1 first-letter:uppercase">{dateLongue(j.date)}</td>
                <td className="py-1 text-right tabular-nums text-c2b-text">{nombre(j.calories)} kcal</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// ---------- Évolution du poids (ligne + crosshair) ----------

export function GraphiquePoids({ mesures }: { mesures: { date: string; poids_kg: number }[] }) {
  const { ref, largeur } = useLargeur();
  const [survol, setSurvol] = useState<number | null>(null);
  const H = 180;
  const marge = { haut: 18, bas: 26, gauche: 40, droite: 44 };
  const valeurs = mesures.map((m) => m.poids_kg);
  const { ticks, debut, fin } = graduations(Math.min(...valeurs) - 0.5, Math.max(...valeurs) + 0.5, 3);
  const t0 = Date.parse(`${mesures[0].date}T12:00:00Z`);
  const t1 = Date.parse(`${mesures[mesures.length - 1].date}T12:00:00Z`);
  const etendue = Math.max(t1 - t0, 1);
  const x = (date: string) => marge.gauche + ((Date.parse(`${date}T12:00:00Z`) - t0) / etendue) * (largeur - marge.gauche - marge.droite);
  const y = (v: number) => marge.haut + (H - marge.haut - marge.bas) * (1 - (v - debut) / (fin - debut));

  const points = mesures.map((m) => [x(m.date), y(m.poids_kg)] as const);
  const trace = points.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join(" ");
  const aire = `${trace} L${points[points.length - 1][0]},${y(debut)} L${points[0][0]},${y(debut)} Z`;
  const fin_ = points[points.length - 1];

  function surMouvement(e: React.PointerEvent<SVGSVGElement>) {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let proche = 0;
    points.forEach(([qx], i) => {
      if (Math.abs(qx - px) < Math.abs(points[proche][0] - px)) proche = i;
    });
    setSurvol(proche);
  }

  const etiquettesX = [mesures[0], mesures[mesures.length - 1]];

  return (
    <div ref={ref} className="relative">
      {largeur > 0 && (
        <svg
          width={largeur}
          height={H}
          role="img"
          aria-label="Évolution du poids"
          onPointerMove={surMouvement}
          onPointerLeave={() => setSurvol(null)}
          className="touch-pan-y"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={marge.gauche} x2={largeur - marge.droite} y1={y(t)} y2={y(t)} stroke={GRILLE} strokeWidth={1} />
              <text x={marge.gauche - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={ENCRE_SECONDAIRE} style={{ fontVariantNumeric: "tabular-nums" }}>
                {nombre(t, 1)}
              </text>
            </g>
          ))}
          {etiquettesX.map((m, i) => (
            <text key={i} x={x(m.date)} y={H - 8} textAnchor={i === 0 ? "start" : "end"} fontSize={11} fill={ENCRE_SECONDAIRE}>
              {new Date(`${m.date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })}
            </text>
          ))}
          <path d={aire} fill={COULEUR_POIDS} opacity={0.1} />
          <path d={trace} fill="none" stroke={COULEUR_POIDS} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {survol !== null && (
            <line x1={points[survol][0]} x2={points[survol][0]} y1={marge.haut} y2={y(debut)} stroke="#1c2e1e" strokeWidth={1} opacity={0.35} />
          )}
          {survol !== null && survol !== points.length - 1 && (
            <circle cx={points[survol][0]} cy={points[survol][1]} r={4} fill={COULEUR_POIDS} stroke="#fff" strokeWidth={2} />
          )}
          <circle cx={fin_[0]} cy={fin_[1]} r={4} fill={COULEUR_POIDS} stroke="#fff" strokeWidth={2} />
          <text x={fin_[0] + 8} y={fin_[1]} dy="0.32em" fontSize={12} fontWeight={700} fill="#1a1a1a">
            {nombre(valeurs[valeurs.length - 1], 1)}
          </text>
        </svg>
      )}
      {survol !== null && largeur > 0 && (
        <Infobulle
          x={points[survol][0]}
          y={points[survol][1]}
          largeur={largeur}
          valeur={`${nombre(mesures[survol].poids_kg, 1)} kg`}
          libelle={dateLongue(mesures[survol].date)}
        />
      )}
      <details className="mt-1 text-xs text-c2b-muted">
        <summary className="cursor-pointer font-semibold">Voir les valeurs</summary>
        <table className="mt-2 w-full">
          <tbody>
            {[...mesures].reverse().map((m) => (
              <tr key={m.date} className="border-t border-black/5">
                <td className="py-1 first-letter:uppercase">{dateLongue(m.date)}</td>
                <td className="py-1 text-right tabular-nums text-c2b-text">{nombre(m.poids_kg, 1)} kg</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
