import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Inscription libre depuis l'appli (page /inscription). Le compte est créé
// côté serveur (sans e-mail de confirmation, qui serait limité à quelques
// envois par heure) ; le client remplit ensuite le questionnaire de profil
// (/bienvenue/profil) qui calcule ses objectifs.

export const dynamic = "force-dynamic";

const erreur = (message: string, statut: number) => NextResponse.json({ erreur: message }, { status: statut });

// Anti-abus simple : pas plus de 30 inscriptions par heure au total.
const MAX_PAR_HEURE = 30;

export async function POST(request: Request) {
  const corps = await request.json().catch(() => null);
  // Champ piège invisible : rempli seulement par les robots.
  if (typeof corps?.site === "string" && corps.site.trim()) return NextResponse.json({ ok: true }, { status: 201 });

  const nom = typeof corps?.nom === "string" ? corps.nom.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  const email = typeof corps?.email === "string" ? corps.email.trim().toLowerCase().slice(0, 120) : "";
  const motDePasse = typeof corps?.motDePasse === "string" ? corps.motDePasse : "";
  const telephone = typeof corps?.telephone === "string" ? corps.telephone.trim().slice(0, 30) || null : null;

  if (nom.length < 2) return erreur("Indiquez votre prénom.", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erreur("Adresse e-mail invalide.", 400);
  if (motDePasse.length < 8 || motDePasse.length > 72) return erreur("Mot de passe : 8 caractères minimum.", 400);
  if (corps?.accepte !== true) return erreur("Acceptez les conditions pour continuer.", 400);

  const admin = createAdminClient();
  if (!admin) return erreur("Inscription indisponible pour le moment.", 503);

  const { count } = await admin
    .from("application_clients")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= MAX_PAR_HEURE) return erreur("Beaucoup d'inscriptions en ce moment, réessayez dans un moment.", 429);

  const { data: cree, error: erreurAuth } = await admin.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
    user_metadata: { nom, doit_completer_profil: true, inscription: "appli" },
  });
  if (erreurAuth || !cree.user) {
    const msg = erreurAuth?.message ?? "";
    if (/already|registered|exists/i.test(msg)) return erreur("Un compte existe déjà avec cet e-mail : connectez-vous.", 409);
    if (/weak|pwned|leaked|password/i.test(msg)) return erreur("Mot de passe trop facile à deviner, choisissez-en un autre.", 400);
    return erreur("Création du compte impossible, réessayez.", 500);
  }

  // Objectifs par défaut : remplacés par le questionnaire juste après.
  const { error: erreurFiche } = await admin.from("application_clients").insert({ id: cree.user.id, nom, telephone });
  if (erreurFiche) {
    await admin.auth.admin.deleteUser(cree.user.id);
    return erreur("Création du compte impossible, réessayez.", 500);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
