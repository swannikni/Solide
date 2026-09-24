import Image from "next/image";
import { Trash2, UtensilsCrossed } from "lucide-react";
import type { RepasJournal } from "@/lib/types";
import { REPAS_TYPE_LABELS } from "@/lib/macros";

const SOURCE_LABELS: Record<string, string> = {
  chef2box: "Box Chef2Box",
  code_barres: "Produit scanné",
  manuel: "Saisie manuelle",
};

export function MealCard({
  repas,
  onSupprimer,
}: {
  repas: RepasJournal;
  onSupprimer: (id: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-c2b-green/10 p-3 flex gap-3 items-center">
      <div className="w-14 h-14 rounded-lg bg-c2b-cream overflow-hidden flex-shrink-0 flex items-center justify-center">
        {repas.photo_url ? (
          <Image src={repas.photo_url} alt={repas.nom} width={56} height={56} className="object-cover w-full h-full" />
        ) : (
          <UtensilsCrossed size={20} className="text-c2b-green/30" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="font-medium text-c2b-green truncate">{repas.nom}</p>
          <button onClick={() => onSupprimer(repas.id)} className="text-c2b-green/30 hover:text-red-600 ml-2">
            <Trash2 size={16} />
          </button>
        </div>
        <p className="text-[11px] text-c2b-green/50">
          {REPAS_TYPE_LABELS[repas.repas_type]} · {SOURCE_LABELS[repas.source]}
        </p>
        <p className="text-xs text-c2b-green/70 mt-0.5">
          {Math.round(repas.calories * repas.quantite)} kcal · {Math.round(repas.proteines * repas.quantite)}g P ·{" "}
          {Math.round(repas.glucides * repas.quantite)}g G · {Math.round(repas.lipides * repas.quantite)}g L
        </p>
      </div>
    </div>
  );
}
