import { exigerAdmin } from "@/lib/admin";
import { SiteClient, type StatsSite } from "@/app/(espace)/admin/site/SiteClient";
import { dateDuJour, decalerDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const PERIODES = [7, 30, 90];
const VIDE: StatsSite = { jours: [], sources: [], boutons: [], appareils: {}, premier: null };

// Fréquentation de chef2box.com : visites, clics WhatsApp et questionnaire
// sur les derniers jours, comparés à la période d'avant.
export default async function SitePage({ searchParams }: { searchParams: Promise<{ jours?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { jours: demande } = await searchParams;
  const jours = PERIODES.includes(Number(demande)) ? Number(demande) : 30;
  const fin = dateDuJour();
  const debut = decalerDate(fin, -(jours - 1));

  const [{ data: stats }, { data: avant }] = await Promise.all([
    supabase.rpc("application_site_stats", { p_debut: debut, p_fin: fin }),
    supabase.rpc("application_site_stats", { p_debut: decalerDate(debut, -jours), p_fin: decalerDate(debut, -1) }),
  ]);

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <SiteClient
        key={jours}
        jours={jours}
        debut={debut}
        fin={fin}
        stats={(stats as StatsSite | null) ?? VIDE}
        avant={(avant as StatsSite | null) ?? VIDE}
      />
    </div>
  );
}
