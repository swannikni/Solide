import { exigerAdmin } from "@/lib/admin";
import {
  CuisineClient,
  type AjoutCuisine,
  type ClientCuisine,
  type CommandeCuisine,
  type PersonneConnue,
} from "@/app/(espace)/admin/cuisine/CuisineClient";
import { dateDuJour, decalerDate, estDateValide, FUSEAU } from "@/lib/dates";
import { estLundi, reprendreLaVeille } from "@/lib/cuisine-reprise";

export const dynamic = "force-dynamic";

// Fiche cuisine d'un jour : qui mange à midi et le soir, par palier, avec
// les aliments refusés et les allergies. Par défaut : demain à partir de
// midi (la veille au soir), aujourd'hui le matin.
export default async function CuisinePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { date: dateDemandee } = await searchParams;
  const aujourdhui = dateDuJour();
  const heure = Number(new Intl.DateTimeFormat("en-GB", { timeZone: FUSEAU, hour: "numeric", hour12: false }).format(new Date()));
  const date = estDateValide(dateDemandee) ? dateDemandee : heure >= 12 ? decalerDate(aujourdhui, 1) : aujourdhui;
  // Du mardi au vendredi : reprise de la fiche de la veille avant lecture.
  const reprise = await reprendreLaVeille(supabase, date, aujourdhui);

  const [{ data: clients }, { data: commandes }, { data: services }, { data: ajouts }, { data: historique }] = await Promise.all([
    supabase
      .from("application_clients")
      .select("id, nom, palier, cuisine_allergies, cuisine_refus, repas_habituels")
      .eq("est_admin", false)
      .order("nom")
      .returns<ClientCuisine[]>(),
    supabase
      .from("application_commandes")
      .select("id, client_id, repas_type, note, palier")
      .eq("date_livraison", date)
      .neq("statut", "annulee")
      .returns<CommandeCuisine[]>(),
    supabase
      .from("application_cuisine_services")
      .select("repas_type, plat")
      .eq("date", date)
      .returns<{ repas_type: "dejeuner" | "diner"; plat: string | null }[]>(),
    supabase
      .from("application_cuisine_extras")
      .select("id, repas_type, nom, palier, allergies, refus, note")
      .eq("date", date)
      .order("created_at")
      .returns<AjoutCuisine[]>(),
    // Personnes déjà ajoutées à la main les autres jours : on les retrouve
    // en tapant leur nom, avec palier, allergies et refus.
    supabase
      .from("application_cuisine_extras")
      .select("date, repas_type, nom, palier, allergies, refus, adresse, lat, lng, telephone, complement")
      .neq("date", date)
      .order("date", { ascending: false })
      .limit(1000)
      .returns<
        (Omit<AjoutCuisine, "id" | "note"> & {
          date: string;
          adresse: string | null;
          lat: number | null;
          lng: number | null;
          telephone: string | null;
          complement: string | null;
        })[]
      >(),
  ]);
  // Dernière fiche connue de chaque nom (sans tenir compte des majuscules).
  const connues = new Map<string, PersonneConnue & { date: string }>();
  for (const h of historique ?? []) {
    const cle = h.nom.trim().toLowerCase();
    const deja = connues.get(cle);
    if (!deja)
      connues.set(cle, {
        nom: h.nom,
        palier: h.palier,
        allergies: h.allergies,
        refus: h.refus,
        services: [h.repas_type],
        adresse: h.adresse,
        lat: h.lat,
        lng: h.lng,
        telephone: h.telephone,
        complement: h.complement,
        date: h.date,
      });
    else {
      if (deja.date === h.date && !deja.services.includes(h.repas_type)) deja.services.push(h.repas_type);
      // Adresse : la plus récente connue, même si la dernière fiche n'en a pas.
      if (deja.lat == null && h.lat != null) Object.assign(deja, { adresse: h.adresse, lat: h.lat, lng: h.lng, complement: h.complement });
      if (!deja.telephone && h.telephone) deja.telephone = h.telephone;
    }
  }
  const personnesConnues = Array.from(connues.values()).map(({ date: _d, ...p }) => p);
  const plats = { dejeuner: "", diner: "" };
  for (const s of services ?? []) plats[s.repas_type] = s.plat ?? "";

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10 print:p-0">
      <CuisineClient
        key={date}
        date={date}
        aujourdhui={aujourdhui}
        clients={clients ?? []}
        commandesInitiales={commandes ?? []}
        platsInitiaux={plats}
        ajoutsInitiaux={ajouts ?? []}
        personnesConnues={personnesConnues}
        reprise={reprise}
        lundi={estLundi(date)}
      />
    </div>
  );
}
