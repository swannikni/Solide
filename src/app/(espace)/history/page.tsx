import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { totauxDuJour } from "@/lib/macros";
import type { Client, Defi, DemandeRecompense, Points, Poids, Recompense, RepasJournal } from "@/lib/types";
import { Progres } from "@/components/Progres";
import { Motivation } from "@/components/Motivation";
import { RappelSoir } from "@/components/RappelSoir";
import { Recompenses } from "@/components/Recompenses";
import { calculerBadges, meilleureSerie, serieActuelle, totauxParJour } from "@/lib/progres";
import { dateDuJour, decalerDate } from "@/lib/dates";
import { signerPhotos } from "@/lib/photos";
import Image from "next/image";
import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: client } = await supabase.from("application_clients").select("*").eq("id", user.id).single<Client>();
  if (!client) redirect("/login");

  const aujourdhui = dateDuJour();
  const debutSemaine = decalerDate(aujourdhui, -6);

  const [{ data: repas }, { data: lignes }, { data: poids }, { data: pointsBruts }, { data: defisBruts }, { data: catalogue }, { data: demandes }, { data: parametre }] =
    await Promise.all([
    supabase
      .from("application_repas_journal")
      .select("*")
      .eq("client_id", user.id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(300)
      .returns<RepasJournal[]>(),
    // Une année de journal (colonnes minimales) pour la série et les badges.
    supabase
      .from("application_repas_journal")
      .select("date, calories, proteines, quantite")
      .eq("client_id", user.id)
      .gte("date", decalerDate(aujourdhui, -365))
      .lte("date", aujourdhui)
      .order("date", { ascending: false }) // si la limite du serveur coupe, on garde le plus récent
      .limit(5000)
      .returns<Pick<RepasJournal, "date" | "calories" | "proteines" | "quantite">[]>(),
    supabase
      .from("application_poids")
      .select("date, poids_kg")
      .eq("client_id", user.id)
      .gte("date", decalerDate(aujourdhui, -365))
      .order("date", { ascending: true })
      .returns<Pick<Poids, "date" | "poids_kg">[]>(),
    supabase.rpc("application_points"),
    supabase.rpc("application_defis_client"),
    supabase.from("application_recompenses").select("*").eq("actif", true).order("cout").returns<Recompense[]>(),
    supabase
      .from("application_recompenses_demandes")
      .select("*")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<DemandeRecompense[]>(),
    supabase.from("application_parametres").select("valeur").eq("cle", "recompenses_actives").maybeSingle(),
  ]);

  // Fonctions SQL (application_points / application_defis_client) : types déclarés ici.
  const points = pointsBruts as Points | null;
  const defis = defisBruts as Defi[] | null;
  const jours = totauxParJour(lignes ?? []);
  const caloriesSemaine = Array.from({ length: 7 }, (_, i) => {
    const date = decalerDate(debutSemaine, i);
    return { date, calories: Math.round(jours.get(date)?.calories ?? 0) };
  });

  const datesNotees = new Set(jours.keys());
  const serie = serieActuelle(datesNotees, aujourdhui);
  const record = meilleureSerie(datesNotees);

  // Objectif de poids : départ = poids du questionnaire, sinon première pesée.
  const pesees = (poids ?? []).map((p) => Number(p.poids_kg));
  const poidsObjectif = client.poids_objectif != null ? Number(client.poids_objectif) : null;
  const poidsDepart = client.profil?.poids ? Number(client.profil.poids) : (pesees[0] ?? null);
  const poidsActuel = pesees[pesees.length - 1] ?? poidsDepart;
  const sens = poidsObjectif != null && poidsDepart != null && poidsObjectif > poidsDepart ? 1 : -1;
  const kilosVersObjectif =
    poidsDepart != null && poidsActuel != null ? Math.max(0, (poidsActuel - poidsDepart) * sens) : 0;
  const objectifAtteint =
    poidsObjectif != null &&
    poidsDepart != null &&
    poidsActuel != null &&
    pesees.length > 0 &&
    poidsObjectif !== poidsDepart &&
    (poidsActuel - poidsObjectif) * sens >= 0;

  const badges = calculerBadges({
    jours: [...jours.values()],
    record,
    objectifCalories: client.objectif_calories,
    objectifProteines: client.objectif_proteines,
    pesees: pesees.length,
    kilosVersObjectif,
    objectifAtteint,
  });

  const parJour = new Map<string, RepasJournal[]>();
  for (const r of await signerPhotos(supabase, repas ?? [])) {
    if (!parJour.has(r.date)) parJour.set(r.date, []);
    parJour.get(r.date)!.push(r);
  }

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <main className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        <div>
          <span className="lbl mb-2">Votre suivi</span>
          <h1 className="titre text-[34px]">
            Vos <em>progrès</em>
          </h1>
        </div>

        <Motivation
          serie={serie}
          record={record}
          aujourdhui={aujourdhui}
          jours={jours}
          objectifCalories={client.objectif_calories}
          objectifProteines={client.objectif_proteines}
          badges={badges}
        />

        {points && (
          <Recompenses
            points={points}
            defis={defis ?? []}
            catalogue={catalogue ?? []}
            demandes={demandes ?? []}
            aujourdhui={aujourdhui}
            recompensesActives={parametre?.valeur === true}
          />
        )}

        <RappelSoir clientId={client.id} />

        <Progres
          clientId={client.id}
          aujourdhui={aujourdhui}
          poids={poids ?? []}
          caloriesSemaine={caloriesSemaine}
          objectifCalories={client.objectif_calories}
          poidsObjectif={poidsObjectif}
          poidsDepart={poidsDepart}
        />

        <h2 className="font-serif text-[26px] text-c2b-green pt-2">Journal des repas</h2>

        {parJour.size === 0 && (
          <p className="text-sm text-c2b-muted italic text-center py-8">Aucun repas enregistré pour le moment.</p>
        )}

        {[...parJour.entries()].map(([date, repasJour]) => {
          const totaux = totauxDuJour(repasJour);
          return (
            <section key={date} className="carte p-5">
              <div className="flex items-center justify-between mb-3">
                <Link
                  href={date === aujourdhui ? "/dashboard" : `/dashboard?date=${date}`}
                  className="font-serif text-xl text-c2b-green first-letter:uppercase hover:text-c2b-gold"
                >
                  {new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
                </Link>
                <span className="pastille">
                  {Math.round(totaux.calories)} kcal · {Math.round(totaux.proteines)}g P
                </span>
              </div>
              <div className="space-y-2">
                {repasJour.map((r) => (
                  <div key={r.id} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-c2b-cream overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {r.photo_url ? (
                        <Image src={r.photo_url} alt={r.nom} width={40} height={40} className="object-cover w-full h-full" />
                      ) : (
                        <UtensilsCrossed size={16} className="text-c2b-green/30" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-c2b-green truncate">{r.nom}</p>
                      <p className="text-[11px] text-c2b-muted">{Math.round(r.calories * r.quantite)} kcal</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
