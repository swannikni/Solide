import { exigerSession } from "@/lib/session";
import { AssistantChat } from "@/components/AssistantChat";

export default async function AssistantPage() {
  const { supabase, userId, client } = await exigerSession();
  if (!process.env.ANTHROPIC_API_KEY) {
    return (
      <div className="min-h-screen pt-[68px] md:pt-20 pb-28">
        <main className="max-w-2xl mx-auto px-4 pt-6">
          <span className="lbl mb-2">Assistant Chef2Box</span>
          <p className="carte p-6 text-sm text-c2b-muted">
            L&apos;assistant arrive bientôt. En attendant, posez vos questions à l&apos;équipe dans Messages.
          </p>
        </main>
      </div>
    );
  }
  const { data: messages } = await supabase
    .from("application_assistant_messages")
    .select("id, role, contenu")
    .eq("client_id", userId)
    .order("created_at", { ascending: false })
    .limit(40)
    .returns<{ id: string; role: "user" | "assistant"; contenu: string }[]>();

  return (
    <div className="min-h-screen pt-[68px] md:pt-20">
      <AssistantChat prenom={client.nom.split(" ")[0]} messagesInitiaux={(messages ?? []).reverse()} />
    </div>
  );
}
