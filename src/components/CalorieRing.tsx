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
    <div className="relative w-52 h-52 mx-auto">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
        <circle cx="80" cy="80" r={rayon} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle
          cx="80"
          cy="80"
          r={rayon}
          fill="none"
          stroke={depasse ? "#e07a5f" : "#c9973a"}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circonference}
          strokeDashoffset={circonference * (1 - ratio)}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-[56px] leading-none text-c2b-gold">{Math.round(restantes)}</span>
        <span className="mt-1 text-[11px] font-bold uppercase tracking-[2px] text-c2b-cream/50">
          kcal {depasse ? "en trop" : "restantes"}
        </span>
        <span className="mt-1.5 text-xs font-semibold text-c2b-cream/35">
          {Math.round(consommees)} / {objectif} kcal
        </span>
      </div>
    </div>
  );
}
