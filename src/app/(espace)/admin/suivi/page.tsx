import { exigerAdmin } from "@/lib/admin";
import { SuiviClient, type LigneSuivi } from "@/app/(espace)/admin/suivi/SuiviClient";
import { dateDuJour, debutDuJour, decalerDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Suivi concret de l'utilisation : qui note ses repas, qui décroche, qui a
// installé l'appli et activé les rappels. Calculé à chaque ouverture.
export default async function SuiviPage() {
  const { supabase } = await exigerAdmin();
  const aujourdhui = dateDuJour();
  const debut7 = decalerDate(aujourdhui, -6);
  const debut30 = decalerDate(aujourdhui, -29);

  const [{ data: clients }, { data: repas }, { data: poids }, { data: ia }, { data: push }, { data: activite }] =
    await Promise.all([
      supabase
        .from("application_clients")
        .select("id, nom, telephone, created_at")
        .eq("est_admin", false)
        .order("nom")
        .returns<{ id: string; nom: string; telephone: string | null; created_at: string }[]>(),
      supabase
        .from("application_repas_journal")
        .select("client_id, date")
        .gte("date", debut30)
        .lte("date", aujourdhui)
        .limit(50000)
        .returns<{ client_id: string; date: string }[]>(),
      supabase
        .from("application_poids")
        .select("client_id, date")
        .gte("date", debut30)
        .returns<{ client_id: string; date: string }[]>(),
      supabase
        .from("application_usage_ia")
        .select("client_id, type")
        .gte("created_at", debutDuJour(debut7))
        .is("erreur", null)
        .returns<{ client_id: string; type: string }[]>(),
      supabase.from("application_push_abonnements").select("client_id").returns<{ client_id: string }[]>(),
      supabase
        .from("application_activite")
        .select("client_id, derniere_visite, appli_installee, plateforme")
        .returns<{ client_id: string; derniere_visite: string; appli_installee: boolean; plateforme: string | null }[]>(),
    ]);

  const joursParClient = new Map<string, Set<string>>();
  for (const r of repas ?? []) {
    if (!joursParClient.has(r.client_id)) joursParClient.set(r.client_id, new Set());
    joursParClient.get(r.client_id)!.add(r.date);
  }
  const dernierePesee = new Map<string, string>();
  for (const p of poids ?? []) {
    if ((dernierePesee.get(p.client_id) ?? "") < p.date) dernierePesee.set(p.client_id, p.date);
  }
  const iaParClient = new Map<string, number>();
  for (const u of ia ?? []) iaParClient.set(u.client_id, (iaParClient.get(u.client_id) ?? 0) + 1);
  const avecRappels = new Set((push ?? []).map((p) => p.client_id));
  const activiteParClient = new Map((activite ?? []).map((a) => [a.client_id, a]));

  const lignes: LigneSuivi[] = (clients ?? []).map((c) => {
    const jours = Array.from(joursParClient.get(c.id) ?? []).sort();
    const joursSemaine = jours.filter((d) => d >= debut7).length;
    const dernierRepas = jours.at(-1) ?? null;
    const act = activiteParClient.get(c.id);
    const inscritDepuis = Math.floor((Date.parse(`${aujourdhui}T12:00:00Z`) - Date.parse(c.created_at)) / 86_400_000);
    const statut: LigneSuivi["statut"] =
      joursSemaine >= 4 ? "regulier" : joursSemaine > 0 ? "irregulier" : jours.length > 0 ? "decroche" : "jamais";
    return {
      id: c.id,
      nom: c.nom,
      telephone: c.telephone,
      statut,
      joursSemaine,
      joursMois: jours.length,
      dernierRepas,
      inscritDepuis,
      derniereVisite: act?.derniere_visite ?? null,
      installee: act?.appli_installee ?? false,
      plateforme: act?.plateforme ?? null,
      rappels: avecRappels.has(c.id),
      ia7j: iaParClient.get(c.id) ?? 0,
      dernierePesee: dernierePesee.get(c.id) ?? null,
    };
  });

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <SuiviClient lignes={lignes} aujourdhui={aujourdhui} />
    </div>
  );
}
