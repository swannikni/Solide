import { exigerAdmin } from "@/lib/admin";
import { RecompensesAdmin } from "@/app/(espace)/admin/recompenses/RecompensesAdmin";
import type { DemandeRecompense, Defi, Recompense } from "@/lib/types";
import { dateDuJour } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function RecompensesAdminPage() {
  const { supabase } = await exigerAdmin();
  const [{ data: demandes }, { data: defis }, { data: catalogue }, { data: parametre }] = await Promise.all([
    supabase
      .from("application_recompenses_demandes")
      .select("*, client:application_clients(nom)")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<(DemandeRecompense & { client: { nom: string } | null })[]>(),
    supabase.from("application_defis").select("*").order("date_debut", { ascending: false }).limit(30).returns<Defi[]>(),
    supabase.from("application_recompenses").select("*").order("cout").returns<Recompense[]>(),
    supabase.from("application_parametres").select("valeur").eq("cle", "recompenses_actives").maybeSingle(),
  ]);

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <RecompensesAdmin
        demandesInitiales={demandes ?? []}
        defisInitiaux={defis ?? []}
        catalogueInitial={catalogue ?? []}
        aujourdhui={dateDuJour()}
        activesInitial={parametre?.valeur === true}
      />
    </div>
  );
}
