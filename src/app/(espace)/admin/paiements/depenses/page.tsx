import { exigerAdmin } from "@/lib/admin";
import { DepensesClient } from "@/app/(espace)/admin/paiements/depenses/DepensesClient";
import { dateDuJour } from "@/lib/dates";
import type { Depense } from "@/lib/depenses";

export const dynamic = "force-dynamic";

const COLONNES = "id, date, categorie, montant, libelle, moyen";

// Dépenses d'un mois (courses, emballage, livraison, marketing, autres).
export default async function DepensesPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { mois: moisDemande } = await searchParams;
  const aujourdhui = dateDuJour();
  const mois = /^\d{4}-(0[1-9]|1[0-2])$/.test(moisDemande ?? "") ? moisDemande! : aujourdhui.slice(0, 7);
  const [a, m] = mois.split("-").map(Number);
  const suivant = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);

  const [{ data: depenses }, { data: recentes }] = await Promise.all([
    supabase
      .from("application_depenses")
      .select(COLONNES)
      .gte("date", `${mois}-01`)
      .lt("date", suivant)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<Depense[]>(),
    // Libellés déjà utilisés : proposés en un toucher (Marjane, boîtes…).
    supabase
      .from("application_depenses")
      .select("categorie, libelle, montant")
      .not("libelle", "is", null)
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<Pick<Depense, "categorie" | "libelle" | "montant">[]>(),
  ]);

  const vus = new Set<string>();
  const habituelles = (recentes ?? []).filter((r) => {
    const cle = `${r.categorie}:${r.libelle!.trim().toLowerCase()}`;
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <DepensesClient
        key={mois}
        mois={mois}
        aujourdhui={aujourdhui}
        depensesInitiales={(depenses ?? []).map((d) => ({ ...d, montant: Number(d.montant) }))}
        habituelles={habituelles.map((h) => ({ categorie: h.categorie, libelle: h.libelle!, montant: Number(h.montant) }))}
      />
    </div>
  );
}
