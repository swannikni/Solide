import { decalerDate } from "@/lib/dates";
import { dansObjectifCalories, proteinesAtteintes, type Badge, type Journee } from "@/lib/progres";

const INITIALES = ["D", "L", "M", "M", "J", "V", "S"];

// Série du moment, semaine en un coup d'œil et badges : de quoi donner envie
// de revenir noter ses repas chaque jour.
export function Motivation({
  serie,
  record,
  aujourdhui,
  jours,
  objectifCalories,
  objectifProteines,
  badges,
}: {
  serie: number;
  record: number;
  aujourdhui: string;
  jours: Map<string, Journee>;
  objectifCalories: number;
  objectifProteines: number;
  badges: Badge[];
}) {
  const semaine = Array.from({ length: 7 }, (_, i) => decalerDate(aujourdhui, i - 6));
  const joursSemaine = semaine.map((d) => jours.get(d)).filter((j): j is Journee => !!j);
  const noteAujourdhui = jours.has(aujourdhui);
  const dansObjectif = joursSemaine.filter((j) => dansObjectifCalories(j, objectifCalories)).length;
  const avecProteines = joursSemaine.filter((j) => proteinesAtteintes(j, objectifProteines)).length;
  const repasSemaine = joursSemaine.reduce((t, j) => t + j.repas, 0);
  const obtenus = badges.filter((b) => b.obtenu).length;
  // Prochain badge : celui qu'on est le plus près de débloquer.
  const prochain = badges
    .filter((b) => !b.obtenu && b.unite)
    .sort((x, y) => y.valeur / y.cible - x.valeur / x.cible)[0];

  return (
    <div className="space-y-4">
      <section className="rounded-[20px] bg-c2b-green p-5 text-c2b-cream">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="lbl mb-1">Série en cours</span>
            <p className="flex items-baseline gap-2">
              <span className="text-[44px] leading-none" aria-hidden>
                🔥
              </span>
              <span className="text-[44px] font-semibold leading-none">{serie}</span>
              <span className="text-sm text-c2b-cream/70">jour{serie > 1 ? "s" : ""} d&apos;affilée</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-c2b-cream/60">Record</p>
            <p className="text-xl font-semibold">
              {record} <span className="text-sm font-normal text-c2b-cream/70">j</span>
            </p>
          </div>
        </div>

        <ol className="mt-5 grid grid-cols-7 gap-1.5" aria-label="Repas notés ces 7 derniers jours">
          {semaine.map((d) => {
            const fait = jours.has(d);
            const estAujourdhui = d === aujourdhui;
            const jour = new Date(`${d}T12:00:00Z`).getUTCDay();
            return (
              <li key={d} className="flex flex-col items-center gap-1.5">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                    fait
                      ? "bg-c2b-gold text-c2b-green"
                      : estAujourdhui
                        ? "border-2 border-dashed border-c2b-gold/70"
                        : "bg-c2b-cream/10"
                  }`}
                  aria-label={`${d} : ${fait ? "noté" : "rien noté"}`}
                >
                  {fait ? "✓" : ""}
                </span>
                <span className={`text-[11px] ${estAujourdhui ? "font-bold text-c2b-gold" : "text-c2b-cream/60"}`}>
                  {INITIALES[jour]}
                </span>
              </li>
            );
          })}
        </ol>

        <p className="mt-4 text-sm text-c2b-cream/85">
          {noteAujourdhui
            ? serie >= record && serie > 1
              ? "Record battu, continuez comme ça !"
              : "Journée validée. Revenez demain pour allonger la série."
            : serie > 0
              ? "Notez un repas aujourd'hui pour garder votre série."
              : "Notez un repas aujourd'hui pour lancer votre série."}
        </p>
      </section>

      <section className="grid grid-cols-3 gap-2.5">
        <Tuile valeur={`${dansObjectif}/7`} libelle="jours dans l'objectif calories" />
        <Tuile valeur={`${avecProteines}/7`} libelle="jours objectif protéines atteint" />
        <Tuile valeur={String(repasSemaine)} libelle={`repas noté${repasSemaine > 1 ? "s" : ""} cette semaine`} />
      </section>

      <section className="carte p-5">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="font-serif text-xl text-c2b-green">Badges</h2>
          <span className="text-sm font-semibold text-c2b-gold">
            {obtenus}/{badges.length}
          </span>
        </div>
        {prochain ? (
          <div className="mb-4">
            <p className="text-xs text-c2b-muted">
              Prochain : <span className="font-semibold text-c2b-green">{prochain.emoji} {prochain.titre}</span> ·{" "}
              {prochain.detail}
            </p>
            <div className="mt-2 flex items-center gap-2.5">
              <div className="flex-1 h-2 rounded-full bg-c2b-green/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-c2b-gold"
                  style={{ width: `${Math.max(4, Math.round((prochain.valeur / prochain.cible) * 100))}%` }}
                />
              </div>
              <span className="text-xs font-bold text-c2b-green whitespace-nowrap">
                {prochain.valeur.toLocaleString("fr-FR")}/{prochain.cible} {prochain.unite}
              </span>
            </div>
          </div>
        ) : (
          <div className="mb-4" />
        )}
        <ul className="grid grid-cols-3 gap-2.5">
          {badges.map((b) => (
            <li
              key={b.id}
              className={`rounded-2xl p-3 text-center ${
                b.obtenu ? "bg-c2b-gold/[0.12]" : "bg-c2b-cream"
              }`}
            >
              <span className={`block text-[28px] leading-none ${b.obtenu ? "" : "grayscale opacity-30"}`} aria-hidden>
                {b.emoji}
              </span>
              <p className={`mt-1.5 text-[12px] font-bold leading-tight ${b.obtenu ? "text-c2b-green" : "text-c2b-muted"}`}>
                {b.titre}
              </p>
              <p className="text-[10px] leading-tight text-c2b-muted mt-0.5">{b.obtenu ? "Obtenu ✓" : b.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Tuile({ valeur, libelle }: { valeur: string; libelle: string }) {
  return (
    <div className="carte p-3.5">
      <p className="text-[26px] font-semibold leading-none text-c2b-text">{valeur}</p>
      <p className="text-[11px] leading-tight text-c2b-muted mt-1.5">{libelle}</p>
    </div>
  );
}
