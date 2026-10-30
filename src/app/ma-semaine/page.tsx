import { createAdminClient } from "@/lib/supabase/admin";
import { completerTarifs } from "@/lib/paiements";
import { dateDuJour, decalerDate } from "@/lib/dates";
import { encoreModifiable, lundiDe } from "@/lib/ma-semaine";
import { MaSemaineClient, type SemaineProposee } from "@/app/ma-semaine/[jeton]/MaSemaineClient";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ma semaine · Chef2Box", description: "Choisissez vos repas Chef2Box de la semaine." };

// Lien commun « Ma semaine », partagé avec le menu : le client donne son
// prénom et son numéro WhatsApp (sa fiche est retrouvée par le téléphone),
// coche ses repas et envoie ; l'admin valide.
export default async function MaSemaineCommunePage() {
  const admin = createAdminClient();
  if (!admin) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center space-y-4">
        <Logo />
        <p className="text-sm text-c2b-muted">Service indisponible pour le moment. Écrivez-nous sur WhatsApp.</p>
      </main>
    );
  }
  const aujourdhui = dateDuJour();
  const lundis = [0, 7, 14].map((n) => decalerDate(lundiDe(aujourdhui), n)).filter((l) =>
    [0, 1, 2, 3, 4].some((i) => encoreModifiable(decalerDate(l, i)))
  );
  const [{ data: menu }, { data: parametre }] = await Promise.all([
    admin
      .from("application_cuisine_services")
      .select("date, repas_type, plat")
      .gte("date", lundis[0])
      .lte("date", decalerDate(lundis[lundis.length - 1], 4))
      .returns<{ date: string; repas_type: "dejeuner" | "diner"; plat: string | null }[]>(),
    admin.from("application_parametres").select("valeur").eq("cle", "tarifs").maybeSingle<{ valeur: object }>(),
  ]);
  const semaines: SemaineProposee[] = lundis.map((lundi) => ({
    lundi,
    jours: [0, 1, 2, 3, 4].map((i) => {
      const date = decalerDate(lundi, i);
      return {
        date,
        modifiable: encoreModifiable(date),
        midi: menu?.find((m) => m.date === date && m.repas_type === "dejeuner")?.plat ?? null,
        soir: menu?.find((m) => m.date === date && m.repas_type === "diner")?.plat ?? null,
      };
    }),
    choisis: [],
    enAttente: false,
    dejaPrevus: [],
  }));
  return (
    <MaSemaineClient
      jeton={null}
      prenom=""
      fiche={{ allergies: "", refus: "", note: "", quartier: "", adresse: "" }}
      semaines={semaines}
      tarifs={completerTarifs(parametre?.valeur)}
    />
  );
}
