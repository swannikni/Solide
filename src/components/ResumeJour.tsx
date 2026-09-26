import type { Nutriment } from "@/components/DetailNutrition";

// Résumé du jour : calories restantes en grand, puis les trois macros.
// Chaque zone ouvre le détail correspondant.
const MACROS: { cle: Exclude<Nutriment, "calories">; libelle: string; couleur: string; excesOk?: boolean }[] = [
  { cle: "proteines", libelle: "Protéines", couleur: "bg-c2b-prot", excesOk: true },
  { cle: "glucides", libelle: "Glucides", couleur: "bg-c2b-gluc" },
  { cle: "lipides", libelle: "Lipides", couleur: "bg-c2b-lip" },
];

export function ResumeJour({
  totaux,
  objectifs,
  onDetail,
}: {
  totaux: Record<Nutriment, number>;
  objectifs: Record<Nutriment, number>;
  onDetail: (n: Nutriment) => void;
}) {
  const nombre = (v: number) => Math.round(v).toLocaleString("fr-FR");
  const reste = Math.round(objectifs.calories - totaux.calories);
  const depasse = reste < 0;
  // Jusqu'à +10 % : « dans la marge » (même tolérance que les objectifs de Progrès).
  const tropHaut = depasse && totaux.calories > objectifs.calories * 1.1;
  const ratio = objectifs.calories > 0 ? Math.min(totaux.calories / objectifs.calories, 1) : 0;

  return (
    <section className="carte p-5">
      <button type="button" onClick={() => onDetail("calories")} className="block w-full text-left" aria-label="Détail des calories">
        <span className="flex items-baseline justify-between">
          <span className="text-[15px] font-semibold text-c2b-green">Calories</span>
          <span className="text-[13px] text-c2b-muted tabular-nums">Objectif {nombre(objectifs.calories)}</span>
        </span>
        <span className="mt-1 flex items-baseline gap-2">
          <span
            className={`text-[44px] font-bold leading-none tracking-tight tabular-nums ${
              tropHaut ? "text-c2b-lip" : "text-c2b-green"
            }`}
          >
            {depasse ? `+${nombre(-reste)}` : nombre(reste)}
          </span>
          <span className="text-[15px] text-c2b-muted">
            {!depasse ? "kcal restantes" : tropHaut ? "kcal en trop" : "kcal · dans la marge"}
          </span>
        </span>
        <span className="mt-4 block h-2.5 overflow-hidden rounded-full bg-c2b-cream-2">
          <span
            className={`block h-full rounded-full transition-all duration-500 ${tropHaut ? "bg-c2b-lip" : "bg-c2b-green"}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </span>
        <span className="mt-2 flex justify-between text-[13px] text-c2b-muted tabular-nums">
          <span>{nombre(totaux.calories)} mangées</span>
          <span>{Math.round((totaux.calories / (objectifs.calories || 1)) * 100)} %</span>
        </span>
      </button>

      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-c2b-cream-2 pt-4">
        {MACROS.map(({ cle, libelle, couleur, excesOk }) => {
          const part = objectifs[cle] > 0 ? totaux[cle] / objectifs[cle] : 0;
          const trop = !excesOk && part > 1.1;
          return (
            <button
              key={cle}
              type="button"
              onClick={() => onDetail(cle)}
              className="rounded-xl p-1.5 -m-1.5 text-left transition active:bg-c2b-cream"
              aria-label={`Détail ${libelle.toLowerCase()}`}
            >
              <span className="block text-[13px] text-c2b-muted">{libelle}</span>
              <span className="mt-0.5 block tabular-nums">
                <span className={`text-[19px] font-bold tracking-tight ${trop ? "text-c2b-lip" : "text-c2b-green"}`}>
                  {nombre(totaux[cle])}
                </span>
                <span className="text-[13px] text-c2b-muted"> / {nombre(objectifs[cle])} g</span>
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-c2b-cream-2">
                <span
                  className={`block h-full rounded-full ${trop ? "bg-c2b-lip" : couleur}`}
                  style={{ width: `${Math.min(part, 1) * 100}%` }}
                />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
