import { exigerAdmin } from "@/lib/admin";
import {
  CuisineClient,
  type AjoutCuisine,
  type ClientCuisine,
  type CommandeCuisine,
} from "@/app/(espace)/admin/cuisine/CuisineClient";
import { dateDuJour, decalerDate, estDateValide, FUSEAU } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Fiche cuisine d'un jour : qui mange à midi et le soir, par palier, avec
// les aliments refusés et les allergies. Par défaut : demain à partir de
// midi (la veille au soir), aujourd'hui le matin.
export default async function CuisinePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { date: dateDemandee } = await searchParams;
  const aujourdhui = dateDuJour();
  const heure = Number(new Intl.DateTimeFormat("en-GB", { timeZone: FUSEAU, hour: "numeric", hour12: false }).format(new Date()));
  const date = estDateValide(dateDemandee) ? dateDemandee : heure >= 12 ? decalerDate(aujourdhui, 1) : aujourdhui;

  const [{ data: clients }, { data: commandes }, { data: services }, { data: ajouts }] = await Promise.all([
    supabase
      .from("application_clients")
      .select("id, nom, palier, cuisine_allergies, cuisine_refus, repas_habituels")
      .eq("est_admin", false)
      .order("nom")
      .returns<ClientCuisine[]>(),
    supabase
      .from("application_commandes")
      .select("id, client_id, repas_type, note, palier")
      .eq("date_livraison", date)
      .neq("statut", "annulee")
      .returns<CommandeCuisine[]>(),
    supabase
      .from("application_cuisine_services")
      .select("repas_type, plat")
      .eq("date", date)
      .returns<{ repas_type: "dejeuner" | "diner"; plat: string | null }[]>(),
    supabase
      .from("application_cuisine_extras")
      .select("id, repas_type, nom, palier, allergies, refus, note")
      .eq("date", date)
      .order("created_at")
      .returns<AjoutCuisine[]>(),
  ]);
  const plats = { dejeuner: "", diner: "" };
  for (const s of services ?? []) plats[s.repas_type] = s.plat ?? "";

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10 print:p-0">
      <CuisineClient
        key={date}
        date={date}
        aujourdhui={aujourdhui}
        clients={clients ?? []}
        commandesInitiales={commandes ?? []}
        platsInitiaux={plats}
        ajoutsInitiaux={ajouts ?? []}
      />
    </div>
  );
}
