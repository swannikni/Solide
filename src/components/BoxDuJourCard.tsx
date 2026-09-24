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
    <div className="bg-white rounded-2xl border border-c2b-gold/30 p-4 flex gap-4">
      <div className="w-20 h-20 rounded-xl bg-c2b-cream overflow-hidden flex-shrink-0 flex items-center justify-center">
        {plat.photo_url ? (
          <Image src={plat.photo_url} alt={plat.nom} width={80} height={80} className="object-cover w-full h-full" />
        ) : (
          <Package className="text-c2b-green/40" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-wide text-c2b-gold font-medium">
          Votre box du {commande.repas_type === "dejeuner" ? "déjeuner" : "dîner"}
        </p>
        <p className="font-medium text-c2b-green truncate">{plat.nom}</p>
        <p className="text-xs text-c2b-green/60 mt-0.5">
          {plat.calories} kcal · {plat.proteines}g prot · {plat.glucides}g gluc · {plat.lipides}g lip
        </p>

        {dejaAjoutee ? (
          <p className="text-xs text-c2b-green/60 mt-2">✓ Ajoutée à votre journal</p>
        ) : (
          <div className="flex gap-2 mt-2">
            <button
              onClick={onAjouterTelQuel}
              className="text-xs bg-c2b-green text-c2b-cream px-3 py-1.5 rounded-lg font-medium"
            >
              J'ai mangé ça
            </button>
            <button
              onClick={onAjuster}
              className="text-xs border border-c2b-green/20 text-c2b-green px-3 py-1.5 rounded-lg"
            >
              Ajuster
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
