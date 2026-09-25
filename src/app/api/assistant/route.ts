import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  LONGUEUR_MAX_QUESTION,
  MESSAGES_HISTORIQUE,
  MODELE_ASSISTANT,
  QUESTIONS_PAR_JOUR,
  SYSTEME_ASSISTANT,
  contexteClient,
} from "@/lib/assistant";
import type { Client, RepasJournal } from "@/lib/types";

export const dynamic = "force-dynamic";

function erreur(message: string, status: number) {
  return NextResponse.json({ erreur: message }, { status });
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return erreur("L'assistant n'est pas encore activé.", 503);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erreur("Connectez-vous pour utiliser l'assistant.", 401);

  const corpsRequete = await request.json().catch(() => null);
  const question = typeof corpsRequete?.message === "string" ? corpsRequete.message.trim() : "";
  if (!question) return erreur("Message vide.", 400);
  if (question.length > LONGUEUR_MAX_QUESTION) return erreur("Message trop long.", 400);

  const maintenant = new Date();
  const aujourdhui = maintenant.toISOString().slice(0, 10);

  const [{ data: client }, { count }, { data: historique }, { data: repas }] = await Promise.all([
    supabase.from("application_clients").select("*").eq("id", user.id).single<Client>(),
    supabase
      .from("application_assistant_messages")
      .select("id", { count: "exact", head: true })
      .eq("client_id", user.id)
      .eq("role", "user")
      .gte("created_at", `${aujourdhui}T00:00:00Z`),
    supabase
      .from("application_assistant_messages")
      .select("role, contenu")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MESSAGES_HISTORIQUE)
      .returns<{ role: "user" | "assistant"; contenu: string }[]>(),
    supabase
      .from("application_repas_journal")
      .select("*")
      .eq("client_id", user.id)
      .eq("date", aujourdhui)
      .order("created_at", { ascending: true })
      .returns<RepasJournal[]>(),
  ]);

  if (!client) return erreur("Profil introuvable.", 403);
  const questionsPosees = count ?? 0;
  if (questionsPosees >= QUESTIONS_PAR_JOUR) {
    return erreur(`Vous avez atteint la limite de ${QUESTIONS_PAR_JOUR} questions pour aujourd'hui. À demain !`, 429);
  }

  await supabase
    .from("application_assistant_messages")
    .insert({ client_id: user.id, role: "user", contenu: question });

  const precedents = (historique ?? []).reverse().map((m) => ({ role: m.role, content: m.contenu }));
  // L'API exige que la conversation commence par un message utilisateur.
  while (precedents.length && precedents[0].role !== "user") precedents.shift();
  const messages: Anthropic.MessageParam[] = [...precedents, { role: "user", content: question }];

  const anthropic = new Anthropic();
  const flux = anthropic.messages.stream({
    model: MODELE_ASSISTANT,
    max_tokens: 2048,
    system: [
      { type: "text", text: SYSTEME_ASSISTANT },
      { type: "text", text: contexteClient(client, repas ?? [], maintenant) },
    ],
    messages,
  });

  const encodeur = new TextEncoder();
  const corps = new ReadableStream<Uint8Array>({
    async start(controleur) {
      let reponse = "";
      const envoyer = (texte: string) => {
        reponse += texte;
        controleur.enqueue(encodeur.encode(texte));
      };
      flux.on("text", envoyer);

      try {
        const final = await flux.finalMessage();
        if (final.stop_reason === "refusal") {
          envoyer(
            (reponse ? "\n\n" : "") +
              "Je ne peux pas vous aider sur ce point. Pour toute question de santé, parlez-en à un professionnel."
          );
        } else if (final.stop_reason === "max_tokens") {
          envoyer("\n\n(Réponse coupée : demandez-moi « la suite ».)");
        }
      } catch (e) {
        console.error("Assistant :", e);
        envoyer(
          reponse
            ? "\n\n(Réponse interrompue, réessayez.)"
            : "Désolé, l'assistant est indisponible pour le moment. Réessayez dans un instant."
        );
      }

      if (reponse.trim()) {
        await supabase
          .from("application_assistant_messages")
          .insert({ client_id: user.id, role: "assistant", contenu: reponse.slice(0, 20000) });
      }
      controleur.close();
    },
    cancel() {
      flux.abort();
    },
  });

  return new Response(corps, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Questions-Restantes": String(QUESTIONS_PAR_JOUR - questionsPosees - 1),
    },
  });
}
