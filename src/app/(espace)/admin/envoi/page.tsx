import { exigerAdmin } from "@/lib/admin";
import { EnvoiClient, type Destinataire } from "@/app/(espace)/admin/envoi/EnvoiClient";
import { dateDuJour, decalerDate } from "@/lib/dates";
import { lundiDe } from "@/lib/ma-semaine";
import type { Palier } from "@/lib/types";
import { toutLire } from "@/lib/tout-lire";

export const dynamic = "force-dynamic";

type Service = "dejeuner" | "diner";

// Réponse libre du questionnaire, sans les « — » / « rien » qui ne disent rien.
function utile(v: unknown, max: number) {
  const t = typeof v === "string" ? v.trim() : "";
  return t && !/^(—|-|rien|aucune?|non|ras|néant)$/i.test(t) ? t.slice(0, max) : null;
}

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
    toutLire(() =>
      supabase.from("application_cuisine_extras").select("nom, telephone, date").order("id").returns<{ nom: string; telephone: string | null; date: string }[]>()
    ),
    supabase
      .from("application_questionnaires")
      .select("id, nom, telephone, palier, statut, suivi, calories, reponses")
      .neq("statut", "ignore")
      .not("telephone", "is", null)
      .not("calories", "is", null)
      .order("created_at", { ascending: false })
      .limit(3000)
      .returns<
        {
          id: string;
          nom: string;
          telephone: string | null;
          palier: Palier | null;
          calories: number | null;
          statut: string;
          suivi: string | null;
          reponses: Record<string, string | number | null> | null;
        }[]
      >(),
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
    toutLire(() =>
      supabase
        .from("application_envois")
        .select("personne_id, semaine, envoye_le")
        .order("personne_id")
        .order("semaine")
        .returns<{ personne_id: string; semaine: string; envoye_le: string }[]>()
    ),
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
  // Ancien client reconnu aussi par son numéro : repas à ce numéro, fiche à ce
  // numéro qui a déjà mangé, ou questionnaire passé « client ».
  const fin9 = (t: string | null) => numero(t)?.slice(-9) ?? null;
  const numerosClients = new Set<string>();
  for (const r of repas ?? []) {
    const n = fin9(r.telephone);
    if (n) numerosClients.add(n);
  }
  for (const f of fiches ?? []) {
    const n = fin9(f.telephone);
    if (n && dejaVenus.has(f.nom.trim().toLowerCase())) numerosClients.add(n);
  }
  const questionnairesParNumero = new Map<string, string[]>();
  for (const q of questionnaires ?? []) {
    const n = fin9(q.telephone);
    if (!n) continue;
    if (q.suivi === "client" || q.statut === "compte_cree") numerosClients.add(n);
    questionnairesParNumero.set(n, [...(questionnairesParNumero.get(n) ?? []), q.id]);
  }
  const estClient = (nom: string, n: string) => dejaVenus.has(nom.trim().toLowerCase()) || numerosClients.has(n.slice(-9));
  // Prénom d'un ancien client enregistré sans numéro (ex. « Aziz ») : sans doute
  // la même personne, à confirmer d'un clic.
  const anciensSansNumero = new Map<string, string>();
  for (const f of fiches ?? []) {
    const nom = f.nom.trim();
    if (!numero(f.telephone) && !f.partenaire && dejaVenus.has(nom.toLowerCase())) anciensSansNumero.set(nom.split(/\s+/)[0].toLowerCase(), nom);
  }
  // Aperçu du bilan pour le message des prospects : dernier questionnaire par numéro.
  const bilanParNumero = new Map<string, { calories: number; palier: Palier | null }>();
  for (const q of questionnaires ?? []) {
    const n = numero(q.telephone);
    if (n && !bilanParNumero.has(n.slice(-9)) && q.calories) bilanParNumero.set(n.slice(-9), { calories: q.calories, palier: q.palier });
  }
  const destinataires: Destinataire[] = [];
  const numerosVus = new Set<string>();
  // Fiches « Nom 2 » (ex. Mehdi 2, repas du samedi commandés le vendredi) :
  // même personne, pas de message en plus. Un couple sur un même numéro : un
  // seul message, avec le lien de chacun.
  const estDoublure = (nom: string) => /\s\d+$/.test(nom.trim());
  const fichesTriees = [...(fiches ?? [])].sort((a, b) => Number(estDoublure(a.nom)) - Number(estDoublure(b.nom)));
  for (const f of fichesTriees) {
    const n = numero(f.telephone);
    if (!n || f.partenaire) continue;
    if (numerosVus.has(n)) {
      const principal = destinataires.find((x) => x.numero === n && x.ficheId);
      if (principal && !estDoublure(f.nom) && f.jeton) (principal.autres ??= []).push({ nom: f.nom.trim(), jeton: f.jeton });
      continue;
    }
    numerosVus.add(n);
    destinataires.push({
      cle: `f:${f.id}`,
      nom: f.nom.trim(),
      numero: n,
      type: estClient(f.nom, n) ? "client" : "prospect",
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
        type: estClient(fiche.nom, n) ? "client" : "prospect",
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
      type: numerosClients.has(n.slice(-9)) ? "client" : "prospect",
      ficheId: null,
      jeton: null,
      envois: 0,
      dernierEnvoi: null,
      vuLe: null,
      pause: false,
      palier: q.palier,
      // Repris sur sa fiche à la création du lien (la cuisine en a besoin s'il commande).
      allergies: utile(q.reponses?.allergies, 300),
      refus: utile(q.reponses?.refuses, 300),
      note: utile(q.reponses?.preferes, 190) ? `Aime : ${utile(q.reponses?.preferes, 190)}` : null,
      // Même nom qu'une fiche existante (autre numéro) : fiche créée sous « Nom (questionnaire) ».
      homonyme: nomsFiches.has(q.nom.trim().toLowerCase()),
    });
  }
  // Clients qui mangent cette semaine (le week-end : la semaine qui vient de finir).
  const lundiCourant = lundiDe(aujourdhui);
  const finCourante = decalerDate(lundiCourant, 4);
  const repasCourants = (repas ?? []).filter((r) => r.date >= lundiCourant && r.date <= finCourante);
  const nomsCourants = new Set(repasCourants.map((r) => r.nom.trim().toLowerCase()));
  const numerosCourants = new Set(repasCourants.map((r) => fin9(r.telephone)).filter(Boolean));
  for (const d of destinataires) {
    d.cetteSemaine = nomsCourants.has(d.nom.trim().toLowerCase()) || numerosCourants.has(d.numero.slice(-9));
    d.bilan = bilanParNumero.get(d.numero.slice(-9)) ?? null;
    d.questionnaires = questionnairesParNumero.get(d.numero.slice(-9)) ?? [];
    if (d.type === "prospect") {
      const ancien = anciensSansNumero.get(d.nom.split(/\s+/)[0].toLowerCase());
      if (ancien && ancien.toLowerCase() !== d.nom.toLowerCase()) d.ancienClient = ancien;
    }
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
