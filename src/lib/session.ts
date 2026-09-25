import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/types";

// Session du visiteur, lue une seule fois par affichage de page : le layout et
// la page la partagent au lieu de redemander chacun l'utilisateur.
// getClaims vérifie le jeton de connexion sans aller-retour réseau quand le
// projet signe ses jetons avec des clés asymétriques (sinon, il interroge Auth).
export const lireSession = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  let userId = data?.claims?.sub ?? null;
  let email = typeof data?.claims?.email === "string" ? data.claims.email : "";
  // Filet de sécurité : si la vérification locale échoue, on demande à Auth.
  if (!userId && error) {
    const { data: u } = await supabase.auth.getUser();
    userId = u.user?.id ?? null;
    email = u.user?.email ?? "";
  }
  if (!userId) return null;
  const { data: client } = await supabase.from("application_clients").select("*").eq("id", userId).maybeSingle<Client>();
  return { supabase, userId, email, client };
});

// Pour les pages de l'espace client : redirige vers la connexion sinon.
export async function exigerSession() {
  const session = await lireSession();
  if (!session?.client) redirect("/login");
  return { ...session, client: session.client };
}
