import type { SupabaseClient } from "@supabase/supabase-js";
import { decalerDate } from "@/lib/dates";

// Formules à la semaine : du mardi au vendredi, la fiche cuisine reprend
// celle de la veille (personnes, paliers, allergies, refus, consignes,
// adresses). Les personnes ajoutées ensuite à la veille suivent aussi ;
// celles retirées de ce jour ne reviennent pas. Le lundi (nouvelle semaine)
// se reprend à la main depuis le vendredi.

export interface Reprise {
  source: string; // date de la fiche reprise
  ajoutes: number; // lignes ajoutées à l'instant
}

const jourSemaine = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export const estLundi = (date: string) => jourSemaine(date) === 1;

// Les jours sont repris dans l'ordre depuis le mardi (ou aujourd'hui), pour
// qu'un ajout du mardi arrive jusqu'au jeudi même si mercredi n'a pas été
// ouvert. Les fiches passées ne sont jamais modifiées.
export async function reprendreLaVeille(supabase: SupabaseClient, date: string, aujourdhui: string): Promise<Reprise | null> {
  const j = jourSemaine(date);
  let ajoutes = 0;
  if (j >= 2 && j <= 5 && date >= aujourdhui) {
    const mardi = decalerDate(date, 2 - j);
    for (let d = mardi > aujourdhui ? mardi : aujourdhui; d <= date; d = decalerDate(d, 1)) {
      const { data } = await supabase.rpc("application_cuisine_reprendre", { p_date: d, p_source: decalerDate(d, -1) });
      if (d === date) ajoutes = typeof data === "number" ? data : 0;
    }
  }
  const { data: marque } = await supabase
    .from("application_cuisine_reprises")
    .select("source")
    .eq("date", date)
    .maybeSingle<{ source: string }>();
  return marque ? { source: marque.source, ajoutes } : null;
}
