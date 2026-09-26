import type { Nutriment } from "@/components/DetailNutrition";

// Bilan du jour présenté comme une étiquette de valeurs nutritionnelles :
// gros filets, chiffres alignés, % de l'objectif en colonne de droite.
// Chaque ligne s'ouvre sur le détail.
export function EtiquetteJour({
  totaux,
  objectifs,
  titre,
  onDetail,
}: {
  totaux: Record<Nutriment, number>;
  objectifs: Record<Nutriment, number>;
  titre: string;
  onDetail: (n: Nutriment) => void;
}) {
  const reste = Math.round(objectifs.calories - totaux.calories);
  const depasse = reste < 0;
  const dansLaMarge = depasse && totaux.calories <= objectifs.calories * 1.1;
  const ratio = objectifs.calories > 0 ? Math.min(totaux.calories / objectifs.calories, 1) : 0;
  const nombre = (v: number) => Math.round(v).toLocaleString("fr-FR");

  const lignes: { cle: Exclude<Nutriment, "calories">; libelle: string; excesOk?: boolean }[] = [
    { cle: "proteines", libelle: "Protéines", excesOk: true },
    { cle: "glucides", libelle: "Glucides" },
    { cle: "lipides", libelle: "Lipides" },
  ];

  return (
    <section className="bg-white border-[1.5px] border-c2b-green px-4 pt-3 pb-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-[22px] leading-none text-c2b-green">{titre}</h2>
        <span className="text-xs text-c2b-muted">
          objectif <span className="font-bold tabular-nums text-c2b-green">{nombre(objectifs.calories)}</span> kcal
        </span>
      </div>
      <div className="mt-2 h-[7px] bg-c2b-green" />

      <button
        type="button"
        onClick={() => onDetail("calories")}
        className="block w-full py-3 text-left"
        aria-label="Détail des calories"
      >
        <span className="text-[13px] font-bold text-c2b-green">
          {!depasse ? "Il reste" : dansLaMarge ? "Dans la marge" : "Au-dessus de l'objectif"}
        </span>
        <span className="flex items-baseline gap-1.5">
          <span
            className={`font-serif text-[60px] leading-[1.05] tabular-nums ${
              depasse && !dansLaMarge ? "text-[#c2573a]" : "text-c2b-green"
            }`}
          >
            {depasse ? `+${nombre(-reste)}` : nombre(reste)}
          </span>
          <span className="text-lg font-bold text-c2b-green">kcal</span>
        </span>
        <span className="mt-2 block h-[5px] bg-c2b-cream-2">
          <span
            className={`block h-full ${depasse && !dansLaMarge ? "bg-[#c2573a]" : "bg-c2b-gold"}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </span>
        <span className="mt-1.5 flex justify-between text-xs text-c2b-muted tabular-nums">
          <span>
            <span className="font-bold text-c2b-green">{nombre(totaux.calories)}</span> mangées
          </span>
          <span>{Math.round(ratio * 100)} %</span>
        </span>
      </button>

      <div className="h-[3px] bg-c2b-green" />
      <div className="flex justify-end py-1 text-[11px] font-bold text-c2b-green">% de l&apos;objectif</div>
      <div className="h-px bg-c2b-green/60" />

      {lignes.map(({ cle, libelle, excesOk }) => {
        const pourcent = objectifs[cle] > 0 ? Math.round((totaux[cle] / objectifs[cle]) * 100) : 0;
        const trop = !excesOk && pourcent > 110;
        return (
          <button
            key={cle}
            type="button"
            onClick={() => onDetail(cle)}
            className="block w-full border-b border-c2b-green/25 py-2.5 text-left last:border-b-0"
            aria-label={`Détail ${libelle.toLowerCase()}`}
          >
            <span className="flex items-baseline gap-2 tabular-nums">
              <span className="font-bold text-c2b-green">{libelle}</span>
              <span className="text-sm text-c2b-green">
                {nombre(totaux[cle])} g <span className="text-c2b-muted">/ {nombre(objectifs[cle])} g</span>
              </span>
              <span className={`ml-auto font-bold ${trop ? "text-[#c2573a]" : "text-c2b-green"}`}>
                {pourcent} %{excesOk && pourcent >= 100 ? " ✓" : ""}
              </span>
            </span>
            <span className="mt-1.5 block h-[3px] bg-c2b-cream-2">
              <span
                className={`block h-full ${trop ? "bg-[#c2573a]" : "bg-c2b-green"}`}
                style={{ width: `${Math.min(pourcent, 100)}%` }}
              />
            </span>
          </button>
        );
      })}
    </section>
  );
}
