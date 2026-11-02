import { exigerAdmin } from "@/lib/admin";
import { TourneeClient, type ArretTournee, type FicheTournee, type SuiviTournee } from "@/app/(espace)/admin/tournee/TourneeClient";
import { completerTarifs, type Tarifs } from "@/lib/paiements";
import { dateDuJour, decalerDate, estDateValide, FUSEAU } from "@/lib/dates";
import { lundiDe, prixDemande, prixZone, type RepasChoisi, type Zone } from "@/lib/ma-semaine";

export const dynamic = "force-dynamic";

type Service = "dejeuner" | "diner";

// Tournée du livreur : les clients du jour viennent du planning de la
// cuisine (repas de l'appli et ajoutés à la main), avec adresse, lien GPS
// et prix de livraison de leur fiche. L'admin note qui encaisse (lui ou le
// livreur) et si la livraison est payée ; le message part sur WhatsApp.
export default async function TourneePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { date: demandee } = await searchParams;
  const aujourdhui = dateDuJour();
  const heure = Number(new Intl.DateTimeFormat("en-GB", { timeZone: FUSEAU, hour: "numeric", hour12: false }).format(new Date()));
  // Par défaut : aujourd'hui avant 15 h, sinon le prochain jour de livraison (lun-ven).
  let date = estDateValide(demandee) ? demandee! : heure < 15 ? aujourdhui : decalerDate(aujourdhui, 1);
  while ([0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) date = decalerDate(date, 1);
  const lundi = lundiDe(date);
  const vendredi = decalerDate(lundi, 4);

  const [{ data: extras }, { data: commandes }, { data: fiches }, { data: suivis }, { data: reglages }, { data: paiements }, { data: parametre }] =
    await Promise.all([
      supabase
        .from("application_cuisine_extras")
        .select("nom, date, repas_type, quantite, adresse, complement, lat, lng, telephone")
        .gte("date", lundi)
        .lte("date", vendredi)
        .returns<
          {
            nom: string;
            date: string;
            repas_type: Service;
            quantite: number | null;
            adresse: string | null;
            complement: string | null;
            lat: number | null;
            lng: number | null;
            telephone: string | null;
          }[]
        >(),
      supabase
        .from("application_commandes")
        .select(
          "date_livraison, repas_type, quantite, client:application_clients(id, nom, telephone, livraison_adresse, livraison_lat, livraison_lng, livraison_complement)"
        )
        .gte("date_livraison", lundi)
        .lte("date_livraison", vendredi)
        .neq("statut", "annulee")
        .returns<
          {
            date_livraison: string;
            repas_type: Service;
            quantite: number | null;
            client: {
              id: string;
              nom: string;
              telephone: string | null;
              livraison_adresse: string | null;
              livraison_lat: number | null;
              livraison_lng: number | null;
              livraison_complement: string | null;
            } | null;
          }[]
        >(),
      supabase
        .from("application_personnes")
        .select("nom, telephone, adresse, complement, zone, livraison_offerte, remise, partenaire")
        .limit(2000)
        .returns<
          {
            nom: string;
            telephone: string | null;
            adresse: string | null;
            complement: string | null;
            zone: Zone | null;
            livraison_offerte: boolean | null;
            remise: number | null;
            partenaire: boolean | null;
          }[]
        >(),
      supabase.from("application_tournee").select("cle, encaisse_par, recuperer, frais_paye, ordre").eq("date", date).returns<SuiviTournee[]>(),
      supabase.from("application_tournee_reglages").select("livreur_telephone").eq("id", 1).maybeSingle<{ livreur_telephone: string | null }>(),
      supabase.from("application_paiements").select("cle, montant, recu").eq("semaine", lundi).returns<{ cle: string; montant: number; recu: number }[]>(),
      supabase.from("application_parametres").select("valeur").eq("cle", "tarifs").maybeSingle<{ valeur: Partial<Tarifs> }>(),
    ]);

  const tarifs = completerTarifs(parametre?.valeur);
  const ficheDe = new Map((fiches ?? []).map((f) => [f.nom.trim().toLowerCase(), f]));
  const payeDe = new Map((paiements ?? []).map((p) => [p.cle, p]));
  const lien = (complement: string | null, lat: number | null, lng: number | null) =>
    complement?.startsWith("http") ? complement : lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : null;

  // Repas de la semaine par personne (prix de la semaine, livraison offerte dès 10 repas).
  const semaine = new Map<string, RepasChoisi[]>();
  const arrets = new Map<string, ArretTournee>();
  const noter = (
    cle: string,
    jour: string,
    service: Service,
    quantite: number | null,
    infos: () => Omit<ArretTournee, "cle" | "midi" | "soir" | "frais" | "reste" | "retrait" | "montant" | "recu">
  ) => {
    semaine.set(cle, [...(semaine.get(cle) ?? []), { date: jour, service }]);
    if (jour !== date) return;
    const a = arrets.get(cle) ?? { cle, midi: 0, soir: 0, frais: 0, reste: null, montant: null, recu: 0, retrait: false, ...infos() };
    if (service === "dejeuner") a.midi += quantite ?? 1;
    else a.soir += quantite ?? 1;
    arrets.set(cle, a);
  };
  for (const c of commandes ?? []) {
    if (!c.client) continue;
    const cl = c.client;
    noter(`c:${cl.id}`, c.date_livraison, c.repas_type, c.quantite, () => ({
      nom: cl.nom,
      telephone: cl.telephone,
      adresse: cl.livraison_adresse,
      lien: lien(cl.livraison_complement, cl.livraison_lat, cl.livraison_lng),
      modifiable: false,
    }));
  }
  for (const e of extras ?? []) {
    const k = e.nom.trim().toLowerCase();
    const f = ficheDe.get(k);
    noter(`n:${k}`, e.date, e.repas_type, e.quantite, () => ({
      nom: e.nom.trim(),
      telephone: f?.telephone ?? e.telephone,
      adresse: f?.adresse ?? e.adresse,
      lien: lien(f?.complement ?? e.complement, e.lat, e.lng),
      modifiable: true,
    }));
  }

  // Prix de livraison du jour et reste à payer de la semaine.
  for (const a of arrets.values()) {
    const f = a.cle.startsWith("n:") ? ficheDe.get(a.cle.slice(2)) : undefined;
    const zone = f?.zone ?? null;
    a.retrait = zone === "retrait" || !!f?.partenaire;
    const prix = prixDemande(semaine.get(a.cle) ?? [], zone, tarifs, { remise: f?.remise ?? 0, livraisonOfferte: !!f?.livraison_offerte });
    a.frais = prix.prixLivraison === 0 || prix.prixLivraison == null ? 0 : (prixZone(zone) ?? 0);
    const p = payeDe.get(a.cle);
    a.reste = p ? Math.max(0, Number(p.montant) - Number(p.recu)) : (prix.total ?? null);
    a.montant = p && Number(p.montant) > 0 ? Number(p.montant) : (prix.total ?? null);
    a.recu = p ? Number(p.recu) : 0;
  }

  // Fiches clients (ajout à la main) et ceux déjà ajoutés à la main ce jour.
  const fichesTournee: FicheTournee[] = (fiches ?? [])
    .filter((f) => f.zone !== "retrait" && !f.partenaire)
    .map((f) => ({
      nom: f.nom.trim(),
      telephone: f.telephone,
      adresse: f.adresse,
      lien: lien(f.complement, null, null),
      frais: f.livraison_offerte ? 0 : (prixZone(f.zone) ?? 0),
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const ajoutes: ArretTournee[] = (suivis ?? [])
    .filter((s) => (s.ordre === -2 || (s.ordre ?? 0) >= 1000) && !arrets.has(s.cle) && s.cle.startsWith("n:"))
    .flatMap((s) => {
      const f = fichesTournee.find((x) => `n:${x.nom.toLowerCase()}` === s.cle);
      return f ? [{ cle: s.cle, ...f, midi: 0, soir: 0, reste: null, montant: null, recu: 0, retrait: false, modifiable: true }] : [];
    });

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <TourneeClient
        date={date}
        lundi={lundi}
        arrets={[...arrets.values()]}
        suivisInitiaux={suivis ?? []}
        livreurInitial={reglages?.livreur_telephone ?? ""}
        ajoutesInitiaux={ajoutes}
        fiches={fichesTournee}
      />
    </div>
  );
}
