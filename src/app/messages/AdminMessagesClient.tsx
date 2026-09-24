"use client";

import { useState } from "react";
import { MessagesThread } from "@/components/MessagesThread";
import { createClient } from "@/lib/supabase/client";
import type { Client, Message } from "@/lib/types";

export function AdminMessagesClient({ clients }: { clients: Client[] }) {
  const supabase = createClient();
  const [clientSelectionne, setClientSelectionne] = useState<Client | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  async function selectionner(client: Client) {
    setClientSelectionne(client);
    const { data } = await supabase
      .from("application_messages")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: true })
      .returns<Message[]>();
    setMessages(data ?? []);
  }

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6">
      <h1 className="font-hand text-3xl text-c2b-green mb-4">Messages</h1>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-1">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => selectionner(c)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                clientSelectionne?.id === c.id ? "bg-c2b-green text-c2b-cream" : "bg-white text-c2b-green"
              }`}
            >
              {c.nom}
            </button>
          ))}
        </div>

        <div className="md:col-span-2">
          {clientSelectionne ? (
            <MessagesThread
              key={clientSelectionne.id}
              clientId={clientSelectionne.id}
              expediteurActuel="admin"
              messagesInitiaux={messages}
            />
          ) : (
            <p className="text-sm text-c2b-green/50 italic text-center py-8">
              Sélectionnez un client pour voir la conversation.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
