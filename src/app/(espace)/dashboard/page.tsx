import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "@/app/(espace)/dashboard/DashboardClient";
import type { Client, Commande, Favori, Plat, RepasJournal } from "@/lib/types";
import { dateDuJour, decalerDate, estDateValide } from "@/lib/dates";
import { signerPhotos } from "@/lib/photos";

export default async function DashboardPage(props: { searchParams: Promise<{ date?: string; plat?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const aujourdhui = dateDuJour();
  const date = estDateValide(searchParams.date) && searchParams.date <= aujourdhui ? searchParams.date : aujourdhui;

  const [{ data: client }, { data: commandes }, { data: repas }, { data: repasVeille }, { data: favoris }, { data: derniers }] =
    await Promise.all([
    supabase.from("application_clients").select("*").eq("id", user.id).single<Client>(),
    supabase
      .from("application_commandes")
      .select("*, plats:application_plats(*)")
      .eq("client_id", user.id)
      .eq("date_livraison", date)
      .returns<Commande[]>(),
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
        commandesDuJour={commandes ?? []}
        repasDuJour={await signerPhotos(supabase, repas ?? [])}
        repasVeille={repasVeille ?? []}
        favoris={favoris ?? []}
        recents={recents}
        platScanne={platScanne}
        codePlatInconnu={codePlat && !platScanne ? codePlat : null}
      />
    </div>
  );
}
