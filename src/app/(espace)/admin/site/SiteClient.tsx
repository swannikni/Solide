"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import { decalerDate } from "@/lib/dates";

export interface StatsSite {
  jours: { jour: string; visites: number; whatsapp: number; q_debut: number; q_fin: number }[];
  sources: { source: string; visites: number; whatsapp: number }[];
  boutons: { bouton: string; clics: number }[];
  appareils: Record<string, number>;
  premier: string | null;
}

const PERIODES = [
  { jours: 7, libelle: "7 jours" },
  { jours: 30, libelle: "30 jours" },
  { jours: 90, libelle: "3 mois" },
];
const LIEN_INSTAGRAM = "https://chef2box.com/?utm_source=instagram";
const LIEN_MOI = "https://chef2box.com/?moi=1";

const nb = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const date = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { ...o, timeZone: "UTC" });

function totaux(s: StatsSite) {
  return s.jours.reduce(
    (t, j) => ({ visites: t.visites + j.visites, whatsapp: t.whatsapp + j.whatsapp, qDebut: t.qDebut + j.q_debut, qFin: t.qFin + j.q_fin }),
    { visites: 0, whatsapp: 0, qDebut: 0, qFin: 0 }
  );
}

// Variation par rapport à la période précédente (seulement si elle a des données).
function Evolution({ actuel, avant }: { actuel: number; avant: number }) {
  if (avant <= 0) return null;
  const v = Math.round(((actuel - avant) / avant) * 100);
  return (
    <p className={`mt-1 text-[11px] font-bold ${v >= 0 ? "text-emerald-700" : "text-red-700"}`}>
      {v >= 0 ? "▲ +" : "▼ "}
      {v} %
    </p>
  );
}

