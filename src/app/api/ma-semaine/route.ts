import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { completerTarifs } from "@/lib/paiements";
import { encoreModifiable, lundiDe, prixDemande, zoneDuQuartier, type RepasChoisi } from "@/lib/ma-semaine";
import { decalerDate, estDateValide } from "@/lib/dates";

// « Ma semaine » : le client envoie ses repas, soit depuis son lien
// personnel (/ma-semaine/<jeton>), soit depuis le lien commun partagé avec
// le menu (/ma-semaine : prénom + téléphone). Route publique : tout est
// vérifié ici, le prix est recalculé côté serveur, et la demande attend la
// validation de l'admin.

export const dynamic = "force-dynamic";

const texte = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const nombre = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
// 9 derniers chiffres : « 06 12 34 56 78 » et « +212 6 12 34 56 78 » se rejoignent.
const finNumero = (t: string | null) => (t ?? "").replace(/\D/g, "").slice(-9);

// Lien commun : retrouve la fiche par le téléphone, sinon en crée une.
async function ficheDuLienCommun(admin: SupabaseClient, nom: string, telephone: string) {
  const fin = finNumero(telephone);
  const { data: fiches } = await admin
    .from("application_personnes")
    .select("id, nom, telephone")
    .not("telephone", "is", null)
    .limit(5000)
    .returns<{ id: string; nom: string; telephone: string | null }[]>();
  const connue = (fiches ?? []).find((f) => finNumero(f.telephone) === fin);
  if (connue) return connue.id;
  // Nouveau client : même nom qu'une autre fiche → on ajoute la fin du numéro.
  const { data: homonyme } = await admin.from("application_personnes").select("id").eq("cle", nom.toLowerCase()).maybeSingle();
  const nomFiche = homonyme ? `${nom} (${fin.slice(-4)})` : nom;
  const { data: creee } = await admin
    .from("application_personnes")
    .insert({ nom: nomFiche.slice(0, 80), telephone: telephone.slice(0, 30) })
    .select("id")
    .single<{ id: string }>();
  return creee?.id ?? null;
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
  const semaine = typeof d.semaine === "string" && estDateValide(d.semaine) && lundiDe(d.semaine) === d.semaine ? d.semaine : null;
  if (!semaine) return repondre({ erreur: "Semaine invalide." }, 400);
  const nom = texte(d.nom, 60)?.replace(/\s+/g, " ") ?? null;
  const telephone = texte(d.telephone, 30);
  if (!jeton) {
    if (!nom || nom.length < 2) return repondre({ erreur: "Indiquez votre prénom." }, 400);
    if (finNumero(telephone).length < 9) return repondre({ erreur: "Indiquez votre numéro WhatsApp." }, 400);
  }

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

  const admin = createAdminClient();
  if (!admin) return repondre({ erreur: "Service indisponible, réessayez plus tard." }, 503);

  // Anti-abus simple : 60 envois par heure au total.
  const { count } = await admin
    .from("application_demandes_semaine")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= 60) return repondre({ erreur: "Beaucoup d'envois en ce moment, réessayez dans un moment." }, 429);

  let personneId: string | null = null;
  if (jeton) {
    const { data } = await admin.from("application_personnes").select("id").eq("jeton", jeton).maybeSingle<{ id: string }>();
    if (!data) return repondre({ erreur: "Lien invalide ou expiré : demandez un nouveau lien à Chef2Box." }, 404);
    personneId = data.id;
  } else {
    personneId = await ficheDuLienCommun(admin, nom!, telephone!);
    if (!personneId) return repondre({ erreur: "Envoi impossible, réessayez." }, 500);
  }

  const { data: parametre } = await admin.from("application_parametres").select("valeur").eq("cle", "tarifs").maybeSingle<{ valeur: object }>();
  const prix = prixDemande(repas, zone, completerTarifs(parametre?.valeur));
  const ligne = {
    personne_id: personneId,
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
    .eq("personne_id", personneId)
    .eq("semaine", semaine)
    .eq("statut", "a_valider")
    .maybeSingle<{ id: string }>();
  const { error } = enAttente
    ? await admin.from("application_demandes_semaine").update(ligne).eq("id", enAttente.id)
    : await admin.from("application_demandes_semaine").insert(ligne);
  if (error) return repondre({ erreur: "Envoi impossible, réessayez." }, 500);
  return repondre({ ok: true, total: prix.total });
}
