import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/types";

// À appeler en tête de chaque page admin : renvoie le client Supabase si
// l'utilisateur connecté est admin, sinon redirige.
export async function exigerAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: moi } = await supabase.from("application_clients").select("*").eq("id", user.id).single<Client>();
  if (!moi?.est_admin) redirect("/dashboard");

  return { supabase, moi };
}
