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

// Ligne de repas façon carte de restaurant : nom, points de conduite, kcal.
export function MealCard({ repas, onModifier }: { repas: RepasJournal; onModifier: (repas: RepasJournal) => void }) {
  const kcal = Math.round(repas.calories * repas.quantite);
  return (
    <button
      onClick={() => onModifier(repas)}
      className="w-full flex gap-3 items-center border-b border-c2b-green/15 py-3 text-left transition active:bg-c2b-green/[0.03]"
    >
      {repas.photo_url && (
        <Image
          src={repas.photo_url}
          alt={repas.nom}
          width={44}
          height={44}
          className="h-11 w-11 flex-shrink-0 rounded-[6px] object-cover"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="flex items-baseline gap-2">
          <span className="truncate text-[15px] font-semibold text-c2b-green">{repas.nom}</span>
          <span className="min-w-[16px] flex-1 translate-y-[-3px] border-b-2 border-dotted border-c2b-green/20" />
          <span className="flex-shrink-0 font-serif text-[18px] leading-none tabular-nums text-c2b-green">{kcal}</span>
        </p>
        <p className="mt-1 text-xs text-c2b-muted tabular-nums">
          {[
            SOURCE_LABELS[repas.source],
            libelleQuantite(repas),
            `${Math.round(repas.proteines * repas.quantite)} P · ${Math.round(repas.glucides * repas.quantite)} G · ${Math.round(repas.lipides * repas.quantite)} L`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </button>
  );
}
