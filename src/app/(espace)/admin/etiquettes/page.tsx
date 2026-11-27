import { exigerAdmin } from "@/lib/admin";
import { dateDuJour, decalerDate } from "@/lib/dates";
import type { Palier } from "@/lib/types";
import { EtiquettesClient, type JourEtiquettes, type MacrosPlat } from "@/app/(espace)/admin/etiquettes/EtiquettesClient";

export const dynamic = "force-dynamic";

type Service = "dejeuner" | "diner";

// Étiquettes des box : un jour, un service, les macros du plat par palier,
// puis un PDF 62 × 29 mm (une étiquette par box, ordre de la fiche cuisine).
export default async function EtiquettesPage() {
  const { supabase } = await exigerAdmin();
  const aujourdhui = dateDuJour();
  const debut = decalerDate(aujourdhui, -3);
  const fin = decalerDate(aujourdhui, 10);

  const [{ data: clients }, { data: commandes }, { data: extras }, { data: services }, { data: macros }] = await Promise.all([
    supabase.from("application_clients").select("id, nom, palier").eq("est_admin", false).returns<{ id: string; nom: string; palier: Palier | null }[]>(),
    supabase
      .from("application_commandes")
      .select("client_id, date_livraison, repas_type, palier, quantite")
      .gte("date_livraison", debut)
      .lte("date_livraison", fin)
      .neq("statut", "annulee")
      .returns<{ client_id: string; date_livraison: string; repas_type: Service; palier: Palier | null; quantite: number | null }[]>(),
    supabase
      .from("application_cuisine_extras")
      .select("date, repas_type, nom, palier, quantite")
      .gte("date", debut)
      .lte("date", fin)
      .returns<{ date: string; repas_type: Service; nom: string; palier: Palier | null; quantite: number | null }[]>(),
    supabase
      .from("application_cuisine_services")
      .select("date, repas_type, plat")
      .gte("date", debut)
      .lte("date", fin)
      .returns<{ date: string; repas_type: Service; plat: string | null }[]>(),
    supabase.from("application_macros_plats").select("plat_cle, palier, proteines, glucides, lipides, kcal").returns<MacrosPlat[]>(),
  ]);

  const parClient = new Map((clients ?? []).map((c) => [c.id, c]));
  const jours = new Map<string, JourEtiquettes>();
  const jour = (date: string) => {
    if (!jours.has(date)) jours.set(date, { date, plats: { dejeuner: "", diner: "" }, lignes: { dejeuner: [], diner: [] } });
    return jours.get(date)!;
  };
  for (const s of services ?? []) jour(s.date).plats[s.repas_type] = (s.plat ?? "").trim();
  for (const c of commandes ?? []) {
    const client = parClient.get(c.client_id);
    if (client) jour(c.date_livraison).lignes[c.repas_type].push({ nom: client.nom, palier: c.palier ?? client.palier, quantite: c.quantite ?? 1 });
  }
  for (const e of extras ?? []) jour(e.date).lignes[e.repas_type].push({ nom: e.nom, palier: e.palier, quantite: e.quantite ?? 1 });

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <EtiquettesClient
        jours={[...jours.values()].filter((j) => j.lignes.dejeuner.length + j.lignes.diner.length > 0).sort((a, b) => a.date.localeCompare(b.date))}
        macrosInitiales={(macros ?? []).map((m) => ({ ...m, proteines: m.proteines == null ? null : Number(m.proteines), glucides: m.glucides == null ? null : Number(m.glucides), lipides: m.lipides == null ? null : Number(m.lipides), kcal: m.kcal == null ? null : Number(m.kcal) }))}
        aujourdhui={aujourdhui}
      />
    </div>
  );
}
