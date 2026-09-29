import { Nav } from "@/components/Nav";
import { SignalerVisite } from "@/components/SignalerVisite";
import { exigerSession } from "@/lib/session";

// Barre du haut et barre du bas communes à toutes les pages de l'appli.
// Placées ici, elles restent affichées d'un onglet à l'autre au lieu d'être
// recréées à chaque changement de page.
export default async function EspaceLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId, client } = await exigerSession();
  const estAdmin = client.est_admin;
  const compter = (requete: PromiseLike<{ count: number | null }>) => Promise.resolve(requete).then((r) => r.count ?? 0);

  // Pastilles : messages non lus ; pour l'admin, ce qui l'attend (questionnaires, récompenses).
  // Pas d'attente ici : la page s'affiche, les pastilles suivent quand elles sont prêtes.
  const pastilles = Promise.all([
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
  ])
    .then(([nonLus, questionnaires, recompenses]) => ({ messages: nonLus, admin: questionnaires + recompenses }))
    .catch(() => ({ messages: 0, admin: 0 }));

  return (
    <>
      {!estAdmin && <SignalerVisite />}
      <Nav
        estAdmin={estAdmin}
        pastilles={pastilles}
        // Sans clé Anthropic, l'assistant ne peut pas répondre : on ne montre pas l'onglet.
        assistantActif={!!process.env.ANTHROPIC_API_KEY}
      />
      {children}
    </>
  );
}
