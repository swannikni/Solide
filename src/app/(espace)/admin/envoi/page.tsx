import { exigerAdmin } from "@/lib/admin";
import { EnvoiClient, type Destinataire } from "@/app/(espace)/admin/envoi/EnvoiClient";
import { dateDuJour, decalerDate } from "@/lib/dates";
import { lundiDe } from "@/lib/ma-semaine";
import type { Palier } from "@/lib/types";

export const dynamic = "force-dynamic";

type Service = "dejeuner" | "diner";

// Numéro WhatsApp en chiffres internationaux (06… → 2126…), ou null.
function numero(t: string | null) {
  if (!t) return null;
  const n = t.replace(/[^\d]/g, "").replace(/^00/, "").replace(/^0(?=[5-7])/, "212");
  return n.length >= 9 && n.length <= 15 ? n : null;
}

// Envoi du menu de la semaine, avec le lien personnel de chacun : clients
// (fiches avec un numéro) et prospects (questionnaire fait + numéro).
export default async function EnvoiPage() {
  const { supabase } = await exigerAdmin();
  const aujourdhui = dateDuJour();
  // Le week-end (et le lundi), la semaine qui commence ; sinon la suivante.
  const lundi = lundiDe(decalerDate(aujourdhui, 2));
  const semaines = [lundi, decalerDate(lundi, 7)];

  const [{ data: fiches }, { data: repas }, { data: questionnaires }, { data: services }, { data: images }, { data: envois }] = await Promise.all([
    supabase
      .from("application_personnes")
      .select("id, nom, telephone, jeton, partenaire, vu_le, envoi_pause")
      .limit(3000)
      .returns<
        {
          id: string;
          nom: string;
          telephone: string | null;
          jeton: string | null;
          partenaire: boolean | null;
          vu_le: string | null;
          envoi_pause: boolean | null;
        }[]
      >(),
    supabase.from("application_cuisine_extras").select("nom").limit(20000).returns<{ nom: string }[]>(),
    supabase
      .from("application_questionnaires")
      .select("id, nom, telephone, palier, statut, suivi, calories")
      .neq("statut", "ignore")
      .not("telephone", "is", null)
      .not("calories", "is", null)
      .order("created_at", { ascending: false })
      .limit(3000)
      .returns<{ id: string; nom: string; telephone: string | null; palier: Palier | null; statut: string; suivi: string | null }[]>(),
    supabase
      .from("application_cuisine_services")
      .select("date, repas_type, plat")
      .gte("date", semaines[0])
      .lte("date", decalerDate(semaines[1], 4))
      .returns<{ date: string; repas_type: Service; plat: string | null }[]>(),
    supabase
      .from("application_parametres")
      .select("cle")
      .in("cle", semaines.map((l) => `menu_image:${l}`))
      .returns<{ cle: string }[]>(),
    supabase
      .from("application_envois")
      .select("personne_id, semaine, envoye_le")
      .limit(50000)
      .returns<{ personne_id: string; semaine: string; envoye_le: string }[]>(),
  ]);
  const nbEnvois = new Map<string, number>();
  const dernierEnvoi = new Map<string, string>();
  for (const e of envois ?? []) {
    nbEnvois.set(e.personne_id, (nbEnvois.get(e.personne_id) ?? 0) + 1);
    if ((dernierEnvoi.get(e.personne_id) ?? "") < e.envoye_le) dernierEnvoi.set(e.personne_id, e.envoye_le);
  }
  const envoyes: Record<string, string[]> = Object.fromEntries(
    semaines.map((l) => [l, (envois ?? []).filter((e) => e.semaine === l).map((e) => `f:${e.personne_id}`)])
  );

  const dejaVenus = new Set((repas ?? []).map((r) => r.nom.trim().toLowerCase()));
  const destinataires: Destinataire[] = [];
  const numerosVus = new Set<string>();
  for (const f of fiches ?? []) {
    const n = numero(f.telephone);
    if (!n || f.partenaire || numerosVus.has(n)) continue;
    numerosVus.add(n);
    destinataires.push({
      cle: `f:${f.id}`,
      nom: f.nom.trim(),
      numero: n,
      type: dejaVenus.has(f.nom.trim().toLowerCase()) ? "client" : "prospect",
      ficheId: f.id,
      jeton: f.jeton,
      envois: nbEnvois.get(f.id) ?? 0,
      dernierEnvoi: dernierEnvoi.get(f.id) ?? null,
      vuLe: f.vu_le,
      pause: !!f.envoi_pause,
    });
  }
  const nomsFiches = new Set((fiches ?? []).map((f) => f.nom.trim().toLowerCase()));
  for (const q of questionnaires ?? []) {
    const n = numero(q.telephone);
    if (!n || q.suivi === "pas_interesse" || numerosVus.has(n)) continue;
    numerosVus.add(n);
    // Déjà une fiche à ce nom (sans numéro) : c'est la même personne, on garde sa fiche.
    const fiche = (fiches ?? []).find((f) => f.nom.trim().toLowerCase() === q.nom.trim().toLowerCase() && !numero(f.telephone));
    if (fiche) {
      destinataires.push({
        cle: `f:${fiche.id}`,
        nom: fiche.nom.trim(),
        numero: n,
        type: dejaVenus.has(fiche.nom.trim().toLowerCase()) ? "client" : "prospect",
        ficheId: fiche.id,
        jeton: fiche.jeton,
        envois: nbEnvois.get(fiche.id) ?? 0,
        dernierEnvoi: dernierEnvoi.get(fiche.id) ?? null,
        vuLe: fiche.vu_le,
        pause: !!fiche.envoi_pause,
        numeroAEnregistrer: true,
      });
      continue;
    }
    destinataires.push({
      cle: `q:${q.id}`,
      nom: q.nom.trim(),
      numero: n,
      type: "prospect",
      ficheId: null,
      jeton: null,
      envois: 0,
      dernierEnvoi: null,
      vuLe: null,
      pause: false,
      palier: q.palier,
      // Même nom qu'une fiche existante (autre numéro) : fiche créée sous « Nom (questionnaire) ».
      homonyme: nomsFiches.has(q.nom.trim().toLowerCase()),
    });
  }
  destinataires.sort((a, b) => (a.type === b.type ? a.nom.localeCompare(b.nom, "fr") : a.type === "client" ? -1 : 1));

  const menus: Record<string, Record<string, { dejeuner: string; diner: string }>> = {};
  for (const s of services ?? []) {
    const l = lundiDe(s.date);
    ((menus[l] ??= {})[s.date] ??= { dejeuner: "", diner: "" })[s.repas_type] = (s.plat ?? "").trim();
  }

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <EnvoiClient
        semaines={semaines}
        menus={menus}
        destinatairesInitiaux={destinataires}
        imagesInitiales={(images ?? []).map((i) => i.cle.replace("menu_image:", ""))}
        envoyesInitiaux={envoyes}
      />
    </div>
  );
}
