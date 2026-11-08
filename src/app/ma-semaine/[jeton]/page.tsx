import { createAdminClient } from "@/lib/supabase/admin";
import { lireSession } from "@/lib/session";
import { completerTarifs } from "@/lib/paiements";
import { dateDuJour, decalerDate } from "@/lib/dates";
import { encoreModifiable, lundiDe, type RepasChoisi, type Zone } from "@/lib/ma-semaine";
import { MonEspaceClient, type SemaineOuverte, type SemaineCompte } from "@/app/ma-semaine/[jeton]/MonEspaceClient";
import { Logo } from "@/components/Logo";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
// Semaine dont on montre le menu (le week-end : celle qui commence).
const semaineMenu = () => lundiDe(decalerDate(dateDuJour(), 2));
async function imageMenu() {
  const admin = createAdminClient();
  if (!admin) return null;
  const lundi = semaineMenu();
  const { data } = await admin.from("application_parametres").select("cle").eq("cle", `menu_image:${lundi}`).maybeSingle();
  return data ? `/api/menu-image/${lundi}` : null;
}

// Aperçu du lien dans WhatsApp : l'image du menu de la semaine.
export async function generateMetadata(): Promise<Metadata> {
  const image = await imageMenu();
  const base = process.env.URL ?? "https://chef2box-appli.netlify.app";
  return {
    title: "Mon espace · Chef2Box",
    description: "Le menu de la semaine : commandez vos repas en 1 minute.",
    robots: { index: false },
    ...(image ? { openGraph: { title: "Le menu Chef2Box de la semaine", images: [{ url: `${base}${image}` }] } } : {}),
  };
}

