import Image from "next/image";
import type { RepasJournal } from "@/lib/types";
import { estLiquide } from "@/lib/portions";

// Origine affichée seulement quand elle apporte quelque chose.
const SOURCE_LABELS: Record<string, string | null> = {
  chef2box: "Chef2Box",
  code_barres: "Scanné",
  manuel: null,
};

export function libelleQuantite(repas: Pick<RepasJournal, "quantite" | "unite"> & { nom?: string }): string {
  if (repas.unite === "g") return `${Math.round(repas.quantite * 100)} ${estLiquide(repas.nom ?? "") ? "ml" : "g"}`;
  const q = Math.round(repas.quantite * 100) / 100;
  return `${String(q).replace(".", ",")} portion${q > 1 ? "s" : ""}`;
}

// Ligne d'aliment dans la carte d'un repas : nom et détail à gauche, kcal à droite.
export function MealCard({ repas, onModifier }: { repas: RepasJournal; onModifier: (repas: RepasJournal) => void }) {
  const kcal = Math.round(repas.calories * repas.quantite);
  return (
    <button
      onClick={() => onModifier(repas)}
      className="w-full flex gap-3 items-center border-t border-c2b-cream-2 py-2.5 text-left transition active:opacity-70"
    >
      {repas.photo_url && (
        <Image
          src={repas.photo_url}
          alt={repas.nom}
          width={40}
          height={40}
          className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="truncate text-[15px] font-medium text-c2b-text">{repas.nom}</p>
        <p className="mt-0.5 text-[13px] text-c2b-muted tabular-nums">
          {[
            SOURCE_LABELS[repas.source],
            libelleQuantite(repas),
            `P ${Math.round(repas.proteines * repas.quantite)} · G ${Math.round(repas.glucides * repas.quantite)} · L ${Math.round(repas.lipides * repas.quantite)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <span className="flex-shrink-0 text-[15px] font-semibold tabular-nums text-c2b-green">{kcal}</span>
    </button>
  );
}
