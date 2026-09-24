export function CalorieRing({
  consommees,
  objectif,
}: {
  consommees: number;
  objectif: number;
}) {
  const restantes = Math.max(objectif - consommees, 0);
  const ratio = Math.min(consommees / objectif, 1);
  const rayon = 70;
  const circonference = 2 * Math.PI * rayon;
  const depasse = consommees > objectif;

  return (
    <div className="relative w-48 h-48 mx-auto">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
        <circle
          cx="80"
          cy="80"
          r={rayon}
          fill="none"
          stroke="#1c2e1e1a"
          strokeWidth="14"
        />
        <circle
          cx="80"
          cy="80"
          r={rayon}
          fill="none"
          stroke={depasse ? "#b5482f" : "#c9973a"}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circonference}
          strokeDashoffset={circonference * (1 - ratio)}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold text-c2b-green">{Math.round(restantes)}</span>
        <span className="text-xs text-c2b-green/60 uppercase tracking-wide">
          kcal {depasse ? "en trop" : "restantes"}
        </span>
        <span className="text-[11px] text-c2b-green/40 mt-1">
          {Math.round(consommees)} / {objectif} kcal
        </span>
      </div>
    </div>
  );
}
