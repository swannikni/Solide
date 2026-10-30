import { exigerAdmin } from "@/lib/admin";
import {
  CuisineClient,
  type ClientCuisine,
  type CommandeSemaine,
  type ExtraSemaine,
  type FicheClient,
  type SacJour,
  type PersonneHistorique,
} from "@/app/(espace)/admin/cuisine/CuisineClient";
import { dateDuJour, decalerDate, estDateValide } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Lundi de la semaine d'une date (YYYY-MM-DD).
function lundiDe(date: string) {
  const j = new Date(`${date}T12:00:00Z`).getUTCDay();
  return decalerDate(date, j === 0 ? -6 : 1 - j);
}

// Cuisine : planning de la semaine. Pour chaque personne, midi et/ou soir du
// lundi au vendredi ; chaque case cochée est un repas sur la fiche du jour
// (PDF à envoyer aux chefs). Par défaut : cette semaine, ou la suivante à
// partir du samedi. `?date=` ouvre la semaine de ce jour.
export default async function CuisinePage({ searchParams }: { searchParams: Promise<{ lundi?: string; date?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { lundi: demande, date: jourDemande } = await searchParams;
  const aujourdhui = dateDuJour();
  const jourActuel = new Date(`${aujourdhui}T12:00:00Z`).getUTCDay();
  const parDefaut = jourActuel === 0 || jourActuel === 6 ? lundiDe(decalerDate(aujourdhui, 2)) : lundiDe(aujourdhui);
  const choisi = estDateValide(demande) ? demande : estDateValide(jourDemande) ? jourDemande : null;
  const lundi = choisi ? lundiDe(choisi) : parDefaut;
  const vendredi = decalerDate(lundi, 4);
  const lundiAvant = decalerDate(lundi, -7);

  const [{ data: clients }, { data: commandes }, { data: extras }, { data: historique }, { data: services }, { data: fiches }, { data: sacs }] = await Promise.all([
    supabase
      .from("application_clients")
      .select("id, nom, palier, cuisine_allergies, cuisine_refus, telephone, livraison_adresse")
      .eq("est_admin", false)
      .order("nom")
      .returns<ClientCuisine[]>(),
    // Cette semaine et la précédente (pour la reprendre).
    supabase
      .from("application_commandes")
      .select("id, client_id, date_livraison, repas_type, note, palier, quantite")
      .gte("date_livraison", lundiAvant)
      .lte("date_livraison", vendredi)
      .neq("statut", "annulee")
      .returns<CommandeSemaine[]>(),
    supabase
      .from("application_cuisine_extras")
      .select("id, date, repas_type, nom, palier, allergies, refus, note, quantite, adresse, lat, lng, telephone, complement")
      .gte("date", lundiAvant)
      .lte("date", vendredi)
      .order("created_at")
      .returns<ExtraSemaine[]>(),
    // Personnes ajoutées à la main ces derniers mois : leur dernière fiche
    // (palier, allergies, refus, adresse) sert quand on les remet au planning.
    supabase
      .from("application_cuisine_extras")
      .select("date, nom, palier, allergies, refus, adresse, lat, lng, telephone, complement")
      .gte("date", decalerDate(lundi, -120))
      .order("date", { ascending: false })
      .limit(2000)
      .returns<(PersonneHistorique & { date: string })[]>(),
    supabase
      .from("application_cuisine_services")
      .select("date, repas_type, plat")
      .gte("date", lundi)
      .lte("date", vendredi)
      .returns<{ date: string; repas_type: "dejeuner" | "diner"; plat: string | null }[]>(),
    // Fiches clients (une par personne) et sacs prêts / livrés de la semaine.
    supabase
      .from("application_personnes")
      .select("id, nom, telephone, adresse, palier, allergies, refus, note")
      .order("nom")
      .limit(2000)
      .returns<FicheClient[]>(),
    supabase
      .from("application_cuisine_sacs")
      .select("date, cle, pret, livre")
      .gte("date", lundi)
      .lte("date", vendredi)
      .returns<SacJour[]>(),
  ]);

  const connues = new Map<string, PersonneHistorique>();
  for (const h of historique ?? []) {
    const cle = h.nom.trim().toLowerCase();
    const deja = connues.get(cle);
    if (!deja) {
      const { date: _d, ...p } = h;
      connues.set(cle, p);
    } else {
      // Adresse et téléphone : les plus récents connus.
      if (deja.lat == null && h.lat != null) Object.assign(deja, { adresse: h.adresse, lat: h.lat, lng: h.lng, complement: h.complement });
      if (!deja.telephone && h.telephone) deja.telephone = h.telephone;
    }
  }
  const plats: Record<string, { dejeuner: string; diner: string }> = {};
  for (const s of services ?? []) (plats[s.date] ??= { dejeuner: "", diner: "" })[s.repas_type] = s.plat ?? "";

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <CuisineClient
        key={lundi}
        lundi={lundi}
        aujourdhui={aujourdhui}
        jourChoisi={estDateValide(jourDemande) && jourDemande >= lundi && jourDemande <= vendredi ? jourDemande : null}
        clients={clients ?? []}
        commandesInitiales={commandes ?? []}
        extrasInitiaux={extras ?? []}
        personnesConnues={Array.from(connues.values())}
        platsInitiaux={plats}
        fichesInitiales={fiches ?? []}
        sacsInitiaux={sacs ?? []}
      />
    </div>
  );
}
