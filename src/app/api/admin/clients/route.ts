import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PALIERS } from "@/lib/objectifs";

export const dynamic = "force-dynamic";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function motDePasse() {
  const bloc = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${bloc()}-${bloc()}-${bloc()}`;
}

function erreur(message: string, statut: number) {
  return NextResponse.json({ erreur: message }, { status: statut });
}

async function verifierAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("application_clients").select("est_admin").eq("id", user.id).single();
  return !!data?.est_admin;
}

function entier(valeur: unknown, min: number, max: number) {
  const n = Math.round(Number(valeur));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

// Créer un compte client (POST) ou lui donner un nouveau mot de passe (PATCH).
export async function POST(request: Request) {
  if (!(await verifierAdmin())) return erreur("Réservé à l'admin.", 403);
  const admin = createAdminClient();
  if (!admin) return erreur("CLE_SERVICE_MANQUANTE", 503);

  const corps = await request.json().catch(() => null);
  const nom = typeof corps?.nom === "string" ? corps.nom.trim().slice(0, 80) : "";
  const email = typeof corps?.email === "string" ? corps.email.trim().toLowerCase() : "";
  const telephone = typeof corps?.telephone === "string" ? corps.telephone.trim().slice(0, 30) || null : null;
  const palier = PALIERS.includes(corps?.palier) ? corps.palier : null;
  const calories = entier(corps?.objectif_calories, 800, 6000);
  const proteines = entier(corps?.objectif_proteines, 0, 500);
  const glucides = entier(corps?.objectif_glucides, 0, 1000);
  const lipides = entier(corps?.objectif_lipides, 0, 400);

  if (!nom) return erreur("Le nom est obligatoire.", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erreur("Adresse email invalide.", 400);
  if (calories === null || proteines === null || glucides === null || lipides === null)
    return erreur("Objectifs invalides.", 400);

  const mdp = motDePasse();
  const { data: cree, error: erreurAuth } = await admin.auth.admin.createUser({
    email,
    password: mdp,
    email_confirm: true,
    user_metadata: { nom },
  });
  if (erreurAuth || !cree.user) {
    const existe = /already|registered|exists/i.test(erreurAuth?.message ?? "");
    return erreur(existe ? "Un compte existe déjà avec cet email." : "Création du compte impossible.", existe ? 409 : 500);
  }

  const { error: erreurFiche } = await admin.from("application_clients").insert({
    id: cree.user.id,
    nom,
    telephone,
    palier,
    objectif_calories: calories,
    objectif_proteines: proteines,
    objectif_glucides: glucides,
    objectif_lipides: lipides,
  });
  if (erreurFiche) {
    await admin.auth.admin.deleteUser(cree.user.id);
    return erreur("Création de la fiche client impossible.", 500);
  }

  return NextResponse.json({ id: cree.user.id, email, motDePasse: mdp });
}

export async function PATCH(request: Request) {
  if (!(await verifierAdmin())) return erreur("Réservé à l'admin.", 403);
  const admin = createAdminClient();
  if (!admin) return erreur("CLE_SERVICE_MANQUANTE", 503);

  const corps = await request.json().catch(() => null);
  const id = typeof corps?.id === "string" && /^[0-9a-f-]{36}$/i.test(corps.id) ? corps.id : null;
  if (!id) return erreur("Client inconnu.", 400);

  // Uniquement les comptes clients de l'appli, jamais un compte admin.
  const { data: fiche } = await admin.from("application_clients").select("est_admin").eq("id", id).maybeSingle();
  if (!fiche || fiche.est_admin) return erreur("Client inconnu.", 404);

  const mdp = motDePasse();
  const { data, error } = await admin.auth.admin.updateUserById(id, { password: mdp });
  if (error || !data.user) return erreur("Changement de mot de passe impossible.", 500);
  return NextResponse.json({ id, email: data.user.email, motDePasse: mdp });
}
