import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import { AssistantChat } from "@/components/AssistantChat";
import type { Client } from "@/lib/types";

export default async function AssistantPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: client }, { data: messages }] = await Promise.all([
    supabase.from("application_clients").select("*").eq("id", user.id).single<Client>(),
    supabase
      .from("application_assistant_messages")
      .select("id, role, contenu")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40)
      .returns<{ id: string; role: "user" | "assistant"; contenu: string }[]>(),
  ]);
  if (!client) redirect("/login");

  return (
    <div className="min-h-screen pt-[68px] md:pt-20">
      <Nav estAdmin={client.est_admin} />
      <AssistantChat prenom={client.nom.split(" ")[0]} messagesInitiaux={(messages ?? []).reverse()} />
    </div>
  );
}
