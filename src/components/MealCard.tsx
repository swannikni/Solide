import Image from "next/image";
import { ChevronRight, UtensilsCrossed } from "lucide-react";
import type { RepasJournal } from "@/lib/types";

const SOURCE_LABELS: Record<string, string> = {
  chef2box: "Box Chef2Box",
  code_barres: "Produit scanné",
  manuel: "Saisie manuelle",
};

export function libelleQuantite(repas: Pick<RepasJournal, "quantite" | "unite">): string {
  if (repas.unite === "g") return `${Math.round(repas.quantite * 100)} g`;
  const q = Math.round(repas.quantite * 100) / 100;
  return `${String(q).replace(".", ",")} portion${q > 1 ? "s" : ""}`;
}

export function MealCard({ repas, onModifier }: { repas: RepasJournal; onModifier: (repas: RepasJournal) => void }) {
  return (
    <button
      onClick={() => onModifier(repas)}
      className="carte w-full p-3 flex gap-3 items-center text-left transition hover:border-c2b-gold/40"
    >
      <div className="w-14 h-14 rounded-xl bg-c2b-cream overflow-hidden flex-shrink-0 flex items-center justify-center">
        {repas.photo_url ? (
          <Image src={repas.photo_url} alt={repas.nom} width={56} height={56} className="object-cover w-full h-full" />
        ) : (
          <UtensilsCrossed size={20} className="text-c2b-green/25" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[15px] text-c2b-green truncate">{repas.nom}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-c2b-gold">
          {SOURCE_LABELS[repas.source]} · {libelleQuantite(repas)}
        </p>
        <p className="text-xs text-c2b-muted mt-0.5">
          {Math.round(repas.calories * repas.quantite)} kcal · {Math.round(repas.proteines * repas.quantite)}g P ·{" "}
          {Math.round(repas.glucides * repas.quantite)}g G · {Math.round(repas.lipides * repas.quantite)}g L
        </p>
      </div>
      <ChevronRight size={18} className="text-c2b-muted/40 flex-shrink-0" />
    </button>
  );
}
