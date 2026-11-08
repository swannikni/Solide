import { createAdminClient } from "@/lib/supabase/admin";
import { estDateValide } from "@/lib/dates";

// Image du menu d'une semaine (déposée dans Admin → Envoi menu), publique :
// aperçu du lien perso dans WhatsApp et page « Mon espace ».
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ lundi: string }> }) {
  const { lundi } = await params;
  const admin = createAdminClient();
  if (!admin || !estDateValide(lundi)) return new Response("Introuvable", { status: 404 });
  const { data } = await admin
    .from("application_parametres")
    .select("valeur")
    .eq("cle", `menu_image:${lundi}`)
    .maybeSingle<{ valeur: { data?: string } }>();
  const m = data?.valeur?.data?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return new Response("Introuvable", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
