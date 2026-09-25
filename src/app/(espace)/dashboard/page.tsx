import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "@/app/(espace)/dashboard/DashboardClient";
import type { Client, Defi, Favori, Plat, Points, RepasJournal } from "@/lib/types";
import { dateDuJour, decalerDate, estDateValide } from "@/lib/dates";
import { signerPhotos } from "@/lib/photos";
import { bilanSemaine, semaineAResumer, serieActuelle, totauxParJour } from "@/lib/progres";

export default async function DashboardPage(props: { searchParams: Promise<{ date?: string; plat?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const aujourdhui = dateDuJour();
  const date = estDateValide(searchParams.date) && searchParams.date <= aujourdhui ? searchParams.date : aujourdhui;

  const [{ data: client }, { data: repas }, { data: repasVeille }, { data: favoris }, { data: derniers }, { data: journalRecent }, { data: pesees }, { data: pointsBruts }, { data: defisBruts }, { data: parametre }] =
    await Promise.all([
    supabase.from("application_clients").select("*").eq("id", user.id).single<Client>(),
    supabase
      .from("application_repas_journal")
      .select("*")
      .eq("client_id", user.id)
      .eq("date", date)
      .order("created_at", { ascending: true })
      .returns<RepasJournal[]>(),
    supabase
      .from("application_repas_journal")
      .select("*")
      .eq("client_id", user.id)
      .eq("date", decalerDate(date, -1))
      .order("created_at", { ascending: true })
      .returns<RepasJournal[]>(),
    supabase
      .from("application_favoris")
      .select("*")
      .eq("client_id", user.id)
      .order("nom")
      .returns<Favori[]>(),
    supabase
      .from("application_repas_journal")
      .select("*")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false })
      .limit(80)
      .returns<RepasJournal[]>(),
    // 90 jours de journal (colonnes minimales) : série et bilan de la semaine.
    supabase
      .from("application_repas_journal")
      .select("date, calories, proteines, quantite")
      .eq("client_id", user.id)
      .gte("date", decalerDate(aujourdhui, -90))
      .order("date", { ascending: false })
      .returns<{ date: string; calories: number; proteines: number; quantite: number }[]>(),
    supabase
      .from("application_poids")
      .select("date, poids_kg")
      .eq("client_id", user.id)
      .gte("date", decalerDate(aujourdhui, -45))
      .order("date", { ascending: true })
      .returns<{ date: string; poids_kg: number }[]>(),
    supabase.rpc("application_points"),
    supabase.rpc("application_defis_client"),
    supabase.from("application_parametres").select("valeur").eq("cle", "recompenses_actives").maybeSingle(),
  ]);

  // Récents : derniers aliments distincts (par nom), hors box Chef2Box du jour.
  const nomsVus = new Set<string>();
  const recents: RepasJournal[] = [];
  for (const r of derniers ?? []) {
    const cle = r.nom.toLowerCase();
    if (nomsVus.has(cle)) continue;
    nomsVus.add(cle);
    recents.push(r);
    if (recents.length >= 12) break;
  }

  if (!client) redirect("/login");
  // Fonctions SQL (application_points / application_defis_client) : types déclarés ici.
  const points = pointsBruts as Points | null;
  const defis = defisBruts as Defi[] | null;

  const jours = totauxParJour(journalRecent ?? []);
  const semaine = date === aujourdhui ? semaineAResumer(aujourdhui) : null;
  const statsSemaine = semaine
    ? bilanSemaine(
        semaine,
        jours,
        (pesees ?? []).map((p) => ({ date: p.date, poids_kg: Number(p.poids_kg) })),
        client.objectif_calories,
        client.objectif_proteines
      )
    : null;

  // Arrivée par le QR d'une étiquette (/p/<code>).
  const codePlat = searchParams.plat?.slice(0, 64);
  const { data: platScanne } = codePlat
    ? await supabase.from("application_plats").select("*").eq("qr_code", codePlat).eq("actif", true).maybeSingle<Plat>()
    : { data: null };

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <DashboardClient
        key={date}
        client={client}
        date={date}
        aujourdhui={aujourdhui}
        repasDuJour={await signerPhotos(supabase, repas ?? [])}
        repasVeille={repasVeille ?? []}
        favoris={favoris ?? []}
        recents={recents}
        serie={serieActuelle(new Set(jours.keys()), aujourdhui)}
        statsSemaine={statsSemaine}
        points={parametre?.valeur === true ? (points?.solde ?? null) : null}
        defiEnCours={(defis ?? []).find((d) => d.date_debut <= aujourdhui && d.date_fin >= aujourdhui) ?? null}
        platScanne={platScanne}
        codePlatInconnu={codePlat && !platScanne ? codePlat : null}
      />
    </div>
  );
}
