import { Nav } from "@/components/Nav";
import { exigerSession } from "@/lib/session";

// Barre du haut et barre du bas communes à toutes les pages de l'appli.
// Placées ici, elles restent affichées d'un onglet à l'autre au lieu d'être
// recréées à chaque changement de page.
export default async function EspaceLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId, client } = await exigerSession();
  const estAdmin = client.est_admin;
  const compter = (requete: PromiseLike<{ count: number | null }>) => Promise.resolve(requete).then((r) => r.count ?? 0);

  // Pastilles : messages non lus ; pour l'admin, ce qui l'attend (questionnaires, récompenses).
  const [nonLus, questionnaires, recompenses] = await Promise.all([
    compter(
      estAdmin
        ? supabase
            .from("application_messages")
            .select("id", { count: "exact", head: true })
            .eq("expediteur", "client")
            .eq("lu", false)
        : supabase
            .from("application_messages")
            .select("id", { count: "exact", head: true })
            .eq("client_id", userId)
            .eq("expediteur", "admin")
            .eq("lu", false)
    ),
    estAdmin
      ? compter(
          supabase.from("application_questionnaires").select("id", { count: "exact", head: true }).eq("statut", "nouveau")
        )
      : 0,
    estAdmin
      ? compter(
          supabase
            .from("application_recompenses_demandes")
            .select("id", { count: "exact", head: true })
            .eq("statut", "en_attente")
        )
      : 0,
  ]);

  return (
    <>
      <Nav
        estAdmin={estAdmin}
        pastilles={{ messages: nonLus, admin: questionnaires + recompenses }}
        // Sans clé Anthropic, l'assistant ne peut pas répondre : on ne montre pas l'onglet.
        assistantActif={!!process.env.ANTHROPIC_API_KEY}
      />
      {children}
    </>
  );
}
