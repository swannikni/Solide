"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Defi, DemandeRecompense, Points, Recompense } from "@/lib/types";

const LIBELLE_DEFI: Record<Defi["type"], string> = {
  jours_notes: "jours avec un repas noté",
  jours_calories: "jours dans l'objectif calories",
  jours_proteines: "jours objectif protéines",
};

const STATUT: Record<DemandeRecompense["statut"], string> = {
  en_attente: "⏳ En préparation",
  remise: "✓ Reçue",
  refusee: "Annulée",
};

const dateCourte = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

// Points, défis en cours et récompenses concrètes à débloquer.
export function Recompenses({
  points,
  defis,
  catalogue,
  demandes,
  aujourdhui,
}: {
  points: Points;
  defis: Defi[];
  catalogue: Recompense[];
  demandes: DemandeRecompense[];
  aujourdhui: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [confirmation, setConfirmation] = useState<Recompense | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState("");

  const defisEnCours = defis.filter((d) => d.date_debut <= aujourdhui && d.date_fin >= aujourdhui);
  const prochaine = catalogue.find((r) => r.cout > points.solde);

  async function reclamer(r: Recompense) {
    setEnCours(true);
    setMessage("");
    const { error } = await supabase.rpc("application_reclamer_recompense", { p_recompense: r.id });
    setEnCours(false);
    setConfirmation(null);
    if (error) {
      setMessage(/insuffisant/.test(error.message) ? "Pas encore assez de points." : "Impossible pour le moment, réessayez.");
      return;
    }
    setMessage(`🎉 ${r.emoji} ${r.titre} débloqué ! Chef2Box a reçu votre demande dans Messages.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[20px] bg-c2b-gold p-5 text-c2b-green">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[2px] text-c2b-green/70">Mes points</p>
            <p className="flex items-baseline gap-2 mt-1">
              <span className="text-[44px] font-semibold leading-none">{points.solde.toLocaleString("fr-FR")}</span>
              <span className="text-sm font-semibold">pts</span>
            </p>
          </div>
          {prochaine && (
            <p className="text-right text-xs font-semibold max-w-[45%]">
              Plus que {(prochaine.cout - points.solde).toLocaleString("fr-FR")} pts pour :<br />
              <span className="text-sm">
                {prochaine.emoji} {prochaine.titre}
              </span>
            </p>
          )}
        </div>
        <details className="mt-3 group">
          <summary className="cursor-pointer list-none text-xs font-bold underline-offset-2 group-open:underline">
            Comment gagner des points ?
          </summary>
          <ul className="mt-2 space-y-0.5 text-[13px]">
            <li>+10 par jour où vous notez vos repas</li>
            <li>+10 par jour dans votre objectif calories</li>
            <li>+10 par jour objectif protéines atteint</li>
            <li>+50 tous les 7 jours d&apos;affilée 🔥</li>
            <li>+ les points des défis Chef2Box</li>
          </ul>
        </details>
      </section>

      {defisEnCours.map((d) => {
        const fait = Math.min(d.fait ?? 0, d.cible);
        const reussi = fait >= d.cible;
        return (
          <section key={d.id} className="carte p-5 border-c2b-gold/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="lbl mb-1">🏁 Défi Chef2Box · jusqu&apos;au {dateCourte(d.date_fin)}</span>
                <p className="font-serif text-xl text-c2b-green leading-tight">{d.titre}</p>
                <p className="text-xs text-c2b-muted mt-1">
                  {d.cible} {LIBELLE_DEFI[d.type]}
                </p>
              </div>
              <span className="rounded-full bg-c2b-gold/15 px-2.5 py-1 text-xs font-bold text-c2b-green whitespace-nowrap">
                +{d.points} pts
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2.5">
              <div className="flex-1 h-2.5 rounded-full bg-c2b-green/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-c2b-gold"
                  style={{ width: `${Math.max(4, Math.round((fait / d.cible) * 100))}%` }}
                />
              </div>
              <span className="text-sm font-bold text-c2b-green">
                {fait}/{d.cible}
              </span>
            </div>
            {reussi && <p className="text-sm font-bold text-c2b-green mt-2">🏆 Défi réussi, points gagnés !</p>}
          </section>
        );
      })}

      <section className="carte p-5">
        <h2 className="font-serif text-xl text-c2b-green">Récompenses</h2>
        <p className="text-xs text-c2b-muted mt-0.5 mb-4">Échangez vos points contre de vrais cadeaux Chef2Box.</p>
        <ul className="space-y-2.5">
          {catalogue.map((r) => {
            const pourcent = Math.min(100, Math.round((points.solde / r.cout) * 100));
            const accessible = points.solde >= r.cout;
            return (
              <li
                key={r.id}
                className={`rounded-2xl p-3.5 flex items-center gap-3 ${accessible ? "bg-c2b-gold/[0.14]" : "bg-c2b-cream"}`}
              >
                <span className={`text-[30px] leading-none ${accessible ? "" : "grayscale opacity-50"}`} aria-hidden>
                  {r.emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-c2b-green">{r.titre}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-c2b-green/10 overflow-hidden">
                      <div className="h-full rounded-full bg-c2b-gold" style={{ width: `${pourcent}%` }} />
                    </div>
                    <span className="text-[11px] font-semibold text-c2b-muted whitespace-nowrap">
                      {r.cout.toLocaleString("fr-FR")} pts
                    </span>
                  </div>
                </div>
                {accessible && (
                  <button
                    onClick={() => setConfirmation(r)}
                    className="btn-primary px-3.5 py-2 text-xs flex-shrink-0"
                  >
                    Débloquer
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {confirmation && (
          <div className="mt-4 rounded-2xl border border-c2b-gold/50 bg-white p-4">
            <p className="text-sm text-c2b-green">
              Échanger <span className="font-bold">{confirmation.cout.toLocaleString("fr-FR")} points</span> contre{" "}
              <span className="font-bold">
                {confirmation.emoji} {confirmation.titre}
              </span>{" "}
              ? Chef2Box la prépare avec votre prochaine livraison.
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => reclamer(confirmation)} disabled={enCours} className="btn-primary px-4 py-2 text-sm">
                {enCours ? "..." : "Oui, je débloque"}
              </button>
              <button onClick={() => setConfirmation(null)} className="btn-secondary px-4 py-2 text-sm">
                Annuler
              </button>
            </div>
          </div>
        )}
        {message && <p className="text-sm font-semibold text-c2b-green mt-3">{message}</p>}

        {demandes.length > 0 && (
          <div className="mt-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-c2b-muted mb-2">Mes récompenses</p>
            <ul className="divide-y divide-black/5">
              {demandes.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-c2b-green truncate">{d.titre}</span>
                  <span className={`text-xs font-semibold whitespace-nowrap ${d.statut === "remise" ? "text-c2b-green" : "text-c2b-muted"}`}>
                    {STATUT[d.statut]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
