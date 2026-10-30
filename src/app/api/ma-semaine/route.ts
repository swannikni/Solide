import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { completerTarifs } from "@/lib/paiements";
import { encoreModifiable, lundiDe, prixDemande, zoneDuQuartier, type RepasChoisi, type Service } from "@/lib/ma-semaine";
import { dateDuJour, decalerDate, estDateValide } from "@/lib/dates";

// Espace client « Mon espace Chef2Box » (lien personnel /ma-semaine/<jeton>).
// Route publique, le jeton fait office d'accès. Trois actions :
// - commander : les repas d'une semaine. Client déjà venu → directement au
//   planning de la cuisine ; nouveau client → « Semaines à valider ».
// - annuler : un repas, jusqu'à la veille 20 h.
// - fiche : allergies, refus, consigne, quartier, adresse, position.

export const dynamic = "force-dynamic";

const texte = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const nombre = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
const motif = (nom: string) => nom.replace(/[%_\\]/g, "\\$&");

interface Fiche {
  id: string;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  lat: number | null;
  lng: number | null;
  palier: string | null;
  allergies: string | null;
  refus: string | null;
  note: string | null;
  zone: string | null;
  quartier: string | null;
  livraison_offerte: boolean | null;
  remise: number | null;
}

// Prévient l'admin (notification) d'une commande passée directement.
async function prevenirAdmin(admin: SupabaseClient, nom: string, repas: number) {
  try {
    const { data: secret } = await admin.rpc("application_secret", { p_nom: "rappel_cron_secret" });
    if (!secret) return;
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/rappels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": String(secret) },
      body: JSON.stringify({ type: "commande", nom, repas }),
    });
  } catch {}
}

