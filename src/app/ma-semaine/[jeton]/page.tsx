import { createAdminClient } from "@/lib/supabase/admin";
import { completerTarifs } from "@/lib/paiements";
import { dateDuJour, decalerDate } from "@/lib/dates";
import { encoreModifiable, lundiDe, type RepasChoisi, type Zone } from "@/lib/ma-semaine";
import { MaSemaineClient, type SemaineProposee } from "@/app/ma-semaine/[jeton]/MaSemaineClient";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ma semaine · Chef2Box", robots: { index: false } };

// Page publique du lien « Ma semaine » envoyé sur WhatsApp : le client voit
// le menu, coche ses repas (jusqu'à la veille 20 h), ses allergies et sa
// livraison, et envoie. Lue avec la clé serveur, d'après le jeton du lien.
export default async function MaSemainePage({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const admin = createAdminClient();
  const personne =
    admin && /^[a-z0-9]{16,64}$/.test(jeton)
      ? (
          await admin
            .from("application_personnes")
            .select("id, nom, allergies, refus, note, quartier, zone, adresse")
            .eq("jeton", jeton)
            .maybeSingle<{
              id: string;
              nom: string;
              allergies: string | null;
              refus: string | null;
              note: string | null;
              quartier: string | null;
              zone: Zone | null;
              adresse: string | null;
            }>()
        ).data
      : null;

  if (!admin || !personne) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center space-y-4">
        <Logo />
        <h1 className="titre text-3xl">Lien invalide</h1>
        <p className="text-sm text-c2b-muted">Ce lien n&apos;est plus valable. Demandez un nouveau lien à Chef2Box sur WhatsApp.</p>
        <a href="https://wa.me/212660831640" className="btn-primary inline-flex px-6">
          Écrire à Chef2Box
        </a>
      </main>
    );
  }

  // Semaines proposées : celle en cours (s'il reste des jours) et les 2 suivantes.
  const aujourdhui = dateDuJour();
  const lundis = [0, 7, 14].map((n) => decalerDate(lundiDe(aujourdhui), n)).filter((l) =>
    [0, 1, 2, 3, 4].some((i) => encoreModifiable(decalerDate(l, i)))
  );
  const debut = lundis[0];
  const fin = decalerDate(lundis[lundis.length - 1], 4);

  const [{ data: menu }, { data: demandes }, { data: prevus }, { data: parametre }] = await Promise.all([
    admin
      .from("application_cuisine_services")
      .select("date, repas_type, plat")
      .gte("date", debut)
      .lte("date", fin)
      .returns<{ date: string; repas_type: "dejeuner" | "diner"; plat: string | null }[]>(),
    admin
      .from("application_demandes_semaine")
      .select("semaine, repas, statut")
      .eq("personne_id", personne.id)
      .gte("semaine", debut)
      .in("statut", ["a_valider"])
      .returns<{ semaine: string; repas: RepasChoisi[]; statut: string }[]>(),
    admin
      .from("application_cuisine_extras")
      .select("date, repas_type")
      .ilike("nom", personne.nom.replace(/[%_\\]/g, "\\$&"))
      .gte("date", debut)
      .lte("date", fin)
      .returns<{ date: string; repas_type: "dejeuner" | "diner" }[]>(),
    admin.from("application_parametres").select("valeur").eq("cle", "tarifs").maybeSingle<{ valeur: object }>(),
  ]);

  const semaines: SemaineProposee[] = lundis.map((lundi) => {
    const jours = [0, 1, 2, 3, 4].map((i) => decalerDate(lundi, i));
    const demande = (demandes ?? []).find((d) => d.semaine === lundi);
    const deja = (prevus ?? []).filter((p) => p.date >= lundi && p.date <= jours[4]).map((p) => ({ date: p.date, service: p.repas_type }));
    return {
      lundi,
      jours: jours.map((date) => ({
        date,
        modifiable: encoreModifiable(date),
        midi: menu?.find((m) => m.date === date && m.repas_type === "dejeuner")?.plat ?? null,
        soir: menu?.find((m) => m.date === date && m.repas_type === "diner")?.plat ?? null,
      })),
      // En attente de validation, sinon ce qui est déjà prévu en cuisine.
      choisis: demande ? demande.repas : deja,
      enAttente: !!demande,
      dejaPrevus: deja,
    };
  });

  return (
    <MaSemaineClient
      jeton={jeton}
      prenom={personne.nom.trim().split(/\s+/)[0]}
      fiche={{
        allergies: personne.allergies ?? "",
        refus: personne.refus ?? "",
        note: personne.note ?? "",
        quartier: personne.quartier ?? "",
        adresse: personne.adresse ?? "",
      }}
      semaines={semaines}
      tarifs={completerTarifs(parametre?.valeur)}
    />
  );
}
