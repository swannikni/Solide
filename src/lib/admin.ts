import { redirect } from "next/navigation";
import { exigerSession } from "@/lib/session";

// À appeler en tête de chaque page admin : renvoie le client Supabase si
// l'utilisateur connecté est admin, sinon redirige.
export async function exigerAdmin() {
  const { supabase, client: moi } = await exigerSession();
  if (!moi.est_admin) redirect("/dashboard");

  return { supabase, moi };
}
