import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GRIGNOTAGE, METIERS, PLAISIR, SEANCES, calculerObjectifs, profilComplet, type Profil } from "@/lib/objectifs";

// Réception des questionnaires remplis sur chef2box.com. Route publique
// (appelée depuis le site) : on valide tout, on recalcule les objectifs
// côté serveur, et on range la demande pour que l'admin crée le compte.

export const dynamic = "force-dynamic";

const ORIGINES = ["https://chef2box.com", "https://www.chef2box.com", "https://chef2box-questionnaire.netlify.app"];

function entetesCors(origine: string | null): Record<string, string> {
  const autorisee = origine && ORIGINES.includes(origine) ? origine : ORIGINES[0];
  return {
    "Access-Control-Allow-Origin": autorisee,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

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
    age: entier(d.age, 10, 100) ?? 0,
    taille: entier(d.taille, 100, 250) ?? 0,
    poids: entier(d.poids, 25, 300) ?? 0,
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

  const { error } = await admin.from("application_questionnaires").insert({
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
  });
  if (error) return repondre({ erreur: "Enregistrement impossible." }, 500);
  return repondre({ ok: true }, 201);
}
