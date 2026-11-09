import { notFound } from "next/navigation";
import { exigerAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateDuJour, decalerDate } from "@/lib/dates";
import { debutAVenir, lundiDe } from "@/lib/ma-semaine";
import { completerTarifs, type Tarifs } from "@/lib/paiements";
import { toutLire } from "@/lib/tout-lire";
import type { Client, Questionnaire } from "@/lib/types";
import { FicheClient, type FichePersonne, type RepasFiche } from "@/app/(espace)/admin/clients/fiche/FicheClient";

export const dynamic = "force-dynamic";

const fin9 = (t: string | null | undefined) => {
  const c = (t ?? "").replace(/\D/g, "");
  return c.length >= 9 ? c.slice(-9) : null;
};
const echapper = (t: string) => t.replace(/[%_\\]/g, "\\$&");

// Fiche d'une personne : f = fiche cuisine, q = questionnaire, c = compte appli.
export default async function FichePage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; c?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { f, q, c } = await searchParams;

  const colonnes =
    "id, nom, telephone, adresse, complement, palier, allergies, refus, note, client_id, jeton, livraison_offerte, remise, zone, partenaire, vu_le, envoi_pause, created_at";
  let personne: FichePersonne | null = null;
  let questionnaire: Questionnaire | null = null;
  let compte: Client | null = null;

  if (f) {
    const { data } = await supabase.from("application_personnes").select(colonnes).eq("id", f).maybeSingle<FichePersonne>();
    personne = data;
  }
  if (q) {
    const { data } = await supabase.from("application_questionnaires").select("*").eq("id", q).maybeSingle<Questionnaire>();
    questionnaire = data;
  }
  if (c) {
    const { data } = await supabase.from("application_clients").select("*").eq("id", c).maybeSingle<Client>();
    compte = data;
  }
  // Retrouver la fiche de cuisine depuis un compte ou un questionnaire.
  if (!personne && compte) {
    const { data } = await supabase.from("application_personnes").select(colonnes).eq("client_id", compte.id).limit(1).maybeSingle<FichePersonne>();
    personne = data;
  }
  const numero = fin9(personne?.telephone ?? questionnaire?.telephone ?? compte?.telephone);
  const nomRef = (personne?.nom ?? questionnaire?.nom ?? compte?.nom ?? "").trim();
  if (!personne && numero) {
    const { data } = await supabase
      .from("application_personnes")
      .select(colonnes)
      .ilike("telephone", `%${numero.slice(-4)}`)
      .limit(20)
      .returns<FichePersonne[]>();
    personne = (data ?? []).find((p) => fin9(p.telephone) === numero) ?? null;
  }
  if (!personne && nomRef) {
    const { data } = await supabase.from("application_personnes").select(colonnes).eq("cle", nomRef.toLowerCase()).maybeSingle<FichePersonne>();
    if (data && (!fin9(data.telephone) || fin9(data.telephone) === numero)) personne = data;
  }
  if (!compte && personne?.client_id) {
    const { data } = await supabase.from("application_clients").select("*").eq("id", personne.client_id).maybeSingle<Client>();
    compte = data;
  }
  if (!personne && !questionnaire && !compte) notFound();

  // Ses questionnaires (même numéro), le plus récent d'abord.
  let questionnaires: Questionnaire[] = [];
  if (numero) {
    const { data } = await supabase
      .from("application_questionnaires")
      .select("*")
      .ilike("telephone", `%${numero.slice(-4)}`)
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<Questionnaire[]>();
    questionnaires = (data ?? []).filter((x) => fin9(x.telephone) === numero);
  }
  if (questionnaire && !questionnaires.some((x) => x.id === questionnaire!.id)) questionnaires.unshift(questionnaire);
  if (!questionnaires.length && nomRef) {
    const { data } = await supabase
      .from("application_questionnaires")
      .select("*")
      .ilike("nom", echapper(nomRef))
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<Questionnaire[]>();
    questionnaires = data ?? [];
  }

  const nom = (personne?.nom ?? compte?.nom ?? questionnaires[0]?.nom ?? "").trim();
  const aujourdhui = dateDuJour();
  const lundiActuel = lundiDe(aujourdhui);
  const lundiSuivant = decalerDate(lundiActuel, 7);
  const clesPaiement = [personne ? `n:${personne.nom.trim().toLowerCase()}` : null, compte ? `c:${compte.id}` : null].filter(
    (x): x is string => !!x
  );

  const [{ data: extras }, { data: commandes }, { data: paiements }, { data: envois }, { data: parametre }, { data: offre }] = await Promise.all([
    personne
      ? toutLire(() =>
          supabase
            .from("application_cuisine_extras")
            .select("id, date, repas_type, quantite")
            .ilike("nom", echapper(personne!.nom.trim()))
            .order("date", { ascending: false })
            .order("id")
            .returns<{ id: string; date: string; repas_type: "dejeuner" | "diner"; quantite: number | null }[]>()
        )
      : Promise.resolve({ data: [] as { id: string; date: string; repas_type: "dejeuner" | "diner"; quantite: number | null }[] }),
    compte
      ? toutLire(() =>
          supabase
            .from("application_commandes")
            .select("id, date_livraison, repas_type, quantite")
            .eq("client_id", compte!.id)
            .neq("statut", "annulee")
            .order("date_livraison", { ascending: false })
            .order("id")
            .returns<{ id: string; date_livraison: string; repas_type: "dejeuner" | "diner"; quantite: number | null }[]>()
        )
      : Promise.resolve({ data: [] as { id: string; date_livraison: string; repas_type: "dejeuner" | "diner"; quantite: number | null }[] }),
    clesPaiement.length
      ? supabase
          .from("application_paiements")
          .select("id, semaine, mois, montant, recu, moyen, paye_le, note")
          .in("cle", clesPaiement)
          .order("semaine", { ascending: false, nullsFirst: false })
          .limit(60)
          .returns<{ id: string; semaine: string | null; mois: string | null; montant: number; recu: number; moyen: string | null; paye_le: string | null; note: string | null }[]>()
      : Promise.resolve({ data: [] }),
    personne
      ? supabase
          .from("application_envois")
          .select("semaine, envoye_le")
          .eq("personne_id", personne.id)
          .order("semaine", { ascending: false })
          .limit(30)
          .returns<{ semaine: string; envoye_le: string }[]>()
      : Promise.resolve({ data: [] }),
    supabase.from("application_parametres").select("valeur").eq("cle", "tarifs").maybeSingle<{ valeur: Partial<Tarifs> }>(),
    personne
      ? supabase
          .from("application_tarifs_perso")
          .select("prix_semaine, note")
          .eq("cle", `n:${personne.nom.trim().toLowerCase()}`)
          .maybeSingle<{ prix_semaine: number; note: string | null }>()
      : Promise.resolve({ data: null }),
  ]);

  const repas: RepasFiche[] = [
    ...(extras ?? []).map((e) => ({ id: e.id, date: e.date, service: e.repas_type, quantite: e.quantite ?? 1 })),
    ...(commandes ?? []).map((x) => ({ id: x.id, date: x.date_livraison, service: x.repas_type, quantite: x.quantite ?? 1, appli: true })),
  ];

  // Email et accès du compte appli (lisibles avec la clé service).
  let email: string | null = questionnaires.find((x) => x.email)?.email ?? null;
  let accesRetire = false;
  if (compte) {
    const admin = createAdminClient();
    if (admin) {
      const { data } = await admin.auth.admin.getUserById(compte.id);
      email = data?.user?.email ?? email;
      accesRetire = !!data?.user?.banned_until && new Date(data.user.banned_until) > new Date();
    }
  }

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <FicheClient
        nom={nom}
        personne={personne}
        compte={compte}
        accesRetire={accesRetire}
        email={email}
        questionnaires={questionnaires}
        repas={repas}
        paiements={(paiements ?? []).map((p) => ({ ...p, montant: Number(p.montant), recu: Number(p.recu) }))}
        envois={envois ?? []}
        offre={offre ? { prix: Number(offre.prix_semaine), note: offre.note } : null}
        tarifs={completerTarifs(parametre?.valeur)}
        lundis={[lundiActuel, lundiSuivant]}
        lundiDefaut={debutAVenir() > decalerDate(lundiActuel, 4) ? lundiSuivant : lundiActuel}
        aujourdhui={aujourdhui}
      />
    </div>
  );
}
