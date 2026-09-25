import { exigerAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Nav } from "@/components/Nav";
import { ClientsClient } from "@/app/admin/clients/ClientsClient";
import type { Client, Questionnaire } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const { supabase } = await exigerAdmin();
  const { data: clients } = await supabase
    .from("application_clients")
    .select("*")
    .eq("est_admin", false)
    .order("nom")
    .returns<Client[]>();

  const { data: questionnaires } = await supabase
    .from("application_questionnaires")
    .select("*")
    .eq("statut", "nouveau")
    .order("created_at", { ascending: false })
    .returns<Questionnaire[]>();

  // Les emails sont dans Supabase Auth : lisibles seulement avec la clé service.
  const admin = createAdminClient();
  const emails: Record<string, string> = {};
  if (admin) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) if (u.email) emails[u.id] = u.email;
  }

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <Nav estAdmin />
      <ClientsClient
        clientsInitiaux={clients ?? []}
        questionnairesInitiaux={questionnaires ?? []}
        emails={emails}
        cleServicePresente={!!admin}
      />
    </div>
  );
}
