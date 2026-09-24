import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import { DashboardClient } from "@/app/dashboard/DashboardClient";
import type { Client, Commande, RepasJournal } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const aujourdhui = new Date().toISOString().slice(0, 10);

  const [{ data: client }, { data: commandes }, { data: repas }] = await Promise.all([
    supabase.from("application_clients").select("*").eq("id", user.id).single<Client>(),
    supabase
      .from("application_commandes")
      .select("*, plats:application_plats(*)")
      .eq("client_id", user.id)
      .eq("date_livraison", aujourdhui)
      .returns<Commande[]>(),
    supabase
      .from("application_repas_journal")
      .select("*")
      .eq("client_id", user.id)
      .eq("date", aujourdhui)
      .order("created_at", { ascending: true })
      .returns<RepasJournal[]>(),
  ]);

  if (!client) redirect("/login");

  return (
    <div className="min-h-screen pb-24 md:pb-6 md:pt-20">
      <Nav estAdmin={client.est_admin} />
      <DashboardClient client={client} commandesDuJour={commandes ?? []} repasDuJour={repas ?? []} />
    </div>
  );
}
