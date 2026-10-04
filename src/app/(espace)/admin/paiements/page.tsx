import { exigerAdmin } from "@/lib/admin";
import { PaiementsClient, type Paiement, type PersonneMois } from "@/app/(espace)/admin/paiements/PaiementsClient";
import { dateDuJour, decalerDate, estDateValide } from "@/lib/dates";
import { completerTarifs, lundiDe, montantAuto, semainesDe, type Tarifs } from "@/lib/paiements";

export const dynamic = "force-dynamic";

const COLONNES = "id, nom, client_id, montant, montant_manuel, recu, moyen, paye_le, note";

// Paiements de la semaine (du lundi au vendredi) : qui a payé, combien reste
// à encaisser. Cuisine → Paiements : chaque personne de la fiche cuisine de la
// semaine a sa ligne, créée automatiquement. Montant de la formule (1 ou 2
// repas par jour, ou offre de la personne), modifiable à la main.
// Par défaut : la semaine en cours ; le week-end, celle qui commence lundi.
export default async function PaiementsPage({ searchParams }: { searchParams: Promise<{ semaine?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { semaine: semaineDemandee } = await searchParams;
  const aujourdhui = dateDuJour();
  const jour = new Date(`${aujourdhui}T12:00:00Z`).getUTCDay();
  const semaineParDefaut = jour === 0 || jour === 6 ? lundiDe(decalerDate(aujourdhui, 2)) : lundiDe(aujourdhui);
  const semaine = estDateValide(semaineDemandee) ? lundiDe(semaineDemandee) : semaineParDefaut;
  const periode = { debut: semaine, fin: decalerDate(semaine, 4) };
  // Récapitulatif du mois : semaines dont le lundi tombe dans ce mois.
  const mois = semaine.slice(0, 7);
  const [an, m] = mois.split("-").map(Number);
  const moisSuivant = new Date(Date.UTC(an, m, 1)).toISOString().slice(0, 10);

  const [
    { data: paiementsExistants },
    { data: clients },
    { data: commandes },
    { data: extras },
    { data: parametre },
    { data: offres },
    { data: lignesDuMois },
  ] = await Promise.all([
      supabase.from("application_paiements").select(COLONNES).eq("semaine", semaine).order("nom").returns<Paiement[]>(),
      supabase
        .from("application_clients")
        .select("id, nom, telephone")
        .eq("est_admin", false)
        .returns<{ id: string; nom: string; telephone: string | null }[]>(),
      supabase
        .from("application_commandes")
        .select("client_id, date_livraison")
        .gte("date_livraison", periode.debut)
        .lte("date_livraison", periode.fin)
        .neq("statut", "annulee")
        .limit(10000)
        .returns<{ client_id: string; date_livraison: string }[]>(),
      supabase
        .from("application_cuisine_extras")
        .select("nom, telephone, date")
        .gte("date", periode.debut)
        .lte("date", periode.fin)
        .limit(10000)
        .returns<{ nom: string; telephone: string | null; date: string }[]>(),
      supabase.from("application_parametres").select("valeur").eq("cle", "tarifs").maybeSingle<{ valeur: Partial<Tarifs> }>(),
      supabase
        .from("application_tarifs_perso")
        .select("cle, prix_semaine, note")
        .returns<{ cle: string; prix_semaine: number; note: string | null }[]>(),
      supabase
        .from("application_paiements")
        .select("semaine, montant, recu")
        .gte("semaine", `${mois}-01`)
        .lt("semaine", moisSuivant)
        .neq("semaine", semaine)
        .returns<{ semaine: string; montant: number; recu: number }[]>(),
    ]);
  const tarifs = completerTarifs(parametre?.valeur);
  const offreDe = new Map((offres ?? []).map((o) => [o.cle, { prix: Number(o.prix_semaine), note: o.note }]));

  // Repas de la fiche cuisine par personne et par jour (clé : client ou nom).
  const repas = new Map<string, { nom: string; clientId: string | null; telephone: string | null; jours: Map<string, number> }>();
  const noter = (cle: string, nom: string, clientId: string | null, telephone: string | null, date: string) => {
    const p = repas.get(cle) ?? { nom, clientId, telephone, jours: new Map<string, number>() };
    p.jours.set(date, (p.jours.get(date) ?? 0) + 1);
    if (!p.telephone && telephone) p.telephone = telephone;
    repas.set(cle, p);
  };
  const parClient = new Map((clients ?? []).map((c) => [c.id, c]));
  for (const c of commandes ?? []) {
    const client = parClient.get(c.client_id);
    if (client) noter(`c:${client.id}`, client.nom, client.id, client.telephone, c.date_livraison);
  }
  for (const e of extras ?? []) noter(`n:${e.nom.trim().toLowerCase()}`, e.nom.trim(), null, e.telephone, e.date);

  const personnes: PersonneMois[] = [...repas.entries()]
    .map(([cle, p]) => {
      const semaines = semainesDe(p.jours);
      const offre = offreDe.get(cle) ?? null;
      return {
        cle,
        nom: p.nom,
        clientId: p.clientId,
        telephone: p.telephone,
        repas: [...p.jours.values()].reduce((t, n) => t + n, 0),
        semaines,
        offre,
        montantAuto: montantAuto(semaines, tarifs, offre?.prix ?? null),
      };
    })
    .filter((p) => p.semaines.length > 0);
  const parCle = new Map(personnes.map((p) => [p.cle, p]));

  // Lignes existantes : montant recalculé tant qu'il n'a pas été modifié à la main.
  const cleDe = (p: Paiement) => (p.client_id ? `c:${p.client_id}` : `n:${p.nom.trim().toLowerCase()}`);
  let paiements = (paiementsExistants ?? []).map((p) => ({ ...p, montant: Number(p.montant), recu: Number(p.recu) }));
  const aRecalculer = paiements.filter((p) => !p.montant_manuel && parCle.has(cleDe(p)) && parCle.get(cleDe(p))!.montantAuto !== p.montant);
  if (aRecalculer.length) {
    await Promise.all(
      aRecalculer.map((p) =>
        supabase.from("application_paiements").update({ montant: parCle.get(cleDe(p))!.montantAuto }).eq("id", p.id)
      )
    );
    const nouveaux = new Map(aRecalculer.map((p) => [p.id, parCle.get(cleDe(p))!.montantAuto]));
    paiements = paiements.map((p) => (nouveaux.has(p.id) ? { ...p, montant: nouveaux.get(p.id)! } : p));
  }

  // Personnes de la fiche cuisine sans ligne cette semaine : ajoutées (sans
  // doublon, même si la page est ouverte deux fois en même temps).
  const presentes = new Set(paiements.map(cleDe));
  const manquantes = personnes.filter((x) => !presentes.has(x.cle));
  if (manquantes.length) {
    const { data: ajoutees } = await supabase
      .from("application_paiements")
      .upsert(
        manquantes.map((x) => ({ semaine, nom: x.nom.slice(0, 80), client_id: x.clientId, montant: x.montantAuto })),
        { onConflict: "semaine,cle", ignoreDuplicates: true }
      )
      .select(COLONNES)
      .returns<Paiement[]>();
    paiements = [...paiements, ...(ajoutees ?? []).map((p) => ({ ...p, montant: Number(p.montant), recu: Number(p.recu) }))];
  }

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <PaiementsClient
        key={semaine}
        semaine={semaine}
        autresSemainesDuMois={{
          semaines: new Set((lignesDuMois ?? []).map((l) => l.semaine)).size,
          du: (lignesDuMois ?? []).reduce((t, l) => t + (Number(l.montant) || Number(l.recu)), 0),
          encaisse: (lignesDuMois ?? []).reduce((t, l) => t + Math.min(Number(l.recu), Number(l.montant) || Number(l.recu)), 0),
        }}
        aujourdhui={aujourdhui}
        paiementsInitiaux={paiements}
        personnes={personnes}
        tarifsInitiaux={tarifs}
      />
    </div>
  );
}
