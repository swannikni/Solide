import { exigerAdmin } from "@/lib/admin";
import { LivraisonClient, type ArretLivraison, type RepasLivre } from "@/app/(espace)/admin/livraison/LivraisonClient";
import { completerReglages, type ReglagesLivraison } from "@/lib/livraison";
import { dateDuJour, decalerDate, estDateValide, FUSEAU } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Une seule tournée par jour, à midi (pas de livraison le soir pour le moment) :
// toutes les personnes de la fiche cuisine du jour, repas du midi et du soir
// livrés ensemble. Par défaut : aujourd'hui avant 14 h, sinon demain.
export default async function LivraisonPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { date: dateDemandee } = await searchParams;
  const aujourdhui = dateDuJour();
  const heure = Number(new Intl.DateTimeFormat("en-GB", { timeZone: FUSEAU, hour: "numeric", hour12: false }).format(new Date()));
  const date = estDateValide(dateDemandee) ? dateDemandee : heure < 14 ? aujourdhui : decalerDate(aujourdhui, 1);

  const [{ data: commandes }, { data: ajouts }, { data: parametre }, { data: planEnregistre }] = await Promise.all([
    supabase
      .from("application_commandes")
      .select("id, repas_type, note, client:application_clients(id, nom, telephone, livraison_adresse, livraison_lat, livraison_lng, livraison_complement)")
      .eq("date_livraison", date)
      .neq("statut", "annulee")
      .returns<
        {
          id: string;
          repas_type: RepasLivre;
          note: string | null;
          client: {
            id: string;
            nom: string;
            telephone: string | null;
            livraison_adresse: string | null;
            livraison_lat: number | null;
            livraison_lng: number | null;
            livraison_complement: string | null;
          } | null;
        }[]
      >(),
    supabase
      .from("application_cuisine_extras")
      .select("id, nom, repas_type, note, adresse, lat, lng, telephone, complement")
      .eq("date", date)
      .returns<
        {
          id: string;
          nom: string;
          repas_type: RepasLivre;
          note: string | null;
          adresse: string | null;
          lat: number | null;
          lng: number | null;
          telephone: string | null;
          complement: string | null;
        }[]
      >(),
    supabase.from("application_livraison_reglages").select("valeur").eq("id", 1).maybeSingle<{ valeur: Partial<ReglagesLivraison> }>(),
    supabase
      .from("application_livraison_plans")
      .select("tournees, departs")
      .eq("date", date)
      .eq("repas_type", "dejeuner")
      .maybeSingle<{ tournees: string[][] | null; departs: (string | null)[] }>(),
  ]);

  // Un arrêt par personne, avec ses repas du jour (midi et/ou soir).
  const parCle = new Map<string, ArretLivraison>();
  const ajouter = (arret: ArretLivraison, repas: RepasLivre, note: string | null) => {
    const deja = parCle.get(arret.cle);
    const cible = deja ?? arret;
    if (!deja) parCle.set(arret.cle, arret);
    cible.repas = [...new Set([...cible.repas, repas])].sort();
    if (note) cible.notes = [...cible.notes, { repas, note }];
    // Ajouts à la main : la position peut n'être que sur la ligne du midi ou du soir.
    if (cible.lat == null && arret.lat != null) Object.assign(cible, { adresse: arret.adresse, lat: arret.lat, lng: arret.lng });
    if (!cible.complement && arret.complement) cible.complement = arret.complement;
    if (!cible.telephone && arret.telephone) cible.telephone = arret.telephone;
  };
  for (const c of commandes ?? []) {
    if (!c.client) continue;
    ajouter(
      {
        cle: `c:${c.client.id}`,
        source: "client",
        id: c.client.id,
        nom: c.client.nom,
        telephone: c.client.telephone,
        adresse: c.client.livraison_adresse,
        lat: c.client.livraison_lat,
        lng: c.client.livraison_lng,
        complement: c.client.livraison_complement,
        repas: [],
        notes: [],
      },
      c.repas_type,
      c.note
    );
  }
  for (const a of ajouts ?? []) {
    ajouter(
      {
        cle: `a:${a.nom.trim().toLowerCase()}`,
        source: "ajout",
        id: a.id,
        nom: a.nom,
        telephone: a.telephone,
        adresse: a.adresse,
        lat: a.lat,
        lng: a.lng,
        complement: a.complement,
        repas: [],
        notes: [],
      },
      a.repas_type,
      a.note
    );
  }
  const arrets = [...parCle.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <LivraisonClient
        key={date}
        date={date}
        aujourdhui={aujourdhui}
        arretsInitiaux={arrets}
        reglagesInitiaux={completerReglages(parametre?.valeur)}
        planInitial={planEnregistre?.tournees ?? null}
        departsInitiaux={planEnregistre?.departs ?? []}
      />
    </div>
  );
}
