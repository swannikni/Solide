import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  LONGUEUR_MAX_QUESTION,
  MESSAGES_HISTORIQUE,
  MODELE_ASSISTANT,
  SYSTEME_ASSISTANT,
  contexteClient,
} from "@/lib/assistant";
import type { Client, RepasJournal } from "@/lib/types";
import { dateDuJour } from "@/lib/dates";
import { rembourserIA, reserverIA } from "@/lib/ia";

export const dynamic = "force-dynamic";

function erreur(message: string, status: number) {
  return NextResponse.json({ erreur: message }, { status });
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return erreur("L'assistant n'est pas encore activé.", 503);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erreur("Connectez-vous pour utiliser l'assistant.", 401);

  const corpsRequete = await request.json().catch(() => null);
  const question = typeof corpsRequete?.message === "string" ? corpsRequete.message.trim() : "";
  if (!question) return erreur("Message vide.", 400);
  if (question.length > LONGUEUR_MAX_QUESTION) return erreur("Message trop long.", 400);

  const aujourdhui = dateDuJour();

  const [{ data: client }, { data: historique }, { data: repas }] = await Promise.all([
    supabase.from("application_clients").select("*").eq("id", user.id).single<Client>(),
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
  // Compteur en base, que le client ne peut pas remettre à zéro (effacer la
  // conversation ne rend pas de questions).
  const reservation = await reserverIA(supabase, "assistant");
  if (!reservation.ok) return erreur(reservation.message, reservation.status);

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
      { type: "text", text: contexteClient(client, repas ?? [], new Date()) },
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
        if (!reponse) await rembourserIA(reservation.id);
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
      "X-Questions-Restantes": String(reservation.restant),
    },
  });
}
