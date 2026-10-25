import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { entetesCors } from "@/lib/cors-site";

// Fréquentation de chef2box.com (Admin → Site). Route publique appelée par le
// site (sendBeacon, texte JSON) : visite, clic WhatsApp, questionnaire.
// Rien de personnel n'est gardé : ni IP, ni identifiant, juste la source.

export const dynamic = "force-dynamic";

const TYPES = ["visite", "whatsapp", "questionnaire_debut", "questionnaire_fin"];
const ROBOT = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|monitor/i;

// D'où vient le visiteur : paramètre utm_source du lien, sinon le site d'origine.
function classerSource(ref: string, utm: string): string {
  const s = `${utm} ${ref}`.toLowerCase().trim();
  if (!s) return "Direct";
  if (/instagram|\big\b/.test(s)) return "Instagram";
  if (/facebook|\bfb\b|fb\.com|messenger/.test(s)) return "Facebook";
  if (/tiktok/.test(s)) return "TikTok";
  if (/whatsapp|wa\.me/.test(s)) return "WhatsApp";
  if (/snapchat/.test(s)) return "Snapchat";
  if (/google/.test(s)) return "Google";
  if (/bing|duckduckgo|yahoo|ecosia|qwant|yandex/.test(s)) return "Autres moteurs";
  if (/chef2box-appli/.test(s)) return "Appli Chef2Box";
  return "Autre site";
}

const texte = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: entetesCors(request.headers.get("origin")) });
}

export async function POST(request: Request) {
  const cors = entetesCors(request.headers.get("origin"));
  const fin = () => new NextResponse(null, { status: 204, headers: cors });

  if (ROBOT.test(request.headers.get("user-agent") ?? "")) return fin();
  const brut = await request.text().catch(() => "");
  if (!brut || brut.length > 2000) return fin();
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(brut);
  } catch {
    return fin();
  }
  const type = texte(d.type, 30);
  if (!TYPES.includes(type)) return fin();

  const admin = createAdminClient();
  if (!admin) return fin();
  await admin.rpc("application_site_noter", {
    p_type: type,
    p_detail: texte(d.detail, 60) || null,
    p_source: classerSource(texte(d.ref, 100), texte(d.utm, 40)),
    p_appareil: d.appareil === "mobile" || d.appareil === "ordinateur" ? d.appareil : null,
  });
  return fin();
}
