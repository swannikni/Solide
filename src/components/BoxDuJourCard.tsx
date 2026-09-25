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

  const portion = Number(commande.portion ?? 1);
  const ingredients = (plat.ingredients ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="carte overflow-hidden border-c2b-gold/30">
      {plat.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={plat.photo_url} alt={plat.nom} className="w-full h-48 object-cover" />
      ) : null}
      <div className="p-4">
        <div className="flex gap-3">
          {!plat.photo_url && (
            <div className="w-14 h-14 rounded-2xl bg-c2b-cream flex-shrink-0 flex items-center justify-center">
              <Package className="text-c2b-green/30" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <span className="lbl text-[10px] tracking-[2px]">
              Votre box du {commande.repas_type === "dejeuner" ? "déjeuner" : "dîner"}
            </span>
            <p className="mt-1 font-serif text-[22px] leading-tight text-c2b-green">{plat.nom}</p>
          </div>
        </div>

        {plat.description && <p className="text-sm text-c2b-muted mt-2">{plat.description}</p>}

        <p className="text-xs font-semibold text-c2b-green mt-2.5">
          {Math.round(plat.calories * portion)} kcal · {Math.round(plat.proteines * portion)}g P ·{" "}
          {Math.round(plat.glucides * portion)}g G · {Math.round(plat.lipides * portion)}g L
          {portion !== 1 && <span className="text-c2b-gold"> · portion adaptée à votre palier</span>}
        </p>

        {ingredients.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-c2b-muted mb-1.5">Ingrédients</p>
            <ul className="flex flex-wrap gap-1.5">
              {ingredients.map((ing) => (
                <li key={ing} className="rounded-full bg-c2b-cream px-2.5 py-1 text-xs text-c2b-green">
                  {ing}
                </li>
              ))}
            </ul>
          </div>
        )}

        {plat.recette && (
          <details className="mt-3 group">
            <summary className="cursor-pointer list-none text-sm font-bold text-c2b-gold">
              <span className="group-open:hidden">Voir la recette →</span>
              <span className="hidden group-open:inline">Masquer la recette</span>
            </summary>
            <p className="mt-2 text-sm text-c2b-green whitespace-pre-line">{plat.recette}</p>
          </details>
        )}

        {dejaAjoutee ? (
          <p className="text-xs font-semibold text-c2b-gold mt-3">✓ Ajoutée à votre journal</p>
        ) : (
          <div className="flex gap-2 mt-4">
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
