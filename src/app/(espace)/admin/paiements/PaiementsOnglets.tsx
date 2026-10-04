import Link from "next/link";

// Sous-onglets de Paiements : semaine, dépenses, bilan du mois.
export function PaiementsOnglets({ actif, mois, semaine }: { actif: "semaine" | "depenses" | "bilan"; mois: string; semaine?: string }) {
  const onglets = [
    { cle: "semaine", libelle: "Semaine", href: semaine ? `/admin/paiements?semaine=${semaine}` : "/admin/paiements" },
    { cle: "depenses", libelle: "Dépenses", href: `/admin/paiements/depenses?mois=${mois}` },
    { cle: "bilan", libelle: "Bilan du mois", href: `/admin/paiements/bilan?mois=${mois}` },
  ] as const;
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {onglets.map((o) =>
        o.cle === actif ? (
          <span key={o.cle} className="rounded-full bg-c2b-green py-2.5 text-center text-[13px] font-bold text-c2b-cream">
            {o.libelle}
          </span>
        ) : (
          <Link
            key={o.cle}
            href={o.href}
            className="rounded-full border border-c2b-green/15 bg-white py-2.5 text-center text-[13px] font-bold text-c2b-green"
          >
            {o.libelle}
          </Link>
        )
      )}
    </div>
  );
}
