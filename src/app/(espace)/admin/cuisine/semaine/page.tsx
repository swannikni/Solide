import { exigerAdmin } from "@/lib/admin";
import {
  SemaineClient,
  type ExtraSemaine,
  type CommandeSemaine,
  type PersonneHistorique,
} from "@/app/(espace)/admin/cuisine/semaine/SemaineClient";
import type { ClientCuisine } from "@/app/(espace)/admin/cuisine/CuisineClient";
import { dateDuJour, decalerDate, estDateValide } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Lundi de la semaine d'une date (YYYY-MM-DD).
function lundiDe(date: string) {
  const j = new Date(`${date}T12:00:00Z`).getUTCDay();
  return decalerDate(date, j === 0 ? -6 : 1 - j);
}

// Planning de la semaine : pour chaque personne, midi et/ou soir du lundi au
// vendredi. Chaque case cochée est un repas sur la fiche cuisine du jour.
// Par défaut : cette semaine, ou la suivante à partir du samedi.
export default async function SemainePage({ searchParams }: { searchParams: Promise<{ lundi?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { lundi: demande } = await searchParams;
  const aujourdhui = dateDuJour();
  const jourActuel = new Date(`${aujourdhui}T12:00:00Z`).getUTCDay();
  const parDefaut = jourActuel === 0 || jourActuel === 6 ? lundiDe(decalerDate(aujourdhui, 2)) : lundiDe(aujourdhui);
  const lundi = estDateValide(demande) ? lundiDe(demande) : parDefaut;
  const vendredi = decalerDate(lundi, 4);
  const lundiAvant = decalerDate(lundi, -7);

  const [{ data: clients }, { data: commandes }, { data: extras }, { data: historique }] = await Promise.all([
    supabase
      .from("application_clients")
      .select("id, nom, palier, cuisine_allergies, cuisine_refus, repas_habituels")
      .eq("est_admin", false)
      .order("nom")
      .returns<ClientCuisine[]>(),
    // Cette semaine et la précédente (pour la reprendre).
    supabase
      .from("application_commandes")
      .select("id, client_id, date_livraison, repas_type, note, palier")
      .gte("date_livraison", lundiAvant)
      .lte("date_livraison", vendredi)
      .neq("statut", "annulee")
      .returns<CommandeSemaine[]>(),
    supabase
      .from("application_cuisine_extras")
      .select("id, date, repas_type, nom, palier, allergies, refus, note, adresse, lat, lng, telephone, complement")
      .gte("date", lundiAvant)
      .lte("date", vendredi)
      .order("created_at")
      .returns<ExtraSemaine[]>(),
    // Personnes ajoutées à la main ces derniers mois : leur dernière fiche
    // (palier, allergies, refus, adresse) sert quand on coche un nouveau jour.
    supabase
      .from("application_cuisine_extras")
      .select("date, nom, palier, allergies, refus, adresse, lat, lng, telephone, complement")
      .gte("date", decalerDate(lundi, -120))
      .order("date", { ascending: false })
      .limit(2000)
      .returns<(PersonneHistorique & { date: string })[]>(),
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

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <SemaineClient
        key={lundi}
        lundi={lundi}
        aujourdhui={aujourdhui}
        clients={clients ?? []}
        commandesInitiales={commandes ?? []}
        extrasInitiaux={extras ?? []}
        personnesConnues={Array.from(connues.values())}
      />
    </div>
  );
}
