// Notifications Chef2Box (Supabase Edge Function « rappels »).
//
// - type "soir"  : 20 h, clients abonnés qui n'ont rien noté aujourd'hui.
// - type "bilan" : lundi matin, « votre bilan de la semaine est prêt ».
//   Ces deux-là sont lancés par pg_cron avec l'en-tête x-cron-secret.
// - type "test"  : le client connecté s'envoie une notification d'essai.
//
// Les clés VAPID et le secret des tâches sont dans le coffre (Vault).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reponse = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function dateCasablanca(decalageJours = 0) {
  const d = new Date(Date.now() + decalageJours * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(d);
}

function egal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return reponse({ erreur: "méthode" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const secret = async (nom: string) => (await admin.rpc("application_secret", { p_nom: nom })).data as string | null;

  const { type } = (await req.json().catch(() => ({}))) as { type?: string };

  // Qui a le droit d'appeler : la tâche planifiée (secret) ou, pour le test, un client connecté.
  let clientTest: string | null = null;
  if (type === "test") {
    const jeton = req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "";
    const { data } = await admin.auth.getUser(jeton);
    if (!data.user) return reponse({ erreur: "non connecté" }, 401);
    clientTest = data.user.id;
  } else if (type === "soir" || type === "bilan") {
    const attendu = await secret("rappel_cron_secret");
    if (!attendu || !egal(req.headers.get("x-cron-secret") ?? "", attendu)) return reponse({ erreur: "refusé" }, 403);
  } else {
    return reponse({ erreur: "type inconnu" }, 400);
  }

  const [publique, privee] = await Promise.all([secret("vapid_public"), secret("vapid_prive")]);
  if (!publique || !privee) return reponse({ erreur: "clés absentes" }, 500);
  webpush.setVapidDetails("mailto:hello@chef2box.com", publique, privee);

  let requete = admin.from("application_push_abonnements").select("id, client_id, endpoint, p256dh, auth");
  if (clientTest) requete = requete.eq("client_id", clientTest);
  const { data: abonnements } = await requete;
  if (!abonnements?.length) return reponse({ envoyes: 0 });

  const aujourdhui = dateCasablanca();
  const messages = new Map<string, { title: string; body: string; url: string }>();
  const clients = [...new Set(abonnements.map((a) => a.client_id))];

  if (type === "soir") {
    // Dates notées sur 60 jours : qui n'a rien noté aujourd'hui, et sa série en jeu.
    const { data: lignes } = await admin
      .from("application_repas_journal")
      .select("client_id, date")
      .in("client_id", clients)
      .gte("date", dateCasablanca(-60));
    const datesParClient = new Map<string, Set<string>>();
    for (const l of lignes ?? []) {
      if (!datesParClient.has(l.client_id)) datesParClient.set(l.client_id, new Set());
      datesParClient.get(l.client_id)!.add(l.date);
    }
    for (const id of clients) {
      const dates = datesParClient.get(id) ?? new Set<string>();
      if (dates.has(aujourdhui)) continue;
      let serie = 0;
      while (dates.has(dateCasablanca(-1 - serie))) serie++;
      messages.set(id, {
        title: serie > 0 ? `🔥 Série de ${serie} jour${serie > 1 ? "s" : ""} en jeu` : "Chef2Box",
        body:
          serie > 0
            ? "Rien de noté aujourd'hui : votre série s'arrête ce soir. Une minute suffit !"
            : "Vous n'avez rien noté aujourd'hui. Notez vos repas en une minute 🍽️",
        url: "/dashboard",
      });
    }
  } else {
    for (const id of clients) {
      messages.set(
        id,
        type === "bilan"
          ? { title: "📊 Votre bilan de la semaine", body: "Vos résultats de la semaine sont prêts. Venez voir !", url: "/dashboard" }
          : { title: "Chef2Box", body: "Les notifications fonctionnent ✓ Rappel chaque soir à 20 h.", url: "/dashboard" }
      );
    }
  }

  let envoyes = 0;
  const perimes: string[] = [];
  await Promise.all(
    abonnements
      .filter((a) => messages.has(a.client_id))
      .map(async (a) => {
        try {
          await webpush.sendNotification(
            { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
            JSON.stringify(messages.get(a.client_id)),
            { TTL: 4 * 3600, urgency: "normal" }
          );
          envoyes++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) perimes.push(a.id); // abonnement supprimé sur le téléphone
          else console.error("envoi", code, (e as Error).message);
        }
      })
  );
  if (perimes.length) await admin.from("application_push_abonnements").delete().in("id", perimes);

  return reponse({ envoyes, perimes: perimes.length });
});
