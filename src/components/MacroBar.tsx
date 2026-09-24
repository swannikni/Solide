export function MacroBar({
  label,
  consomme,
  objectif,
  unite = "g",
  couleur = "#c9973a",
}: {
  label: string;
  consomme: number;
  objectif: number;
  unite?: string;
  couleur?: string;
}) {
  const ratio = Math.min(consomme / objectif, 1);

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium text-c2b-green">{label}</span>
        <span className="text-c2b-green/60">
          {Math.round(consomme)} / {objectif} {unite}
        </span>
      </div>
      <div className="h-2 rounded-full bg-c2b-green/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${ratio * 100}%`, backgroundColor: couleur }}
        />
      </div>
    </div>
  );
}
