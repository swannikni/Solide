import "server-only";
import { createClient } from "@supabase/supabase-js";

// Client "service role" : contourne la sécurité RLS, réservé aux routes serveur
// qui ont déjà vérifié que l'appelant est admin. Jamais importé côté navigateur.
export function createAdminClient() {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cle) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, cle, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
