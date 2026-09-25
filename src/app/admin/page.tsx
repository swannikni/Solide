import { exigerAdmin } from "@/lib/admin";
import { Nav } from "@/components/Nav";
import { AdminClient } from "@/app/admin/AdminClient";
import type { Client, Commande, Plat } from "@/lib/types";
import { dateDuJour } from "@/lib/dates";

export default async function AdminPage() {
  const { supabase } = await exigerAdmin();

  const aujourdhui = dateDuJour();

  const [{ data: clients }, { data: plats }, { data: commandes }] = await Promise.all([
    supabase.from("application_clients").select("*").eq("est_admin", false).order("nom").returns<Client[]>(),
    supabase.from("application_plats").select("*").eq("actif", true).order("nom").returns<Plat[]>(),
    supabase
      .from("application_commandes")
      .select("*, plats:application_plats(*)")
      .eq("date_livraison", aujourdhui)
      .returns<Commande[]>(),
  ]);

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <Nav estAdmin />
      <AdminClient
        clients={clients ?? []}
        plats={plats ?? []}
        commandesInitiales={commandes ?? []}
        dateDuJour={aujourdhui}
      />
    </div>
  );
}