// « Mon espace Chef2Box » : le lien personnel envoyé sur WhatsApp. Le client
// commande ses repas (jusqu'à la veille 20 h), voit ce qui est prévu, ce
// qu'il doit, sa fiche et son historique. Lu avec la clé serveur, d'après
// le jeton du lien (pas de compte ni de mot de passe).
export default async function MonEspacePage({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const admin = createAdminClient();
  const fiche =
    admin && /^[a-z0-9]{16,64}$/.test(jeton)
      ? (
          await admin
            .from("application_personnes")
            .select("id, nom, telephone, allergies, refus, note, quartier, zone, adresse, complement, livraison_offerte, remise")
            .eq("jeton", jeton)
            .maybeSingle<{
              id: string;
              nom: string;
              telephone: string | null;
              allergies: string | null;
              refus: string | null;
              note: string | null;
              quartier: string | null;
              zone: Zone | null;
              adresse: string | null;
              complement: string | null;
              livraison_offerte: boolean | null;
              remise: number | null;
            }>()
        ).data
      : null;

  if (!admin || !fiche) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center space-y-4">
        <Logo className="mx-auto h-14 w-auto" />
        <h1 className="titre text-3xl">Lien invalide</h1>
        <p className="text-sm text-c2b-muted">Ce lien n&apos;est plus valable. Demandez un nouveau lien à Chef2Box sur WhatsApp.</p>
        <a href="https://wa.me/212660831640" className="btn-primary inline-flex px-6">
          Écrire à Chef2Box
        </a>
      </main>
    );
  }

  // L'admin qui regarde l'espace d'un client : barre de retour, et sa visite
  // ne compte pas comme une ouverture du client.
  const vueAdmin = !!(await lireSession().catch(() => null))?.client?.est_admin;
  // Lien ouvert : sert à repérer qui ne lit jamais le menu (Admin → Envoi menu).
  if (!vueAdmin) await admin.from("application_personnes").update({ vu_le: new Date().toISOString() }).eq("id", fiche.id);

  // Son bilan (questionnaire du site) : le plus récent avec son numéro (comparé
  // chiffre à chiffre, quel que soit le format), sinon avec son nom.
  type Questionnaire = {
    created_at: string;
    nom: string;
    telephone: string | null;
    calories: number;
    proteines: number | null;
    glucides: number | null;
    lipides: number | null;
    palier: "P1" | "P2" | "P3" | null;
    profil: { objectifs?: string[]; poids?: number } | null;
  };
  const derniers9 = (fiche.telephone ?? "").replace(/[^\d]/g, "").slice(-9);
  const champs = "created_at, nom, telephone, calories, proteines, glucides, lipides, palier, profil";
  let questionnaire: Questionnaire | null = null;
  if (derniers9.length === 9) {
    const { data } = await admin
      .from("application_questionnaires")
      .select(champs)
      .not("calories", "is", null)
      .ilike("telephone", `%${derniers9.slice(-4)}%`)
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<Questionnaire[]>();
    // Même numéro pour deux personnes (couple) : celui à son prénom d'abord.
    const memeNumero = (data ?? []).filter((q) => (q.telephone ?? "").replace(/[^\d]/g, "").endsWith(derniers9));
    const prenom = fiche.nom.trim().split(/\s+/)[0].toLowerCase();
    questionnaire = memeNumero.find((q) => q.nom.trim().toLowerCase().startsWith(prenom)) ?? memeNumero[0] ?? null;
  }
  if (!questionnaire && !derniers9) {
    const { data } = await admin
      .from("application_questionnaires")
      .select(champs)
      .not("calories", "is", null)
      .ilike("nom", fiche.nom.replace(/[%_\\]/g, "\\$&"))
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<Questionnaire[]>();
    questionnaire = data?.[0] ?? null;
  }
  const bilan = questionnaire
    ? {
        date: questionnaire.created_at.slice(0, 10),
        calories: questionnaire.calories,
        proteines: questionnaire.proteines,
        glucides: questionnaire.glucides,
        lipides: questionnaire.lipides,
        palier: questionnaire.palier,
        objectifs: questionnaire.profil?.objectifs ?? [],
      }
    : null;

  const aujourdhui = dateDuJour();
  const lundiActuel = lundiDe(aujourdhui);
  // Semaines où l'on peut commander : celle en cours (s'il reste des jours) et les 2 suivantes.
  const lundis = [0, 7, 14].map((n) => decalerDate(lundiActuel, n)).filter((l) => [0, 1, 2, 3, 4].some((i) => encoreModifiable(decalerDate(l, i))));
  const debutHistorique = decalerDate(lundiActuel, -84);
  const finOuverte = decalerDate(lundis[lundis.length - 1], 4);
  const motif = fiche.nom.replace(/[%_\\]/g, "\\$&");

  const [{ data: menu }, { data: repasPrevus }, { data: paiements }, { data: demandes }, { data: parametre }] = await Promise.all([
    admin
      .from("application_cuisine_services")
      .select("date, repas_type, plat")
      .gte("date", lundis[0])
      .lte("date", finOuverte)
      .returns<{ date: string; repas_type: "dejeuner" | "diner"; plat: string | null }[]>(),
    admin
      .from("application_cuisine_extras")
      .select("date, repas_type, quantite")
      .ilike("nom", motif)
      .gte("date", debutHistorique)
      .lte("date", finOuverte)
      .order("date")
      .returns<{ date: string; repas_type: "dejeuner" | "diner"; quantite: number | null }[]>(),
    admin
      .from("application_paiements")
      .select("semaine, montant, recu")
      .eq("cle", `n:${fiche.nom.trim().toLowerCase()}`)
      .gte("semaine", debutHistorique)
      .order("semaine", { ascending: false })
      .returns<{ semaine: string; montant: number; recu: number }[]>(),
    admin
      .from("application_demandes_semaine")
      .select("semaine, repas")
      .eq("personne_id", fiche.id)
      .eq("statut", "a_valider")
      .returns<{ semaine: string; repas: RepasChoisi[] }[]>(),
    admin.from("application_parametres").select("valeur").eq("cle", "tarifs").maybeSingle<{ valeur: object }>(),
  ]);

  const prevus: RepasChoisi[] = (repasPrevus ?? []).map((r) => ({ date: r.date, service: r.repas_type }));
  const semainesOuvertes: SemaineOuverte[] = lundis.map((lundi) => {
    const jours = [0, 1, 2, 3, 4].map((i) => decalerDate(lundi, i));
    const demande = (demandes ?? []).find((d) => d.semaine === lundi);
    return {
      lundi,
      jours: jours.map((date) => ({
        date,
        modifiable: encoreModifiable(date),
        midi: menu?.find((m) => m.date === date && m.repas_type === "dejeuner")?.plat ?? null,
        soir: menu?.find((m) => m.date === date && m.repas_type === "diner")?.plat ?? null,
      })),
      prevus: prevus.filter((r) => r.date >= lundi && r.date <= jours[4]),
      enAttente: demande?.repas ?? null,
    };
  });

  // Semaines du compte (historique et à payer) : repas au planning + paiements.
  const lundisCompte = new Set<string>([...prevus.map((r) => lundiDe(r.date)), ...(paiements ?? []).map((p) => p.semaine)]);
  const semainesCompte: SemaineCompte[] = [...lundisCompte]
    .sort((a, b) => b.localeCompare(a))
    .map((lundi) => {
      const p = (paiements ?? []).find((x) => x.semaine === lundi);
      return {
        lundi,
        repas: prevus.filter((r) => lundiDe(r.date) === lundi),
        montant: p ? Number(p.montant) : null,
        recu: p ? Number(p.recu) : 0,
      };
    });

  return (
    <MonEspaceClient
      jeton={jeton}
      prenom={fiche.nom.trim().split(/\s+/)[0]}
      aujourdhui={aujourdhui}
      connu={prevus.length > 0}
      fiche={{
        allergies: fiche.allergies ?? "",
        refus: fiche.refus ?? "",
        note: fiche.note ?? "",
        quartier: fiche.quartier ?? "",
        adresse: fiche.adresse ?? "",
        lien: fiche.complement?.startsWith("http") ? fiche.complement : "",
        telephone: fiche.telephone ?? "",
      }}
      semainesOuvertes={semainesOuvertes}
      semainesCompte={semainesCompte}
      tarifs={completerTarifs(parametre?.valeur)}
      conditions={{ remise: fiche.remise ?? 0, livraisonOfferte: !!fiche.livraison_offerte }}
      imageMenu={await imageMenu()}
      bilan={bilan}
      vueAdmin={vueAdmin}
    />
  );
}
