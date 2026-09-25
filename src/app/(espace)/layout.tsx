import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";

// Barre du haut et barre du bas communes à toutes les pages de l'appli.
// Placées ici, elles restent affichées d'un onglet à l'autre au lieu d'être
// recréées à chaque changement de page.
export default async function EspaceLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: moi } = await supabase.from("application_clients").select("est_admin").eq("id", user.id).maybeSingle();

  return (
    <>
      <Nav estAdmin={!!moi?.est_admin} />
      {children}
    </>
  );
}