export async function POST(request: Request) {
  const repondre = (corps: object, statut = 200) => NextResponse.json(corps, { status: statut });
  const brut = await request.text();
  if (brut.length > 10_000) return repondre({ erreur: "Trop volumineux." }, 413);
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(brut);
  } catch {
    return repondre({ erreur: "Format invalide." }, 400);
  }
  const jeton = typeof d.jeton === "string" && /^[a-z0-9]{16,64}$/.test(d.jeton) ? d.jeton : null;
  if (!jeton) return repondre({ erreur: "Lien invalide." }, 400);

  const admin = createAdminClient();
  if (!admin) return repondre({ erreur: "Service indisponible, réessayez plus tard." }, 503);
  const { data: fiche } = await admin
    .from("application_personnes")
    .select("id, nom, telephone, adresse, lat, lng, palier, allergies, refus, note, zone, quartier, livraison_offerte, remise")
    .eq("jeton", jeton)
    .maybeSingle<Fiche>();
  if (!fiche) return repondre({ erreur: "Lien invalide ou expiré : demandez un nouveau lien à Chef2Box." }, 404);

  // Anti-abus simple : 30 actions par heure et par client (commandes comptées).
  const { count } = await admin
    .from("application_demandes_semaine")
    .select("id", { count: "exact", head: true })
    .eq("personne_id", fiche.id)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= 30) return repondre({ erreur: "Trop d'envois, réessayez dans un moment." }, 429);

  const action = d.action;

  // ---- Ma fiche ----
  if (action === "fiche") {
    const quartier = texte(d.quartier, 60);
    const zone = quartier ? zoneDuQuartier(quartier) : null;
    const maj = {
      allergies: texte(d.allergies, 300),
      refus: texte(d.refus, 300),
      note: texte(d.note, 200),
      ...(quartier && zone ? { quartier, zone } : {}),
      adresse: texte(d.adresse, 200),
      ...(nombre(d.lat, -90, 90) != null && nombre(d.lng, -180, 180) != null ? { lat: d.lat as number, lng: d.lng as number } : {}),
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from("application_personnes").update(maj).eq("id", fiche.id);
    if (error) return repondre({ erreur: "Enregistrement impossible, réessayez." }, 500);
    // Ses repas à venir suivent (allergies, refus, adresse).
    await admin
      .from("application_cuisine_extras")
      .update({ allergies: maj.allergies, refus: maj.refus, adresse: maj.adresse, ...("lat" in maj ? { lat: maj.lat, lng: maj.lng } : {}) })
      .ilike("nom", motif(fiche.nom))
      .gt("date", dateDuJour());
    return repondre({ ok: true });
  }

  // Client déjà venu (au moins un repas au planning) : commandes directes.
  const { count: dejaVenu } = await admin
    .from("application_cuisine_extras")
    .select("id", { count: "exact", head: true })
    .ilike("nom", motif(fiche.nom));
  const connu = (dejaVenu ?? 0) > 0;

  // ---- Annuler un repas ----
  if (action === "annuler") {
    const date = typeof d.date === "string" && estDateValide(d.date) ? d.date : null;
    const service = d.service === "dejeuner" || d.service === "diner" ? (d.service as Service) : null;
    if (!date || !service || !encoreModifiable(date)) return repondre({ erreur: "Ce repas ne peut plus être annulé (après la veille 20 h)." }, 400);
    const { error } = await admin
      .from("application_cuisine_extras")
      .delete()
      .ilike("nom", motif(fiche.nom))
      .eq("date", date)
      .eq("repas_type", service);
    if (error) return repondre({ erreur: "Annulation impossible, réessayez." }, 500);
    // Retiré aussi d'une demande en attente.
    const { data: attente } = await admin
      .from("application_demandes_semaine")
      .select("id, repas")
      .eq("personne_id", fiche.id)
      .eq("semaine", lundiDe(date))
      .eq("statut", "a_valider")
      .maybeSingle<{ id: string; repas: RepasChoisi[] }>();
    if (attente) {
      const reste = attente.repas.filter((r) => !(r.date === date && r.service === service));
      await admin
        .from("application_demandes_semaine")
        .update(reste.length ? { repas: reste } : { repas: reste, statut: "refusee", traitee_le: new Date().toISOString() })
        .eq("id", attente.id);
    }
    return repondre({ ok: true });
  }

  // ---- Commander une semaine ----
  if (action !== "commander") return repondre({ erreur: "Action inconnue." }, 400);
  const semaine = typeof d.semaine === "string" && estDateValide(d.semaine) && lundiDe(d.semaine) === d.semaine ? d.semaine : null;
  if (!semaine) return repondre({ erreur: "Semaine invalide." }, 400);
  const vendredi = decalerDate(semaine, 4);
  const vus = new Set<string>();
  const repas: RepasChoisi[] = [];
  for (const r of Array.isArray(d.repas) ? d.repas.slice(0, 20) : []) {
    const date = (r as RepasChoisi)?.date;
    const service = (r as RepasChoisi)?.service;
    if (typeof date !== "string" || date < semaine || date > vendredi || (service !== "dejeuner" && service !== "diner")) continue;
    if (!encoreModifiable(date) || vus.has(`${date}|${service}`)) continue;
    vus.add(`${date}|${service}`);
    repas.push({ date, service });
  }

  // Livraison : quartier choisi à la commande, sinon celui de la fiche.
  const quartier = texte(d.quartier, 60) ?? fiche.quartier;
  const zone = quartier ? zoneDuQuartier(quartier) : null;
  if (!quartier || !zone) return repondre({ erreur: "Choisissez votre quartier de livraison." }, 400);
  const adresse = texte(d.adresse, 200) ?? fiche.adresse;
  const lat = nombre(d.lat, -90, 90) ?? fiche.lat;
  const lng = nombre(d.lng, -180, 180) ?? fiche.lng;
  await admin
    .from("application_personnes")
    .update({ quartier, zone, adresse, lat, lng, updated_at: new Date().toISOString() })
    .eq("id", fiche.id);

  const { data: parametre } = await admin.from("application_parametres").select("valeur").eq("cle", "tarifs").maybeSingle<{ valeur: object }>();
  const tarifs = completerTarifs(parametre?.valeur);

  if (!connu) {
    // Nouveau client : sa première commande attend la validation de l'admin.
    if (repas.length === 0) return repondre({ erreur: "Choisissez au moins un repas (jusqu'à la veille 20 h)." }, 400);
    const prix = prixDemande(repas, zone, tarifs, { remise: fiche.remise ?? 0, livraisonOfferte: !!fiche.livraison_offerte });
    const ligne = {
      personne_id: fiche.id,
      semaine,
      repas,
      allergies: fiche.allergies,
      refus: fiche.refus,
      note: fiche.note,
      zone,
      quartier,
      adresse,
      lat,
      lng,
      prix_repas: prix.prixRepas,
      prix_livraison: prix.prixLivraison,
      total: prix.total,
    };
    const { data: enAttente } = await admin
      .from("application_demandes_semaine")
      .select("id")
      .eq("personne_id", fiche.id)
      .eq("semaine", semaine)
      .eq("statut", "a_valider")
      .maybeSingle<{ id: string }>();
    const { error } = enAttente
      ? await admin.from("application_demandes_semaine").update(ligne).eq("id", enAttente.id)
      : await admin.from("application_demandes_semaine").insert(ligne);
    if (error) return repondre({ erreur: "Envoi impossible, réessayez." }, 500);
    return repondre({ ok: true, aValider: true, total: prix.total });
  }

  // Client connu : la semaine (jours encore modifiables) devient exactement son choix.
  const { data: existants } = await admin
    .from("application_cuisine_extras")
    .select("id, date, repas_type")
    .ilike("nom", motif(fiche.nom))
    .gte("date", semaine)
    .lte("date", vendredi)
    .returns<{ id: string; date: string; repas_type: Service }[]>();
  const choisis = new Set(repas.map((r) => `${r.date}|${r.service}`));
  const aRetirer = (existants ?? []).filter((x) => encoreModifiable(x.date) && !choisis.has(`${x.date}|${x.repas_type}`)).map((x) => x.id);
  const aAjouter = repas.filter((r) => !(existants ?? []).some((x) => x.date === r.date && x.repas_type === r.service));
  const restants = (existants ?? []).filter((x) => !aRetirer.includes(x.id)).length + aAjouter.length;
  if (restants === 0 && (existants ?? []).length === 0) return repondre({ erreur: "Choisissez au moins un repas." }, 400);
  if (aRetirer.length) {
    const { error } = await admin.from("application_cuisine_extras").delete().in("id", aRetirer);
    if (error) return repondre({ erreur: "Modification impossible, réessayez." }, 500);
  }
  if (aAjouter.length) {
    const { error } = await admin.from("application_cuisine_extras").insert(
      aAjouter.map((r) => ({
        date: r.date,
        repas_type: r.service,
        nom: fiche.nom,
        palier: fiche.palier,
        allergies: fiche.allergies,
        refus: fiche.refus,
        note: fiche.note,
        telephone: fiche.telephone,
        adresse,
        lat,
        lng,
      }))
    );
    if (error) return repondre({ erreur: "Commande impossible, réessayez." }, 500);
  }
  if (aAjouter.length || aRetirer.length) await prevenirAdmin(admin, fiche.nom, restants);
  return repondre({ ok: true, aValider: false });
}
