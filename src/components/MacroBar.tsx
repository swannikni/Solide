export function MacroBar({
  label,
  consomme,
  objectif,
  couleur = "#c9973a",
}: {
  label: string;
  consomme: number;
  objectif: number;
  couleur?: string;
}) {
  const ratio = Math.min(consomme / objectif, 1);

  return (
    <div className="rounded-[10px] bg-white/[0.07] px-2 py-3 text-center">
      <div className="font-serif text-[26px] leading-none text-c2b-cream">
        {Math.round(consomme)}
        <span className="ml-0.5 font-sans text-xs font-semibold text-c2b-gold">g</span>
      </div>
      <div className="mt-1.5 text-[11px] font-bold uppercase tracking-wider text-c2b-cream/60">{label}</div>
      <div className="text-[11px] font-semibold text-c2b-cream/35 whitespace-nowrap">sur {objectif} g</div>
      <div className="mt-2.5 h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${ratio * 100}%`, backgroundColor: couleur }}
        />
      </div>
    </div>
  );
}
