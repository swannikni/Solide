import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PALIERS, profilComplet, type Profil } from "@/lib/objectifs";

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
  const supabase = await createClient();
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

// Créer un compte client (POST) ou lui redonner un code provisoire (PATCH).
// Le code ne sert qu'à la première connexion : le client choisit ensuite
// son propre mot de passe (page /bienvenue), que l'admin ne connaît pas.
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

  const profilBrut = corps?.profil as Partial<Profil> | null | undefined;
  const profil = profilBrut && profilComplet(profilBrut)
    ? {
        sexe: profilBrut.sexe,
        age: Number(profilBrut.age),
        taille: Number(profilBrut.taille),
        poids: Math.trunc(Number(profilBrut.poids)),
        objectifs: profilBrut.objectifs.map(String).slice(0, 5),
        seances: String(profilBrut.seances),
        job: String(profilBrut.job),
        grignotage: String(profilBrut.grignotage ?? "—"),
        plaisir: String(profilBrut.plaisir ?? "—"),
      }
    : null;

  if (!nom) return erreur("Le nom est obligatoire.", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erreur("Adresse email invalide.", 400);
  if (calories === null || proteines === null || glucides === null || lipides === null)
    return erreur("Objectifs invalides.", 400);

  const mdp = motDePasse();
  const { data: cree, error: erreurAuth } = await admin.auth.admin.createUser({
    email,
    password: mdp,
    email_confirm: true,
    user_metadata: { nom, doit_choisir_mdp: true },
  });
  if (erreurAuth || !cree.user) {
    const existe = /already|registered|exists/i.test(erreurAuth?.message ?? "");
    // Compte dont l'accès avait été retiré : on le réactive (mêmes données).
    if (existe) {
      const { data: liste } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const ancien = liste?.users.find((u) => u.email?.toLowerCase() === email);
      const bloque = !!ancien?.banned_until && new Date(ancien.banned_until) > new Date();
      if (ancien && bloque) {
        const { error: erreurReactivation } = await admin.auth.admin.updateUserById(ancien.id, {
          ban_duration: "none",
          password: mdp,
          user_metadata: { ...(ancien.user_metadata ?? {}), nom, doit_choisir_mdp: true },
        });
        if (erreurReactivation) return erreur("Réactivation du compte impossible.", 500);
        await admin.from("application_clients").upsert({
          id: ancien.id,
          nom,
          telephone,
          palier,
          ...(profil ? { profil } : {}),
          objectif_calories: calories,
          objectif_proteines: proteines,
          objectif_glucides: glucides,
          objectif_lipides: lipides,
          premium: true,
        });
        return NextResponse.json({ id: ancien.id, email, motDePasse: mdp, reactive: true });
      }
    }
    return erreur(existe ? "Un compte existe déjà avec cet email." : "Création du compte impossible.", existe ? 409 : 500);
  }

  const { error: erreurFiche } = await admin.from("application_clients").insert({
    id: cree.user.id,
    nom,
    telephone,
    palier,
    profil,
    objectif_calories: calories,
    objectif_proteines: proteines,
    objectif_glucides: glucides,
    objectif_lipides: lipides,
    premium: true, // créé par l'admin : client Chef2Box
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

  const { data: existant } = await admin.auth.admin.getUserById(id);
  const mdp = motDePasse();
  const { data, error } = await admin.auth.admin.updateUserById(id, {
    password: mdp,
    user_metadata: { ...(existant?.user?.user_metadata ?? {}), doit_choisir_mdp: true },
  });
  if (error || !data.user) return erreur("Changement de mot de passe impossible.", 500);
  return NextResponse.json({ id, email: data.user.email, motDePasse: mdp });
}

// DELETE :
// - { id } : retire l'accès à l'appli (connexion bloquée). Ses données
//   restent ; recréer son compte avec le même email le réactive.
// - { personne } : efface le client de tout (fiche, repas, paiements,
//   demandes et, s'il en a un, son compte appli avec ses données).
export async function DELETE(request: Request) {
  if (!(await verifierAdmin())) return erreur("Réservé à l'admin.", 403);
  const admin = createAdminClient();
  if (!admin) return erreur("CLE_SERVICE_MANQUANTE", 503);
  const corps = await request.json().catch(() => null);
  const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

  const personne = uuid(corps?.personne);
  if (personne) {
    const { data: fiche } = await admin.from("application_personnes").select("id, nom, client_id").eq("id", personne).maybeSingle();
    if (!fiche) return erreur("Client inconnu.", 404);
    const nom = String(fiche.nom).trim();
    const motif = nom.replace(/[%_\\]/g, "\\$&");
    if (fiche.client_id) {
      const { data: compte } = await admin.from("application_clients").select("est_admin").eq("id", fiche.client_id).maybeSingle();
      if (compte?.est_admin) return erreur("Impossible de supprimer un admin.", 400);
    }
    const resultats = await Promise.all([
      admin.from("application_cuisine_extras").delete().ilike("nom", motif),
      admin.from("application_paiements").delete().eq("cle", `n:${nom.toLowerCase()}`),
      admin.from("application_cuisine_sacs").delete().eq("cle", `m:${nom.toLowerCase()}`),
    ]);
    if (resultats.some((r) => r.error)) return erreur("Suppression impossible, réessayez.", 500);
    const { error } = await admin.from("application_personnes").delete().eq("id", fiche.id);
    if (error) return erreur("Suppression impossible, réessayez.", 500);
    if (fiche.client_id) {
      await admin.from("application_paiements").delete().eq("client_id", fiche.client_id);
      await admin.auth.admin.deleteUser(fiche.client_id);
    }
    return NextResponse.json({ ok: true, compteSupprime: fiche.client_id ?? null });
  }

  const id = uuid(corps?.id);
  if (!id) return erreur("Client inconnu.", 400);
  const { data: fiche } = await admin.from("application_clients").select("est_admin").eq("id", id).maybeSingle();
  if (!fiche || fiche.est_admin) return erreur("Client inconnu.", 404);
  const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
  if (error) return erreur("Retrait de l'accès impossible, réessayez.", 500);
  return NextResponse.json({ ok: true });
}
