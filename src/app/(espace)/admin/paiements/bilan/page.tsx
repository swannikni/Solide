import { exigerAdmin } from "@/lib/admin";
import { BilanClient, type LigneBilan } from "@/app/(espace)/admin/paiements/bilan/BilanClient";
import { dateDuJour } from "@/lib/dates";
import { periodeDuMois } from "@/lib/paiements";
import type { CategorieDepense } from "@/lib/depenses";

export const dynamic = "force-dynamic";

const moisSuivant = (mois: string) => {
  const [a, m] = mois.split("-").map(Number);
  return new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 7);
};
const moisPrecedent = (mois: string) => {
  const [a, m] = mois.split("-").map(Number);
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
};

// Bilan d'un mois : les semaines dont le lundi tombe dans le mois (comme les
// paiements). Mois en cours par défaut, à jour à chaque ouverture.
export default async function BilanPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { mois: moisDemande } = await searchParams;
  const aujourdhui = dateDuJour();
  const mois = /^\d{4}-(0[1-9]|1[0-2])$/.test(moisDemande ?? "") ? moisDemande! : aujourdhui.slice(0, 7);
  const precedent = moisPrecedent(mois);
  const periode = periodeDuMois(mois);

  const [{ data: lignes }, { data: lignesPrecedent }, { data: extras }, { data: commandes }, { data: depenses }] = await Promise.all([
    supabase
      .from("application_paiements")
      .select("semaine, nom, montant, recu, moyen, montant_manuel")
      .gte("semaine", `${mois}-01`)
      .lt("semaine", `${moisSuivant(mois)}-01`)
      .order("semaine")
      .returns<LigneBilan[]>(),
    supabase
      .from("application_paiements")
      .select("montant, recu")
      .gte("semaine", `${precedent}-01`)
      .lt("semaine", `${mois}-01`)
      .returns<{ montant: number; recu: number }[]>(),
    // Repas préparés (fiche cuisine) sur les semaines du mois.
    supabase
      .from("application_cuisine_extras")
      .select("date, repas_type")
      .gte("date", periode.debut)
      .lte("date", periode.fin)
      .limit(20000)
      .returns<{ date: string; repas_type: "dejeuner" | "diner" }[]>(),
    supabase
      .from("application_commandes")
      .select("date_livraison, repas_type")
      .gte("date_livraison", periode.debut)
      .lte("date_livraison", periode.fin)
      .neq("statut", "annulee")
      .limit(20000)
      .returns<{ date_livraison: string; repas_type: "dejeuner" | "diner" }[]>(),
    // Dépenses du mois (dates du mois).
    supabase
      .from("application_depenses")
      .select("categorie, montant")
      .gte("date", `${mois}-01`)
      .lt("date", `${moisSuivant(mois)}-01`)
      .returns<{ categorie: CategorieDepense; montant: number }[]>(),
  ]);

  // Week-end exclu, comme les formules.
  const enSemaine = (d: string) => {
    const j = new Date(`${d}T12:00:00Z`).getUTCDay();
    return j >= 1 && j <= 5;
  };
  const repas = [...(extras ?? []).map((e) => ({ date: e.date, type: e.repas_type })), ...(commandes ?? []).map((c) => ({ date: c.date_livraison, type: c.repas_type }))].filter(
    (r) => enSemaine(r.date)
  );

  const nombre = (l: { montant: number; recu: number }) => ({ montant: Number(l.montant), recu: Number(l.recu) });
  const prec = (lignesPrecedent ?? []).map(nombre);

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <BilanClient
        key={mois}
        mois={mois}
        moisEnCours={mois === aujourdhui.slice(0, 7)}
        lignes={(lignes ?? []).map((l) => ({ ...l, ...nombre(l) }))}
        repasMidi={repas.filter((r) => r.type === "dejeuner").length}
        repasSoir={repas.filter((r) => r.type === "diner").length}
        precedent={{
          mois: precedent,
          du: prec.reduce((t, l) => t + (l.montant || l.recu), 0),
          encaisse: prec.reduce((t, l) => t + Math.min(l.recu, l.montant || l.recu), 0),
        }}
        lundis={periode.lundis}
        depenses={(depenses ?? []).map((d) => ({ categorie: d.categorie, montant: Number(d.montant) }))}
      />
    </div>
  );
}
