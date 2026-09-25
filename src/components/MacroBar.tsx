// Barre d'un macronutriment. Au-delà de l'objectif, l'excédent est affiché :
// pour les protéines ce n'est pas un problème (« ✓ +99 g »), pour les glucides
// et les lipides il apparaît en corail.
export function MacroBar({
  label,
  consomme,
  objectif,
  couleur = "#c9973a",
  depassementOk = false,
}: {
  label: string;
  consomme: number;
  objectif: number;
  couleur?: string;
  depassementOk?: boolean;
}) {
  const ratio = objectif > 0 ? Math.min(consomme / objectif, 1) : 0;
  const exces = Math.round(consomme - objectif);
  // Petite marge (10 %) avant de signaler un dépassement.
  const depasse = objectif > 0 && consomme > objectif * 1.1;

  return (
    <div className="rounded-[10px] bg-white/[0.07] px-2 py-3 text-center">
      <div className="font-serif text-[26px] leading-none text-c2b-cream">
        {Math.round(consomme)}
        <span className="ml-0.5 font-sans text-xs font-semibold text-c2b-gold">g</span>
      </div>
      <div className="mt-1.5 text-[11px] font-bold uppercase tracking-wider text-c2b-cream/60">{label}</div>
      <div className="text-[11px] font-semibold whitespace-nowrap">
        {depasse ? (
          <span style={{ color: depassementOk ? "#9db8a0" : "#e07a5f" }}>
            {depassementOk ? "✓ " : ""}+{exces} g
          </span>
        ) : (
          <span className="text-c2b-cream/35">sur {objectif} g</span>
        )}
      </div>
      <div className="mt-2.5 h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${ratio * 100}%`, backgroundColor: depasse && !depassementOk ? "#e07a5f" : couleur }}
        />
      </div>
    </div>
  );
}
