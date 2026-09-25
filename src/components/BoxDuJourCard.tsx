import Image from "next/image";
import { Package } from "lucide-react";
import type { Commande } from "@/lib/types";

export function BoxDuJourCard({
  commande,
  dejaAjoutee,
  onAjouterTelQuel,
  onAjuster,
}: {
  commande: Commande;
  dejaAjoutee: boolean;
  onAjouterTelQuel: () => void;
  onAjuster: () => void;
}) {
  const plat = commande.plats;
  if (!plat) return null;

  return (
    <div className="carte p-4 flex gap-4 border-c2b-gold/30">
      <div className="w-20 h-20 rounded-2xl bg-c2b-cream overflow-hidden flex-shrink-0 flex items-center justify-center">
        {plat.photo_url ? (
          <Image src={plat.photo_url} alt={plat.nom} width={80} height={80} className="object-cover w-full h-full" />
        ) : (
          <Package className="text-c2b-green/30" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className="lbl text-[10px] tracking-[2px]">
          Votre box du {commande.repas_type === "dejeuner" ? "déjeuner" : "dîner"}
        </span>
        <p className="mt-1 font-bold text-c2b-green truncate">{plat.nom}</p>
        <p className="text-xs text-c2b-muted mt-0.5">
          {plat.calories} kcal · {plat.proteines}g P · {plat.glucides}g G · {plat.lipides}g L
        </p>

        {dejaAjoutee ? (
          <p className="text-xs font-semibold text-c2b-gold mt-2.5">✓ Ajoutée à votre journal</p>
        ) : (
          <div className="flex gap-2 mt-3">
            <button onClick={onAjouterTelQuel} className="btn-primary px-4 py-2 text-[13px]">
              J&apos;ai mangé ça
            </button>
            <button onClick={onAjuster} className="btn-secondary px-4 py-1.5 text-[13px]">
              Ajuster
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
