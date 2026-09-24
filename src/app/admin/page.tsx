import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import { AdminClient } from "@/app/admin/AdminClient";
import type { Client, Commande, Plat } from "@/lib/types";

export default async function AdminPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: moi } = await supabase.from("application_clients").select("*").eq("id", user.id).single<Client>();
  if (!moi?.est_admin) redirect("/dashboard");

  const aujourdhui = new Date().toISOString().slice(0, 10);

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
    <div className="min-h-screen pb-24 md:pb-6 md:pt-20">
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
