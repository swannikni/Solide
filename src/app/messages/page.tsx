import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import { MessagesThread } from "@/components/MessagesThread";
import { AdminMessagesClient } from "@/app/messages/AdminMessagesClient";
import type { Client, Message } from "@/lib/types";

export default async function MessagesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: moi } = await supabase.from("application_clients").select("*").eq("id", user.id).single<Client>();
  if (!moi) redirect("/login");

  if (moi.est_admin) {
    const { data: clients } = await supabase
      .from("application_clients")
      .select("*")
      .eq("est_admin", false)
      .order("nom")
      .returns<Client[]>();

    return (
      <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
        <Nav estAdmin />
        <AdminMessagesClient clients={clients ?? []} />
      </div>
    );
  }

  const { data: messages } = await supabase
    .from("application_messages")
    .select("*")
    .eq("client_id", user.id)
    .order("created_at", { ascending: true })
    .returns<Message[]>();

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <Nav estAdmin={false} />
      <main className="max-w-2xl mx-auto">
        <div className="px-4 pt-6">
          <span className="lbl mb-2">Messagerie</span>
          <h1 className="titre text-[34px]">
            Une question ? <em>Écrivez-nous.</em>
          </h1>
        </div>
        <MessagesThread clientId={user.id} expediteurActuel="client" messagesInitiaux={messages ?? []} />
      </main>
    </div>
  );
}
