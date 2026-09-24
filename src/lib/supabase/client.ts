import { createBrowserClient } from "@supabase/ssr";

// Pas de schéma Database généré : on reste en typage large côté client
// Supabase, et les types métier (Client, Plat, RepasJournal...) de
// src/lib/types.ts sont appliqués via .returns<T>() / .single<T>() sur
// chaque requête.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
