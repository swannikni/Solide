import { exigerAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClientsClient, type FicheResume } from "@/app/(espace)/admin/clients/ClientsClient";
import { dateDuJour, decalerDate } from "@/lib/dates";
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

  // Fiches clients de la cuisine, avec la date de leur dernier repas.
  const [{ data: fiches }, { data: repas }] = await Promise.all([
    supabase
      .from("application_personnes")
      .select("id, nom, telephone, adresse, palier, allergies, refus, note, client_id, jeton")
      .order("nom")
      .limit(2000)
      .returns<Omit<FicheResume, "dernier">[]>(),
    supabase
      .from("application_cuisine_extras")
      .select("nom, date")
      .order("date", { ascending: false })
      .limit(10000)
      .returns<{ nom: string; date: string }[]>(),
  ]);
  const dernier = new Map<string, string>();
  for (const r of repas ?? []) {
    const cle = r.nom.trim().toLowerCase();
    if (!dernier.has(cle)) dernier.set(cle, r.date);
  }
  // Relance : la semaine prochaine (lundi) et qui a déjà commandé.
  const aujourdhui = dateDuJour();
  const j = new Date(`${aujourdhui}T12:00:00Z`).getUTCDay();
  const lundiProchain = decalerDate(aujourdhui, j === 0 ? 1 : 8 - j);
  const vendrediProchain = decalerDate(lundiProchain, 4);
  const dejaCommande = [
    ...new Set((repas ?? []).filter((r) => r.date >= lundiProchain && r.date <= vendrediProchain).map((r) => r.nom.trim().toLowerCase())),
  ];
  const fichesResumees: FicheResume[] = (fiches ?? []).map((f) => ({ ...f, dernier: dernier.get(f.nom.trim().toLowerCase()) ?? null }));

  // Les emails sont dans Supabase Auth : lisibles seulement avec la clé service.
  const admin = createAdminClient();
  const emails: Record<string, string> = {};
  if (admin) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) if (u.email) emails[u.id] = u.email;
  }

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <ClientsClient
        clientsInitiaux={clients ?? []}
        questionnairesInitiaux={questionnaires ?? []}
        fichesInitiales={fichesResumees}
        relance={{ lundi: lundiProchain, aujourdhui, dejaCommande }}
        emails={emails}
        cleServicePresente={!!admin}
      />
    </div>
  );
}
