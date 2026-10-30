import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { completerTarifs } from "@/lib/paiements";
import { encoreModifiable, lundiDe, prixDemande, zoneDuQuartier, type RepasChoisi } from "@/lib/ma-semaine";
import { decalerDate, estDateValide } from "@/lib/dates";

// « Ma semaine » : le client envoie ses repas depuis son lien personnel
// (/ma-semaine/<jeton>). Route publique : tout est vérifié ici, le prix est
// recalculé côté serveur, et la demande attend la validation de l'admin.

export const dynamic = "force-dynamic";

const texte = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const nombre = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);

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
  const semaine = typeof d.semaine === "string" && estDateValide(d.semaine) && lundiDe(d.semaine) === d.semaine ? d.semaine : null;
  if (!jeton || !semaine) return repondre({ erreur: "Lien invalide." }, 400);

  const admin = createAdminClient();
  if (!admin) return repondre({ erreur: "Service indisponible, réessayez plus tard." }, 503);
  const { data: personne } = await admin.from("application_personnes").select("id").eq("jeton", jeton).maybeSingle<{ id: string }>();
  if (!personne) return repondre({ erreur: "Lien invalide ou expiré : demandez un nouveau lien à Chef2Box." }, 404);

  // Repas : du lundi au vendredi de la semaine, encore modifiables (veille 20 h).
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
  if (repas.length === 0) return repondre({ erreur: "Choisissez au moins un repas (jusqu'à la veille 20 h)." }, 400);

  const quartier = texte(d.quartier, 60);
  const zone = quartier ? zoneDuQuartier(quartier) : null;
  if (!quartier || !zone) return repondre({ erreur: "Choisissez votre quartier de livraison." }, 400);

  // Anti-abus simple : 10 envois par heure et par lien au plus.
  const { count } = await admin
    .from("application_demandes_semaine")
    .select("id", { count: "exact", head: true })
    .eq("personne_id", personne.id)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= 10) return repondre({ erreur: "Trop d'envois, réessayez dans un moment." }, 429);

  const { data: parametre } = await admin.from("application_parametres").select("valeur").eq("cle", "tarifs").maybeSingle<{ valeur: object }>();
  const prix = prixDemande(repas, zone, completerTarifs(parametre?.valeur));
  const ligne = {
    personne_id: personne.id,
    semaine,
    repas,
    allergies: texte(d.allergies, 300),
    refus: texte(d.refus, 300),
    note: texte(d.note, 200),
    zone,
    quartier,
    adresse: texte(d.adresse, 200),
    lat: nombre(d.lat, -90, 90),
    lng: nombre(d.lng, -180, 180),
    prix_repas: prix.prixRepas,
    prix_livraison: prix.prixLivraison,
    total: prix.total,
  };

  // Une seule demande en attente par semaine : on la met à jour.
  const { data: enAttente } = await admin
    .from("application_demandes_semaine")
    .select("id")
    .eq("personne_id", personne.id)
    .eq("semaine", semaine)
    .eq("statut", "a_valider")
    .maybeSingle<{ id: string }>();
  const { error } = enAttente
    ? await admin.from("application_demandes_semaine").update(ligne).eq("id", enAttente.id)
    : await admin.from("application_demandes_semaine").insert(ligne);
  if (error) return repondre({ erreur: "Envoi impossible, réessayez." }, 500);
  return repondre({ ok: true, total: prix.total });
}
