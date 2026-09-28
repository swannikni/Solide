import { exigerAdmin } from "@/lib/admin";
import { PaiementsClient, type Paiement, type PersonneMois } from "@/app/(espace)/admin/paiements/PaiementsClient";
import { dateDuJour } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Paiements d'un mois : qui a payé, combien reste à encaisser. Les personnes
// livrées dans le mois (clients et noms de la fiche cuisine) sont proposées.
export default async function PaiementsPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { mois: moisDemande } = await searchParams;
  const aujourdhui = dateDuJour();
  const mois = /^\d{4}-(0[1-9]|1[0-2])$/.test(moisDemande ?? "") ? moisDemande! : aujourdhui.slice(0, 7);
  const debut = `${mois}-01`;
  const [a, m] = mois.split("-").map(Number);
  const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); // dernier jour du mois

  const [{ data: paiements }, { data: clients }, { data: commandes }, { data: extras }] = await Promise.all([
    supabase
      .from("application_paiements")
      .select("id, nom, client_id, montant, recu, moyen, paye_le, note")
      .eq("mois", debut)
      .order("nom")
      .returns<Paiement[]>(),
    supabase
      .from("application_clients")
      .select("id, nom, telephone")
      .eq("est_admin", false)
      .returns<{ id: string; nom: string; telephone: string | null }[]>(),
    supabase
      .from("application_commandes")
      .select("client_id")
      .gte("date_livraison", debut)
      .lte("date_livraison", fin)
      .neq("statut", "annulee")
      .limit(10000)
      .returns<{ client_id: string }[]>(),
    supabase
      .from("application_cuisine_extras")
      .select("nom, telephone")
      .gte("date", debut)
      .lte("date", fin)
      .limit(10000)
      .returns<{ nom: string; telephone: string | null }[]>(),
  ]);

  // Repas du mois par personne (clé : client ou nom en minuscules).
  const personnes = new Map<string, PersonneMois>();
  const parClient = new Map((clients ?? []).map((c) => [c.id, c]));
  for (const c of commandes ?? []) {
    const client = parClient.get(c.client_id);
    if (!client) continue;
    const cle = `c:${client.id}`;
    const p = personnes.get(cle) ?? { cle, nom: client.nom, clientId: client.id, telephone: client.telephone, repas: 0 };
    p.repas++;
    personnes.set(cle, p);
  }
  for (const e of extras ?? []) {
    const cle = `n:${e.nom.trim().toLowerCase()}`;
    const p = personnes.get(cle) ?? { cle, nom: e.nom.trim(), clientId: null, telephone: e.telephone, repas: 0 };
    p.repas++;
    if (!p.telephone && e.telephone) p.telephone = e.telephone;
    personnes.set(cle, p);
  }
  // Clients de l'appli sans repas ce mois : proposés à la saisie seulement.
  const suggestions = [
    ...personnes.values(),
    ...(clients ?? [])
      .filter((c) => !personnes.has(`c:${c.id}`))
      .map((c) => ({ cle: `c:${c.id}`, nom: c.nom, clientId: c.id, telephone: c.telephone, repas: 0 })),
  ];

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <PaiementsClient
        key={mois}
        mois={mois}
        aujourdhui={aujourdhui}
        paiementsInitiaux={(paiements ?? []).map((p) => ({ ...p, montant: Number(p.montant), recu: Number(p.recu) }))}
        personnes={suggestions.sort((x, y) => x.nom.localeCompare(y.nom, "fr"))}
      />
    </div>
  );
}
