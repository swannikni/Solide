"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";

export function MessagesThread({
  clientId,
  expediteurActuel,
  messagesInitiaux,
  className = "h-[calc(100dvh-160px)]",
}: {
  clientId: string;
  expediteurActuel: "client" | "admin";
  messagesInitiaux: Message[];
  // Hauteur de la conversation (la liste défile à l'intérieur, pas la page).
  className?: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [messages, setMessages] = useState(messagesInitiaux);

  // Messages reçus marqués comme lus, puis pastille de l'onglet mise à jour.
  async function marquerLus() {
    await supabase.rpc("application_marquer_lus", { p_client: expediteurActuel === "admin" ? clientId : null });
    router.refresh();
  }

  useEffect(() => {
    const autre = expediteurActuel === "admin" ? "client" : "admin";
    // Relancé quand la liste arrive (admin) ; après marquage, plus rien de non lu : pas de boucle.
    if (messagesInitiaux.some((m) => m.expediteur === autre && !m.lu)) marquerLus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, messagesInitiaux]);
  const [texte, setTexte] = useState("");
  const listeRef = useRef<HTMLDivElement>(null);

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
          const nouveau = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === nouveau.id) ? prev : [...prev, nouveau]));
          if (nouveau.expediteur !== expediteurActuel) marquerLus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    // Défile la liste seule jusqu'au dernier message (pas toute la page).
    const liste = listeRef.current;
    if (liste) liste.scrollTo({ top: liste.scrollHeight, behavior: "smooth" });
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
    <div className={`flex flex-col ${className}`}>
      <div ref={listeRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-sm text-c2b-muted italic text-center mt-8">
            Aucun message pour l'instant. Dites bonjour !
          </p>
        )}
        {messages.map((m, i) => {
          const deMoi = m.expediteur === expediteurActuel;
          const jour = jourMessage(m.created_at);
          const nouveauJour = i === 0 || jourMessage(messages[i - 1].created_at) !== jour;
          return (
            <div key={m.id}>
              {nouveauJour && (
                <p className="text-center text-[11px] font-semibold text-c2b-muted py-2 first-letter:uppercase">{jour}</p>
              )}
              <div className={`flex ${deMoi ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line ${
                    deMoi ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/10 text-c2b-green"
                  }`}
                >
                  {m.contenu}
                  <span className={`block text-right text-[10px] mt-0.5 ${deMoi ? "text-c2b-cream/60" : "text-c2b-muted"}`}>
                    {heureMessage(m.created_at)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
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

const FUSEAU = "Africa/Casablanca";

function jourMessage(iso: string) {
  const format = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU }).format(d);
  const jour = format(new Date(iso));
  if (jour === format(new Date())) return "aujourd'hui";
  if (jour === format(new Date(Date.now() - 86400000))) return "hier";
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: FUSEAU });
}

function heureMessage(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: FUSEAU });
}
