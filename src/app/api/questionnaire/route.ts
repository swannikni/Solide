import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { entetesCors } from "@/lib/cors-site";
import { GRIGNOTAGE, LIMITES, METIERS, PLAISIR, SEANCES, calculerObjectifs, profilComplet, type Profil } from "@/lib/objectifs";

// Réception des questionnaires remplis sur chef2box.com. Route publique
// (appelée depuis le site) : on valide tout, on recalcule les objectifs
// côté serveur, et on range la demande pour que l'admin crée le compte.

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: entetesCors(request.headers.get("origin")) });
}

const texte = (v: unknown, max = 200) =>
  typeof v === "string" && v.trim() && v.trim() !== "—" ? v.trim().slice(0, max) : null;
const entier = (v: unknown, min: number, max: number) => {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export async function POST(request: Request) {
  const cors = entetesCors(request.headers.get("origin"));
  const repondre = (corps: object, statut: number) => NextResponse.json(corps, { status: statut, headers: cors });

  const brut = await request.text();
  if (brut.length > 20_000) return repondre({ erreur: "Trop volumineux." }, 413);
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(brut);
  } catch {
    return repondre({ erreur: "Format invalide." }, 400);
  }

  const nom = texte(d.nom, 80);
  if (!nom) return repondre({ erreur: "Nom manquant." }, 400);
  const email = texte(d.email, 120)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return repondre({ erreur: "Email invalide." }, 400);

  const objectifs = (texte(d.objectif, 300) ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  const profil: Partial<Profil> = {
    sexe: d.sexe === "Femme" ? "Femme" : d.sexe === "Homme" ? "Homme" : undefined,
    age: entier(d.age, LIMITES.age.min, LIMITES.age.max) ?? 0,
    taille: entier(d.taille, LIMITES.taille.min, LIMITES.taille.max) ?? 0,
    poids: entier(d.poids, LIMITES.poids.min, LIMITES.poids.max) ?? 0,
    objectifs,
    seances: (SEANCES as readonly string[]).includes(String(d.seances)) ? (String(d.seances) as Profil["seances"]) : "0",
    job: (METIERS as readonly string[]).includes(String(d.job)) ? (String(d.job) as Profil["job"]) : "Principalement assis",
    grignotage: (GRIGNOTAGE as readonly string[]).includes(String(d.grigno)) ? (String(d.grigno) as Profil["grignotage"]) : "—",
    plaisir: (PLAISIR as readonly string[]).includes(String(d.plaisir)) ? (String(d.plaisir) as Profil["plaisir"]) : "—",
  };
  const calcul = profilComplet(profil) ? calculerObjectifs(profil) : null;

  const admin = createAdminClient();
  if (!admin) return repondre({ erreur: "Service indisponible." }, 503);

  // Anti-abus simple : pas plus de 30 envois par heure au total.
  const { count } = await admin
    .from("application_questionnaires")
    .select("id", { count: "exact", head: true })
    .eq("source", "site")
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= 30) return repondre({ erreur: "Trop d'envois, réessayez plus tard." }, 429);

  const reponses: Record<string, string | number | null> = {};
  for (const cle of ["sport", "duree", "objTexte", "repas", "repartition", "allergies", "refuses", "preferes", "kcal", "prot", "gluc", "lip", "palier"]) {
    const v = d[cle];
    reponses[cle] = typeof v === "number" ? v : texte(v, 500);
  }

  const { data: cree, error } = await admin.from("application_questionnaires").insert({
    source: "site",
    nom,
    email,
    telephone: texte(d.tel, 30),
    calories: calcul?.calories ?? null,
    proteines: calcul?.proteines ?? null,
    glucides: calcul?.glucides ?? null,
    lipides: calcul?.lipides ?? null,
    palier: calcul?.palier ?? null,
    profil: profilComplet(profil) ? profil : null,
    reponses,
  }).select("id").single<{ id: string }>();
  if (error || !cree) return repondre({ erreur: "Enregistrement impossible." }, 500);

  // Bilan refait par quelqu'un qui a déjà sa fiche (lien envoyé) mais n'a
  // jamais commandé : sa fiche suit le nouveau bilan (palier, allergies…).
  // Un client qui a déjà commandé garde sa fiche : l'admin décide.
  const derniers9 = (texte(d.tel, 30) ?? "").replace(/[^\d]/g, "").slice(-9);
  let dejaClient: string | null = null;
  if (derniers9.length === 9 && calcul) {
    const { data: fiches } = await admin
      .from("application_personnes")
      .select("id, nom, telephone")
      .ilike("telephone", `%${derniers9.slice(-4)}%`)
      .limit(20)
      .returns<{ id: string; nom: string; telephone: string | null }[]>();
    for (const f of (fiches ?? []).filter((x) => (x.telephone ?? "").replace(/[^\d]/g, "").endsWith(derniers9))) {
      const { count } = await admin
        .from("application_cuisine_extras")
        .select("id", { count: "exact", head: true })
        .ilike("nom", f.nom.replace(/[%_\\]/g, "\\$&"));
      if ((count ?? 0) > 0) {
        dejaClient = f.nom;
        continue;
      }
      const utile = (v: unknown, max: number) => {
        const t = typeof v === "string" ? v.trim() : "";
        return t && !/^(—|-|rien|aucune?|non|ras|néant)$/i.test(t) ? t.slice(0, max) : null;
      };
      await admin
        .from("application_personnes")
        .update({
          palier: calcul.palier,
          allergies: utile(d.allergies, 300),
          refus: utile(d.refuses, 300),
          updated_at: new Date().toISOString(),
        })
        .eq("id", f.id);
    }
  }

  // Notification à l'admin : nouveau bilan (ou ancien client qui le refait).
  const resume = [
    calcul ? `${calcul.calories} kcal/jour` : null,
    calcul?.palier ? `Palier ${calcul.palier.slice(1)}` : null,
    texte(d.objTexte, 60),
  ]
    .filter(Boolean)
    .join(" · ");
  await prevenirAdmin(admin, nom, cree.id, `${dejaClient ? `Déjà client (${dejaClient}), a refait son bilan` : "Nouveau prospect"}${resume ? ` · ${resume}` : ""}. Touche pour ouvrir sa fiche.`);
  return repondre({ ok: true }, 201);
}

async function prevenirAdmin(admin: NonNullable<ReturnType<typeof createAdminClient>>, nom: string, id: string, texte: string) {
  try {
    const { data: secret } = await admin.rpc("application_secret", { p_nom: "rappel_cron_secret" });
    if (!secret) return;
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/rappels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": String(secret) },
      body: JSON.stringify({ type: "prospect", nom, id, texte }),
    });
  } catch {}
}
