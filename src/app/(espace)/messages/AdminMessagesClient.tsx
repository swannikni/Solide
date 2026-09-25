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
      <div className="mb-5">
        <span className="lbl mb-2">Messagerie</span>
        <h1 className="titre text-[34px]">
          Vos <em>clients</em>
        </h1>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-1">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => selectionner(c)}
              className={`w-full text-left px-4 py-3 rounded-2xl text-sm transition ${
                clientSelectionne?.id === c.id ? "bg-c2b-green text-white font-bold" : "bg-white text-c2b-green font-semibold border border-black/5"
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
