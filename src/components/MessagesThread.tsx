"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";

export function MessagesThread({
  clientId,
  expediteurActuel,
  messagesInitiaux,
}: {
  clientId: string;
  expediteurActuel: "client" | "admin";
  messagesInitiaux: Message[];
}) {
  const supabase = createClient();
  const [messages, setMessages] = useState(messagesInitiaux);
  const [texte, setTexte] = useState("");
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(messagesInitiaux);
  }, [clientId, messagesInitiaux]);

  useEffect(() => {
    const canal = supabase
      .channel(`messages-${clientId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "application_messages", filter: `client_id=eq.${clientId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function envoyer() {
    if (!texte.trim()) return;
    const contenu = texte.trim();
    setTexte("");
    await supabase.from("application_messages").insert({
      client_id: clientId,
      expediteur: expediteurActuel,
      contenu,
    });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-160px)]">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-sm text-c2b-muted italic text-center mt-8">
            Aucun message pour l'instant. Dites bonjour !
          </p>
        )}
        {messages.map((m) => {
          const deMoi = m.expediteur === expediteurActuel;
          return (
            <div key={m.id} className={`flex ${deMoi ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  deMoi ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/10 text-c2b-green"
                }`}
              >
                {m.contenu}
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      <div className="border-t border-black/5 p-3 flex gap-2 bg-c2b-cream">
        <input
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && envoyer()}
          placeholder="Votre message..."
          className="champ flex-1 rounded-full px-5"
        />
        <button
          onClick={envoyer}
          className="w-12 h-12 rounded-full bg-c2b-green hover:bg-c2b-green-mid text-white flex items-center justify-center flex-shrink-0 transition"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
