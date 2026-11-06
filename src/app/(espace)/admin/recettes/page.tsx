import { exigerAdmin } from "@/lib/admin";
import { RecettesClient, type JourPlanning } from "@/app/(espace)/admin/recettes/RecettesClient";
import { dateDuJour, decalerDate } from "@/lib/dates";
import { lundiDe } from "@/lib/ma-semaine";
import type { Palier } from "@/lib/types";

export const dynamic = "force-dynamic";

type Service = "dejeuner" | "diner";

// Catalogue des recettes : les effectifs par palier de chaque service de la
// semaine viennent du planning de la cuisine (bouton « Reprendre le planning »).
export default async function RecettesPage() {
  const { supabase } = await exigerAdmin();
  const aujourdhui = dateDuJour();
  const j = new Date(`${aujourdhui}T12:00:00Z`).getUTCDay();
  const lundi = j === 0 || j === 6 ? lundiDe(decalerDate(aujourdhui, 2)) : lundiDe(aujourdhui);
  const vendredi = decalerDate(lundi, 4);

  const [{ data: extras }, { data: commandes }, { data: services }] = await Promise.all([
    supabase
      .from("application_cuisine_extras")
      .select("date, repas_type, palier, quantite")
      .gte("date", lundi)
      .lte("date", vendredi)
      .returns<{ date: string; repas_type: Service; palier: Palier | null; quantite: number | null }[]>(),
    supabase
      .from("application_commandes")
      .select("date_livraison, repas_type, palier, quantite, client:application_clients(palier)")
      .gte("date_livraison", lundi)
      .lte("date_livraison", vendredi)
      .neq("statut", "annulee")
      .returns<{ date_livraison: string; repas_type: Service; palier: Palier | null; quantite: number | null; client: { palier: Palier | null } | null }[]>(),
    supabase
      .from("application_cuisine_services")
      .select("date, repas_type, plat")
      .gte("date", lundi)
      .lte("date", vendredi)
      .returns<{ date: string; repas_type: Service; plat: string | null }[]>(),
  ]);

  const jours: JourPlanning[] = [0, 1, 2, 3, 4].map((i) => {
    const date = decalerDate(lundi, i);
    const vide = () => ({ P1: 0, P2: 0, P3: 0, sans: 0 });
    return { date, dejeuner: vide(), diner: vide(), plats: { dejeuner: null, diner: null } };
  });
  const noter = (date: string, service: Service, palier: Palier | null, quantite: number | null) => {
    const jour = jours.find((x) => x.date === date);
    if (!jour) return;
    jour[service][palier ?? "sans"] += quantite && quantite > 0 ? quantite : 1;
  };
  for (const e of extras ?? []) noter(e.date, e.repas_type, e.palier, e.quantite);
  for (const c of commandes ?? []) noter(c.date_livraison, c.repas_type, c.palier ?? c.client?.palier ?? null, c.quantite);
  for (const s of services ?? []) {
    const jour = jours.find((x) => x.date === s.date);
    if (jour) jour.plats[s.repas_type] = s.plat;
  }

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <RecettesClient jours={jours} aujourdhui={aujourdhui} />
    </div>
  );
}