export function SiteClient({ jours, debut, fin, stats, avant }: { jours: number; debut: string; fin: string; stats: StatsSite; avant: StatsSite }) {
  const [choisi, setChoisi] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  const t = totaux(stats);
  const tAvant = totaux(avant);
  // Tous les jours de la période, même sans visite.
  const parJour = new Map(stats.jours.map((j) => [j.jour, j]));
  const serie = Array.from({ length: jours }, (_, i) => {
    const jour = decalerDate(debut, i);
    return parJour.get(jour) ?? { jour, visites: 0, whatsapp: 0, q_debut: 0, q_fin: 0 };
  });
  const max = Math.max(1, ...serie.map((j) => j.visites));
  const jourMax = serie.reduce((a, b) => (b.visites > a.visites ? b : a), serie[0]);
  const detail = choisi ? serie.find((j) => j.jour === choisi) : null;

  const totalAppareils = Object.values(stats.appareils).reduce((a, b) => a + b, 0);
  const mobile = pct(stats.appareils.mobile ?? 0, totalAppareils);
  const premierJour = stats.premier ? new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date(stats.premier)) : null;
  const periodeIncomplete = premierJour && premierJour > debut;

  async function copierLien() {
    try {
      await navigator.clipboard.writeText(LIEN_INSTAGRAM);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      window.prompt("Copiez ce lien :", LIEN_INSTAGRAM);
    }
  }

  const tuiles = [
    { valeur: nb(t.visites), libelle: "visites", evolution: <Evolution actuel={t.visites} avant={tAvant.visites} /> },
    {
      valeur: nb(t.whatsapp),
      libelle: "clics WhatsApp",
      note: t.visites ? `${pct(t.whatsapp, t.visites)} % des visites` : null,
      evolution: <Evolution actuel={t.whatsapp} avant={tAvant.whatsapp} />,
    },
    { valeur: nb(t.qFin), libelle: "bilans terminés", note: t.qDebut ? `sur ${nb(t.qDebut)} commencés` : null },
    { valeur: nb(Math.round((t.visites / jours) * 10) / 10), libelle: "visites / jour", note: totalAppareils ? `${mobile} % sur téléphone` : null },
  ];

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
      <AdminOnglets />
      <div>
        <span className="lbl mb-2">Espace admin</span>
        <h1 className="titre text-[34px]">
          Fréquentation <em>du site</em>
        </h1>
        <p className="mt-1 text-xs text-c2b-muted">
          chef2box.com · du {date(debut, { day: "numeric", month: "short" })} au {date(fin, { day: "numeric", month: "short" })}
        </p>
      </div>

      <nav className="flex gap-1.5">
        {PERIODES.map((p) => (
          <Link
            key={p.jours}
            href={`/admin/site?jours=${p.jours}`}
            className={`rounded-full border-[1.5px] px-3.5 py-1.5 text-[13px] font-semibold ${
              p.jours === jours ? "bg-c2b-green border-c2b-green text-white" : "bg-white border-c2b-green/15 text-c2b-green"
            }`}
          >
            {p.libelle}
          </Link>
        ))}
      </nav>

      {!stats.premier ? (
        <section className="carte p-5 text-center">
          <p className="font-bold text-c2b-green">Pas encore de visite enregistrée</p>
          <p className="mt-1 text-sm text-c2b-muted">
            Le compteur démarre dès que la nouvelle version du site est en ligne (le zip à glisser dans Netlify, projet « chef2box »).
          </p>
        </section>
      ) : (
        <>
          {periodeIncomplete && (
            <p className="-mt-2 text-xs text-c2b-muted">Comptage commencé le {date(premierJour!, { day: "numeric", month: "long" })} : la période n&apos;est pas complète.</p>
          )}

          {/* Chiffres clés */}
          <section className="grid grid-cols-2 gap-2">
            {tuiles.map((x) => (
              <div key={x.libelle} className="carte p-3.5">
                <p className="font-serif text-[30px] leading-none text-c2b-green">{x.valeur}</p>
                <p className="mt-1 text-[12px] font-semibold text-c2b-text">{x.libelle}</p>
                {x.note && <p className="text-[11px] text-c2b-muted">{x.note}</p>}
                {x.evolution}
              </div>
            ))}
          </section>
          {tAvant.visites > 0 && <p className="-mt-3 text-[11px] text-c2b-muted">▲ ▼ par rapport aux {PERIODES.find((p) => p.jours === jours)?.libelle} d&apos;avant.</p>}

          {/* Visites par jour */}
          <section className="carte p-4">
            <h2 className="font-bold text-c2b-green">Visites par jour</h2>
            <p className="mt-0.5 min-h-[18px] text-xs text-c2b-muted">
              {detail ? (
                <>
                  <strong className="text-c2b-text">{date(detail.jour, { weekday: "long", day: "numeric", month: "long" })}</strong> · {detail.visites} visite
                  {detail.visites > 1 ? "s" : ""} · {detail.whatsapp} clic{detail.whatsapp > 1 ? "s" : ""} WhatsApp
                  {detail.q_fin ? ` · ${detail.q_fin} bilan${detail.q_fin > 1 ? "s" : ""}` : ""}
                </>
              ) : (
                "Touchez une barre pour voir le détail du jour."
              )}
            </p>
            <div className="relative mt-3 h-36 border-b border-black/10" role="img" aria-label={`Visites par jour, maximum ${jourMax.visites}`}>
              <div className="absolute inset-0 flex items-end gap-[2px]">
                {serie.map((j) => {
                  const actif = choisi === j.jour;
                  return (
                    <button
                      key={j.jour}
                      type="button"
                      onClick={() => setChoisi(actif ? null : j.jour)}
                      onMouseEnter={() => setChoisi(j.jour)}
                      className="relative flex h-full min-w-0 flex-1 items-end justify-center"
                      aria-label={`${date(j.jour, { day: "numeric", month: "long" })} : ${j.visites} visites`}
                    >
                      {j.visites > 0 && (
                        <span
                          className={`block w-full max-w-[24px] rounded-t-[4px] transition-colors ${
                            choisi && !actif ? "bg-c2b-green/35" : "bg-c2b-green"
                          }`}
                          style={{ height: `${(j.visites / max) * 100}%` }}
                        />
                      )}
                      {j.jour === jourMax.jour && j.visites > 0 && !choisi && (
                        <span
                          className="absolute left-1/2 -translate-x-1/2 text-[11px] font-bold tabular-nums text-c2b-text"
                          style={{ bottom: `calc(${(j.visites / max) * 100}% + 2px)` }}
                        >
                          {j.visites}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-c2b-muted">
              <span>{date(debut, { day: "numeric", month: "short" })}</span>
              <span>{date(fin, { day: "numeric", month: "short" })}</span>
            </div>
          </section>

          {/* Sources */}
          {stats.sources.length > 0 && (
            <section className="carte p-4">
              <h2 className="font-bold text-c2b-green">D&apos;où viennent les visiteurs</h2>
              <ul className="mt-3 space-y-2.5">
                {stats.sources
                  .filter((s) => s.visites > 0 || s.whatsapp > 0)
                  .map((s) => (
                    <li key={s.source}>
                      <p className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-semibold text-c2b-text">{s.source}</span>
                        <span className="tabular-nums text-xs text-c2b-muted">
                          <strong className="text-c2b-text">{s.visites}</strong> visite{s.visites > 1 ? "s" : ""} ({pct(s.visites, t.visites)} %)
                          {s.whatsapp > 0 && ` · ${s.whatsapp} WhatsApp`}
                        </span>
                      </p>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/5">
                        <div className="h-full rounded-full bg-c2b-green" style={{ width: `${pct(s.visites, t.visites)}%` }} />
                      </div>
                    </li>
                  ))}
              </ul>
              <p className="mt-3 text-[11px] text-c2b-muted">« Direct » : lien tapé, favori, ou appli qui ne dit pas d&apos;où vient le visiteur (souvent Instagram ou WhatsApp).</p>
            </section>
          )}

          {/* Boutons WhatsApp */}
          {stats.boutons.length > 0 && (
            <section className="carte p-4">
              <h2 className="font-bold text-c2b-green">Boutons WhatsApp cliqués</h2>
              <dl className="mt-2 divide-y divide-black/5 text-sm">
                {stats.boutons.map((b) => (
                  <div key={b.bouton} className="flex justify-between py-1.5">
                    <dt className="text-c2b-text">{b.bouton}</dt>
                    <dd className="tabular-nums font-semibold">{b.clics}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </>
      )}

      {/* Astuce Instagram */}
      <section className="carte p-4">
        <h2 className="font-bold text-c2b-green">Astuce : suivre Instagram</h2>
        <p className="mt-1 text-sm text-c2b-muted">
          Instagram ne dit pas toujours d&apos;où vient le visiteur. Mets ce lien dans ta bio et tes stories : chaque visite sera comptée « Instagram ».
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-c2b-green/[0.06] px-3 py-2 text-[13px] text-c2b-green">{LIEN_INSTAGRAM}</code>
          <button
            type="button"
            onClick={copierLien}
            className="flex shrink-0 items-center gap-1 rounded-full bg-c2b-green px-3.5 py-2 text-[13px] font-bold text-c2b-cream"
          >
            {copie ? <Check size={14} /> : <Copy size={14} />} {copie ? "Copié" : "Copier"}
          </button>
        </div>
      </section>

      {/* Ses propres visites */}
      <section className="carte p-4">
        <h2 className="font-bold text-c2b-green">Ne pas compter tes propres visites</h2>
        <p className="mt-1 text-sm text-c2b-muted">Ouvre ce lien une fois sur chaque téléphone ou ordinateur que tu utilises : tes visites sur cet appareil ne seront plus comptées.</p>
        <a
          href={LIEN_MOI}
          target="_blank"
          rel="noopener"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-c2b-green/20 bg-white px-3.5 py-2 text-[13px] font-bold text-c2b-green"
        >
          <ExternalLink size={14} /> Exclure cet appareil
        </a>
      </section>

      <p className="text-[11px] text-c2b-muted">
        Sans cookies et sans données personnelles. Une visite = une personne qui ouvre le site (comptée une fois tant que la page reste ouverte). Les robots ne sont pas comptés.
      </p>
    </main>
  );
}
