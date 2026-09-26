"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Send, ChefHat } from "lucide-react";

interface MessageChat {
  id: string;
  role: "user" | "assistant";
  contenu: string;
}

const SUGGESTIONS = [
  "Une recette avec du poulet, du riz et des courgettes",
  "Que manger ce soir pour finir mes protéines ?",
  "Fais-moi une liste de courses healthy pour la semaine",
  "Quoi manger avant et après ma séance de muscu ?",
];

// Mise en forme légère des réponses (gras, titres, listes) sans injecter de HTML.
export function TexteFormate({ texte }: { texte: string }) {
  const enGras = (ligne: string) =>
    ligne.split(/(\*\*[^*]+\*\*)/g).map((morceau, i) =>
      morceau.startsWith("**") && morceau.endsWith("**") ? (
        <strong key={i} className="font-bold text-c2b-green">
          {morceau.slice(2, -2)}
        </strong>
      ) : (
        <Fragment key={i}>{morceau}</Fragment>
      )
    );

  return (
    <div className="space-y-1.5">
      {texte.split("\n").map((ligne, i) => {
        const brute = ligne.trim();
        if (!brute) return <div key={i} className="h-1" />;
        const titre = brute.match(/^#{1,4}\s+(.*)$/);
        if (titre) {
          return (
            <p key={i} className="font-bold tracking-tight text-lg text-c2b-green pt-1">
              {enGras(titre[1])}
            </p>
          );
        }
        const puce = brute.match(/^[-•*]\s+(.*)$/);
        if (puce) {
          return (
            <p key={i} className="flex gap-2">
              <span className="text-c2b-gold font-bold">•</span>
              <span>{enGras(puce[1])}</span>
            </p>
          );
        }
        const numero = brute.match(/^(\d+)[.)]\s+(.*)$/);
        if (numero) {
          return (
            <p key={i} className="flex gap-2">
              <span className="text-c2b-gold font-bold">{numero[1]}.</span>
              <span>{enGras(numero[2])}</span>
            </p>
          );
        }
        return <p key={i}>{enGras(brute)}</p>;
      })}
    </div>
  );
}

export function AssistantChat({ prenom, messagesInitiaux }: { prenom: string; messagesInitiaux: MessageChat[] }) {
  const [messages, setMessages] = useState<MessageChat[]>(messagesInitiaux);
  const [texte, setTexte] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [restantes, setRestantes] = useState<number | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function envoyer(question: string) {
    const q = question.trim();
    if (!q || enCours) return;
    setErreur(null);
    setTexte("");
    setEnCours(true);
    const idReponse = `r-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `q-${Date.now()}`, role: "user", contenu: q },
      { id: idReponse, role: "assistant", contenu: "" },
    ]);

    const ecrire = (ajout: string) =>
      setMessages((prev) => prev.map((m) => (m.id === idReponse ? { ...m, contenu: m.contenu + ajout } : m)));

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setMessages((prev) => prev.filter((m) => m.id !== idReponse));
        setErreur(data?.erreur ?? "L'assistant ne répond pas, réessayez.");
        return;
      }
      const reste = res.headers.get("X-Questions-Restantes");
      if (reste !== null) setRestantes(Number(reste));

      const lecteur = res.body.getReader();
      const decodeur = new TextDecoder();
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        ecrire(decodeur.decode(value, { stream: true }));
      }
    } catch {
      ecrire("\n\n(Connexion perdue, réessayez.)");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto flex flex-col h-[calc(100dvh-68px-76px)] md:h-[calc(100dvh-80px)]">
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-4 space-y-4">
        <header>
          <span className="lbl mb-2">Assistant Chef2Box</span>
          <h1 className="titre text-[34px]">
            Votre coach <em>nutrition</em>
          </h1>
          <p className="text-sm text-c2b-muted mt-2">
            Recettes, courses, nutrition, entraînement : posez vos questions, {prenom}. Il connaît vos objectifs et ce
            que vous avez mangé aujourd&apos;hui.
          </p>
        </header>

        {messages.length === 0 && (
          <div className="grid gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => envoyer(s)}
                className="carte flex items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-c2b-green transition hover:border-c2b-gold/40"
              >
                <ChefHat size={16} className="text-c2b-gold flex-shrink-0" />
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-[20px] rounded-br-md bg-c2b-green px-4 py-2.5 text-[15px] text-white whitespace-pre-wrap">
                {m.contenu}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-start">
              <div className="carte max-w-[92%] rounded-bl-md px-4 py-3 text-[15px] leading-relaxed text-c2b-text">
                {m.contenu ? (
                  <TexteFormate texte={m.contenu} />
                ) : (
                  <span className="inline-flex gap-1 py-1" aria-label="L'assistant écrit">
                    <span className="h-2 w-2 rounded-full bg-c2b-gold animate-bounce" />
                    <span className="h-2 w-2 rounded-full bg-c2b-gold animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-c2b-gold animate-bounce [animation-delay:300ms]" />
                  </span>
                )}
              </div>
            </div>
          )
        )}

        {erreur && <p className="text-sm text-center text-red-700">{erreur}</p>}
        <div ref={finRef} />
      </div>

      <div className="border-t border-black/5 bg-c2b-cream px-3 pt-3 pb-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            envoyer(texte);
          }}
          className="flex gap-2"
        >
          <input
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            maxLength={1500}
            placeholder="Posez votre question..."
            className="champ flex-1 rounded-full px-5"
          />
          <button
            type="submit"
            disabled={enCours || !texte.trim()}
            aria-label="Envoyer"
            className="w-12 h-12 rounded-full bg-c2b-green hover:bg-c2b-green-mid text-white flex items-center justify-center flex-shrink-0 transition disabled:opacity-40"
          >
            <Send size={17} />
          </button>
        </form>
        <p className="mt-2 text-center text-[11px] text-c2b-muted">
          {restantes !== null ? `${restantes} question${restantes > 1 ? "s" : ""} restante${restantes > 1 ? "s" : ""} aujourd'hui · ` : ""}
          Conseils indicatifs, ne remplacent pas un avis médical.
        </p>
      </div>
    </main>
  );
}
