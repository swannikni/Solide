import { exigerAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClientsClient, type FicheResume, type RepasSemaine } from "@/app/(espace)/admin/clients/ClientsClient";
import { dateDuJour, decalerDate } from "@/lib/dates";
import { debutAVenir, lundiDe } from "@/lib/ma-semaine";
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
      .select("id, nom, telephone, adresse, palier, allergies, refus, note, client_id, jeton, livraison_offerte, remise")
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

  // Clients de la semaine (en cours et suivante) : leurs repas jour par jour.
  const lundiActuel = lundiDe(aujourdhui);
  const lundiSuivant = decalerDate(lundiActuel, 7);
  const [{ data: extrasSemaine }, { data: commandesSemaine }] = await Promise.all([
    supabase
      .from("application_cuisine_extras")
      .select("nom, date, repas_type, quantite")
      .gte("date", lundiActuel)
      .lte("date", decalerDate(lundiSuivant, 4))
      .returns<{ nom: string; date: string; repas_type: "dejeuner" | "diner"; quantite: number | null }[]>(),
    supabase
      .from("application_commandes")
      .select("client_id, date_livraison, repas_type, quantite")
      .gte("date_livraison", lundiActuel)
      .lte("date_livraison", decalerDate(lundiSuivant, 4))
      .neq("statut", "annulee")
      .returns<{ client_id: string; date_livraison: string; repas_type: "dejeuner" | "diner"; quantite: number | null }[]>(),
  ]);
  const nomClient = new Map((clients ?? []).map((c) => [c.id, c.nom]));
  const repasSemaine: RepasSemaine[] = [
    ...(extrasSemaine ?? []).map((e) => ({ nom: e.nom, date: e.date, service: e.repas_type, quantite: e.quantite ?? 1 })),
    ...(commandesSemaine ?? [])
      .filter((c) => nomClient.has(c.client_id))
      .map((c) => ({ nom: nomClient.get(c.client_id)!, clientId: c.client_id, date: c.date_livraison, service: c.repas_type, quantite: c.quantite ?? 1 })),
  ];
  // Après vendredi 15 h, on regarde d'abord la semaine suivante.
  const semaineDefaut = debutAVenir() > decalerDate(lundiActuel, 4) ? lundiSuivant : lundiActuel;

  // Les emails sont dans Supabase Auth : lisibles seulement avec la clé service.
  const admin = createAdminClient();
  const emails: Record<string, string> = {};
  // Comptes dont l'admin a retiré l'accès : cachés de « Comptes de l'appli ».
  const sansAcces = new Set<string>();
  if (admin) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) {
      if (u.email) emails[u.id] = u.email;
      if (u.banned_until && new Date(u.banned_until) > new Date()) sansAcces.add(u.id);
    }
  }

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <ClientsClient
        clientsInitiaux={(clients ?? []).filter((c) => !sansAcces.has(c.id))}
        questionnairesInitiaux={questionnaires ?? []}
        fichesInitiales={fichesResumees}
        relance={{ lundi: lundiProchain, aujourdhui, dejaCommande }}
        semaines={{ lundis: [lundiActuel, lundiSuivant], defaut: semaineDefaut, repas: repasSemaine }}
        emails={emails}
        cleServicePresente={!!admin}
      />
    </div>
  );
}
