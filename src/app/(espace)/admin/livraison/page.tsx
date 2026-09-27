import { exigerAdmin } from "@/lib/admin";
import { LivraisonClient, type ArretLivraison } from "@/app/(espace)/admin/livraison/LivraisonClient";
import { completerReglages, type ReglagesLivraison } from "@/lib/livraison";
import { dateDuJour, decalerDate, estDateValide, FUSEAU } from "@/lib/dates";

export const dynamic = "force-dynamic";

type Service = "dejeuner" | "diner";

// Tournées de livraison d'un service (midi ou soir) : les mêmes personnes que
// la fiche cuisine, avec leur adresse. Par défaut : le prochain service à livrer.
export default async function LivraisonPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; service?: string }>;
}) {
  const { supabase } = await exigerAdmin();
  const { date: dateDemandee, service: serviceDemande } = await searchParams;
  const aujourdhui = dateDuJour();
  const heure = Number(new Intl.DateTimeFormat("en-GB", { timeZone: FUSEAU, hour: "numeric", hour12: false }).format(new Date()));
  const parDefaut: { date: string; service: Service } =
    heure < 13 ? { date: aujourdhui, service: "dejeuner" } : heure < 20 ? { date: aujourdhui, service: "diner" } : { date: decalerDate(aujourdhui, 1), service: "dejeuner" };
  const date = estDateValide(dateDemandee) ? dateDemandee : parDefaut.date;
  const service: Service = serviceDemande === "dejeuner" || serviceDemande === "diner" ? serviceDemande : parDefaut.service;

  const [{ data: commandes }, { data: ajouts }, { data: parametre }] = await Promise.all([
    supabase
      .from("application_commandes")
      .select("id, note, client:application_clients(id, nom, telephone, livraison_adresse, livraison_lat, livraison_lng)")
      .eq("date_livraison", date)
      .eq("repas_type", service)
      .neq("statut", "annulee")
      .returns<
        {
          id: string;
          note: string | null;
          client: {
            id: string;
            nom: string;
            telephone: string | null;
            livraison_adresse: string | null;
            livraison_lat: number | null;
            livraison_lng: number | null;
          } | null;
        }[]
      >(),
    supabase
      .from("application_cuisine_extras")
      .select("id, nom, note, adresse, lat, lng, telephone")
      .eq("date", date)
      .eq("repas_type", service)
      .returns<
        { id: string; nom: string; note: string | null; adresse: string | null; lat: number | null; lng: number | null; telephone: string | null }[]
      >(),
    supabase.from("application_livraison_reglages").select("valeur").eq("id", 1).maybeSingle<{ valeur: Partial<ReglagesLivraison> }>(),
  ]);

  const arrets: ArretLivraison[] = [
    ...(commandes ?? [])
      .filter((c) => c.client)
      .map((c) => ({
        cle: `c:${c.client!.id}`,
        source: "client" as const,
        id: c.client!.id,
        nom: c.client!.nom,
        telephone: c.client!.telephone,
        adresse: c.client!.livraison_adresse,
        lat: c.client!.livraison_lat,
        lng: c.client!.livraison_lng,
        note: c.note,
      })),
    ...(ajouts ?? []).map((a) => ({
      cle: `a:${a.id}`,
      source: "ajout" as const,
      id: a.id,
      nom: a.nom,
      telephone: a.telephone,
      adresse: a.adresse,
      lat: a.lat,
      lng: a.lng,
      note: a.note,
    })),
  ].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <LivraisonClient
        key={`${date}-${service}`}
        date={date}
        aujourdhui={aujourdhui}
        service={service}
        arretsInitiaux={arrets}
        reglagesInitiaux={completerReglages(parametre?.valeur)}
      />
    </div>
  );
}
