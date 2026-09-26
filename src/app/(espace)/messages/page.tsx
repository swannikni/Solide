import { exigerSession } from "@/lib/session";
import { MessagesThread } from "@/components/MessagesThread";
import { AdminMessagesClient } from "@/app/(espace)/messages/AdminMessagesClient";
import type { Client, Message } from "@/lib/types";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { supabase, userId, client: moi } = await exigerSession();

  if (moi.est_admin) {
    const [{ data: clients }, { data: nonLus }] = await Promise.all([
      supabase.from("application_clients").select("*").eq("est_admin", false).order("nom").returns<Client[]>(),
      supabase
        .from("application_messages")
        .select("client_id")
        .eq("expediteur", "client")
        .eq("lu", false)
        .returns<{ client_id: string }[]>(),
    ]);
    const nonLusParClient: Record<string, number> = {};
    for (const m of nonLus ?? []) nonLusParClient[m.client_id] = (nonLusParClient[m.client_id] ?? 0) + 1;

    return (
      <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
        <AdminMessagesClient
          clients={clients ?? []}
          nonLus={nonLusParClient}
          clientInitial={(await searchParams).client ?? null}
        />
      </div>
    );
  }

  const { data: messages } = await supabase
    .from("application_messages")
    .select("*")
    .eq("client_id", userId)
    .order("created_at", { ascending: true })
    .returns<Message[]>();

  // Écran fixe à la hauteur du téléphone : seule la conversation défile.
  return (
    <div className="h-[100dvh] flex flex-col pt-[68px] md:pt-20 pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-6">
      <main className="max-w-2xl w-full mx-auto flex-1 min-h-0 flex flex-col">
        <div className="px-4 pt-5 flex-shrink-0">
          <span className="lbl mb-2">Messagerie</span>
          <h1 className="titre text-[28px]">
            Une question ? <em>Écrivez-nous.</em>
          </h1>
        </div>
        <MessagesThread
          clientId={userId}
          expediteurActuel="client"
          messagesInitiaux={messages ?? []}
          className="flex-1 min-h-0"
        />
      </main>
    </div>
  );
}
