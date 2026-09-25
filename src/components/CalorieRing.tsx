// Anneau des calories du jour. Au-delà de l'objectif, on affiche le dépassement
// (« +263 kcal en trop ») et un arc supplémentaire par-dessus l'anneau plein.
// Jusqu'à +10 % : « dans la marge » (même tolérance que les objectifs de Progrès).
export function CalorieRing({
  consommees,
  objectif,
}: {
  consommees: number;
  objectif: number;
}) {
  const rayon = 70;
  const circonference = 2 * Math.PI * rayon;
  const depasse = consommees > objectif;
  const ecart = Math.round(Math.abs(objectif - consommees));
  const dansLaMarge = depasse && consommees <= objectif * 1.1;
  const ratio = objectif > 0 ? Math.min(consommees / objectif, 1) : 0;
  // Part du dépassement, dessinée par-dessus (plafonnée à un tour).
  const ratioExces = depasse && objectif > 0 ? Math.min((consommees - objectif) / objectif, 1) : 0;
  const couleurExces = dansLaMarge ? "#f0d59c" : "#e07a5f"; // or clair : visible sur l'anneau or

  return (
    <div className="relative w-52 h-52 mx-auto">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
        <circle cx="80" cy="80" r={rayon} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle
          cx="80"
          cy="80"
          r={rayon}
          fill="none"
          stroke="#c9973a"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circonference}
          strokeDashoffset={circonference * (1 - ratio)}
          className="transition-all duration-500"
        />
        {depasse && (
          <circle
            cx="80"
            cy="80"
            r={rayon}
            fill="none"
            stroke={couleurExces}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circonference}
            strokeDashoffset={circonference * (1 - ratioExces)}
            className="transition-all duration-500"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-serif text-[52px] leading-none"
          style={{ color: depasse && !dansLaMarge ? "#e07a5f" : "#c9973a" }}
        >
          {depasse ? `+${ecart}` : ecart}
        </span>
        <span className="mt-1 text-[11px] font-bold uppercase tracking-[2px] text-c2b-cream/50">
          {!depasse ? "kcal restantes" : dansLaMarge ? "kcal · dans la marge" : "kcal en trop"}
        </span>
        <span className="mt-1.5 text-xs font-semibold text-c2b-cream/35">
          {Math.round(consommees)} / {objectif} kcal
        </span>
      </div>
    </div>
  );
}
