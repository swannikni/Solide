"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Copy, Flame, Plus, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ResumeJour } from "@/components/ResumeJour";
import { DetailNutrition, type Nutriment } from "@/components/DetailNutrition";
import { MealCard } from "@/components/MealCard";
import { AddMealModal } from "@/components/AddMealModal";
import { EditMealModal } from "@/components/EditMealModal";
import { InstallerAppli } from "@/components/InstallerAppli";
import { RappelSoir } from "@/components/RappelSoir";
import { BilanSemaine, type StatsSemaine } from "@/components/BilanSemaine";
import { ORDRE_REPAS, REPAS_TYPE_LABELS, repasSelonHeure, totauxDuJour } from "@/lib/macros";
import { decalerDate, libelleDate } from "@/lib/dates";
import type { Client, Defi, Favori, Plat, RepasJournal, RepasType } from "@/lib/types";

function lienJour(date: string, aujourdhui: string) {
  return date === aujourdhui ? "/dashboard" : `/dashboard?date=${date}`;
}

export function DashboardClient({
  client,
  date,
  aujourdhui,
  repasDuJour,
  repasVeille,
  favoris,
  recents,
  serie,
  statsSemaine,
  assistantActif,
  points,
  defiEnCours,
  platScanne,
  codePlatInconnu,
}: {
  client: Client;
  date: string;
  aujourdhui: string;
  repasDuJour: RepasJournal[];
  repasVeille: RepasJournal[];
  favoris: Favori[];
  recents: RepasJournal[];
  serie: number;
  statsSemaine: StatsSemaine | null;
  assistantActif: boolean;
  points: number | null;
  defiEnCours: Defi | null;
  platScanne: Plat | null;
  codePlatInconnu: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [modalOuverte, setModalOuverte] = useState(false);
  const [repasCible, setRepasCible] = useState<RepasType>("dejeuner");
  const [repasEnEdition, setRepasEnEdition] = useState<RepasJournal | null>(null);
  const [copieEnCours, setCopieEnCours] = useState<RepasType | null>(null);
  const [platPrerempli, setPlatPrerempli] = useState<Plat | null>(null);
  const [alerteQr, setAlerteQr] = useState<string | null>(null);
  // Détail du jour ouvert en touchant l'anneau ou une case de macro.
  const [detail, setDetail] = useState<Nutriment | null>(null);
  // Enregistrer un repas complet en favori : section concernée et nom choisi.
  const [favoriRepas, setFavoriRepas] = useState<{ type: RepasType; nom: string } | null>(null);
  const [messageFavori, setMessageFavori] = useState<{ type: RepasType; texte: string } | null>(null);

  // QR d'étiquette scanné avec l'appareil photo : on ouvre l'ajout pré-rempli,
  // puis on nettoie l'adresse pour ne pas le rouvrir à chaque rafraîchissement.
  useEffect(() => {
    if (!platScanne && !codePlatInconnu) return;
    if (platScanne) {
      setPlatPrerempli(platScanne);
      setRepasCible(repasSelonHeure());
      setModalOuverte(true);
    } else {
      setAlerteQr("Cette étiquette n'est reconnue dans aucun plat Chef2Box.");
    }
    router.replace(lienJour(date, aujourdhui));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platScanne, codePlatInconnu]);

  // Glisser le doigt vers la gauche / la droite : jour suivant / précédent.
  const depart = useRef<{ x: number; y: number } | null>(null);
  function debutGlisse(e: React.TouchEvent) {
    const t = e.touches[0];
    depart.current = modalOuverte || repasEnEdition ? null : { x: t.clientX, y: t.clientY };
  }
  function finGlisse(e: React.TouchEvent) {
    const d = depart.current;
    depart.current = null;
    if (!d) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - d.x;
    const dy = t.clientY - d.y;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    if (dx > 0) router.push(lienJour(decalerDate(date, -1), aujourdhui));
    else if (!estAujourdhui) router.push(lienJour(decalerDate(date, 1), aujourdhui));
  }

  const totaux = totauxDuJour(repasDuJour);
  // « samedi » « 26 » « septembre » pour l'en-tête.
  const jourDate = new Date(`${date}T12:00:00Z`);
  const format = (o: Intl.DateTimeFormatOptions) => jourDate.toLocaleDateString("fr-FR", { ...o, timeZone: "UTC" });
  const jourSemaine = format({ weekday: "long" });
  const jourMois = format({ day: "numeric" });
  const mois = format({ month: "long", year: jourDate.getUTCFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
  const estAujourdhui = date === aujourdhui;
  const nomsFavoris = new Set(favoris.map((f) => f.nom.toLowerCase()));

  function rafraichir() {
    router.refresh();
  }

  function ouvrirAjout(type: RepasType) {
    setPlatPrerempli(null);
    setRepasCible(type);
    setModalOuverte(true);
  }

  async function copierVeille(type: RepasType) {
    const aCopier = repasVeille.filter((r) => r.repas_type === type);
    if (aCopier.length === 0) return;
    setCopieEnCours(type);
    await supabase.from("application_repas_journal").insert(
      aCopier.map((r) => ({
        client_id: client.id,
        date,
        repas_type: r.repas_type,
        source: r.source,
        nom: r.nom,
        quantite: r.quantite,
        unite: r.unite,
        calories: r.calories,
        proteines: r.proteines,
        glucides: r.glucides,
        lipides: r.lipides,
        plat_id: r.plat_id,
        cree_par: "client",
      }))
    );
    setCopieEnCours(null);
    rafraichir();
  }

  const veille = decalerDate(date, -1);

  async function enregistrerRepasFavori() {
    if (!favoriRepas) return;
    const elements = repasDuJour
      .filter((r) => r.repas_type === favoriRepas.type)
      .map((r) => ({
        nom: r.nom,
        calories: Number(r.calories),
        proteines: Number(r.proteines),
        glucides: Number(r.glucides),
        lipides: Number(r.lipides),
        unite: r.unite === "g" ? "g" : "portion",
        quantite: Number(r.quantite),
        source: r.source,
        plat_id: r.plat_id,
      }));
    const total = (cle: "calories" | "proteines" | "glucides" | "lipides") =>
      Math.round(elements.reduce((t, e) => t + e[cle] * e.quantite, 0) * 10) / 10;
    const nom = favoriRepas.nom.trim() || REPAS_TYPE_LABELS[favoriRepas.type];
    const { error } = await supabase.from("application_favoris").upsert(
      {
        client_id: client.id,
        nom,
        calories: total("calories"),
        proteines: total("proteines"),
        glucides: total("glucides"),
        lipides: total("lipides"),
        unite: "portion",
        quantite: 1,
        source: "manuel",
        elements,
      },
      { onConflict: "client_id,nom" }
    );
    setMessageFavori({
      type: favoriRepas.type,
      texte: error ? "Enregistrement impossible, réessayez." : `⭐ « ${nom} » ajouté à vos favoris`,
    });
    setFavoriRepas(null);
    if (!error) rafraichir();
  }

  return (
    <main className="max-w-2xl mx-auto px-4 pt-6 pb-24 space-y-4" onTouchStart={debutGlisse} onTouchEnd={finGlisse}>
      {/* En-tête de carnet : la date en grand, les flèches pour changer de jour. */}
      <header>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-c2b-green first-letter:uppercase">
              {estAujourdhui ? "Aujourd'hui" : libelleDate(date, aujourdhui) === "Hier" ? "Hier" : jourSemaine}
            </h1>
            <p className="text-[15px] text-c2b-muted first-letter:uppercase">
              {jourSemaine} {jourMois} {mois}
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <Link
              href={lienJour(veille, aujourdhui)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-c2b-green shadow-[0_1px_3px_rgba(20,35,25,0.1)]"
              aria-label="Jour précédent"
            >
              <ChevronLeft size={20} />
            </Link>
            <Link
              href={estAujourdhui ? "#" : lienJour(decalerDate(date, 1), aujourdhui)}
              aria-disabled={estAujourdhui}
              className={`flex h-10 w-10 items-center justify-center rounded-full bg-white text-c2b-green shadow-[0_1px_3px_rgba(20,35,25,0.1)] ${
                estAujourdhui ? "pointer-events-none opacity-35" : ""
              }`}
              aria-label="Jour suivant"
            >
              <ChevronRight size={20} />
            </Link>
          </div>
        </div>
        {estAujourdhui && (serie > 0 || points !== null || defiEnCours) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {serie > 0 && (
              <Link
                href="/history"
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-c2b-green shadow-[0_1px_3px_rgba(20,35,25,0.08)]"
              >
                <Flame size={15} className="text-c2b-lip" />
                {serie} jour{serie > 1 ? "s" : ""} d&apos;affilée
              </Link>
            )}
            {points !== null && (
              <Link
                href="/history"
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-c2b-green shadow-[0_1px_3px_rgba(20,35,25,0.08)]"
              >
                <Star size={14} className="text-c2b-gluc" />
                {points.toLocaleString("fr-FR")} points
              </Link>
            )}
            {defiEnCours && (
              <Link
                href="/history"
                className="inline-flex items-center gap-1.5 rounded-full bg-c2b-green px-3 py-1.5 text-[13px] font-semibold text-white"
              >
                Défi {Math.min(defiEnCours.fait ?? 0, defiEnCours.cible)}/{defiEnCours.cible}
              </Link>
            )}
          </div>
        )}
        {estAujourdhui && serie > 0 && repasDuJour.length === 0 && (
          <p className="mt-2 text-[13px] text-c2b-muted">Notez un repas aujourd&apos;hui pour garder votre série.</p>
        )}
        {!estAujourdhui && (
          <Link href="/dashboard" className="mt-2 inline-block text-sm font-semibold text-c2b-green">
            Revenir à aujourd&apos;hui →
          </Link>
        )}
      </header>

      {/* Une seule carte d'info à la fois : bilan du lundi, sinon installation, sinon rappel. */}
      {statsSemaine && statsSemaine.joursNotes > 0 ? (
        <BilanSemaine stats={statsSemaine} />
      ) : (
        estAujourdhui && (
          <>
            <InstallerAppli />
            <RappelSoir clientId={client.id} compact />
          </>
        )
      )}

      {alerteQr && (
        <button
          onClick={() => setAlerteQr(null)}
          className="w-full rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-left text-sm text-red-700"
        >
          {alerteQr} <span className="font-semibold">Fermer</span>
        </button>
      )}

      <ResumeJour
        totaux={totaux}
        objectifs={{
          calories: client.objectif_calories,
          proteines: client.objectif_proteines,
          glucides: client.objectif_glucides,
          lipides: client.objectif_lipides,
        }}
        onDetail={setDetail}
      />

      {ORDRE_REPAS.map((type) => {
        const repasSection = repasDuJour.filter((r) => r.repas_type === type);
        const kcalSection = totauxDuJour(repasSection).calories;
        const veilleSection = repasVeille.filter((r) => r.repas_type === type);
        return (
          <section key={type} className="carte px-4 pb-3 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-semibold text-c2b-green">{REPAS_TYPE_LABELS[type]}</h2>
                <p className="text-[13px] text-c2b-muted tabular-nums">
                  {repasSection.length > 0
                    ? `${Math.round(kcalSection)} kcal · ${repasSection.length} aliment${repasSection.length > 1 ? "s" : ""}`
                    : "Rien de noté"}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                {repasSection.length > 0 && favoriRepas?.type !== type && (
                  <button
                    onClick={() => {
                      setMessageFavori(null);
                      setFavoriRepas({ type, nom: `${type === "collation" ? "Ma" : "Mon"} ${REPAS_TYPE_LABELS[type].toLowerCase()}` });
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-c2b-muted transition active:scale-95"
                    aria-label={`Enregistrer le ${REPAS_TYPE_LABELS[type].toLowerCase()} en favori`}
                  >
                    <Star size={18} />
                  </button>
                )}
                <button
                  onClick={() => ouvrirAjout(type)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-c2b-green/[0.08] text-c2b-green transition active:scale-95"
                  aria-label={`Ajouter au ${REPAS_TYPE_LABELS[type].toLowerCase()}`}
                >
                  <Plus size={19} />
                </button>
              </div>
            </div>
            {repasSection.length > 0 && (
              <div className="mt-2">
                {repasSection.map((r) => (
                  <MealCard key={r.id} repas={r} onModifier={setRepasEnEdition} />
                ))}
              </div>
            )}
            {repasSection.length === 0 && veilleSection.length > 0 && (
              <button
                onClick={() => copierVeille(type)}
                disabled={copieEnCours !== null}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-c2b-green/[0.07] px-3 py-1.5 text-[13px] font-semibold text-c2b-green disabled:opacity-60"
              >
                <Copy size={14} />
                {copieEnCours === type ? "Copie..." : `Comme hier · ${Math.round(totauxDuJour(veilleSection).calories)} kcal`}
              </button>
            )}
            {repasSection.length > 0 &&
              (favoriRepas?.type === type ? (
                <div className="mt-2 flex gap-2">
                  <input
                    autoFocus
                    value={favoriRepas.nom}
                    onChange={(e) => setFavoriRepas({ type, nom: e.target.value })}
                    placeholder="Nom du repas favori"
                    className="champ py-2.5 text-sm"
                  />
                  <button onClick={enregistrerRepasFavori} className="btn-primary px-4 text-sm flex-shrink-0">
                    OK
                  </button>
                  <button onClick={() => setFavoriRepas(null)} className="text-sm text-c2b-muted px-1 flex-shrink-0">
                    Annuler
                  </button>
                </div>
              ) : (
                messageFavori?.type === type && (
                  <p className="mt-2 text-[13px] font-semibold text-c2b-green">{messageFavori.texte}</p>
                )
              ))}
          </section>
        );
      })}

      <button
        onClick={() => ouvrirAjout(repasSelonHeure())}
        className="fixed bottom-[92px] md:bottom-8 right-4 md:right-8 z-10 bg-c2b-green hover:bg-c2b-green-mid text-white rounded-full w-14 h-14 flex items-center justify-center shadow-[0_6px_20px_rgba(28,46,30,0.3)] transition"
        aria-label="Ajouter un repas"
      >
        <Plus size={26} />
      </button>

      {modalOuverte && (
        <AddMealModal
          clientId={client.id}
          iaActive={assistantActif}
          date={date}
          repasTypeParDefaut={repasCible}
          favoris={favoris}
          recents={recents}
          prefillTrouve={(() => {
            const plat = platPrerempli;
            return plat
              ? {
                  nom: plat.nom,
                  calories: plat.calories,
                  proteines: plat.proteines,
                  glucides: plat.glucides,
                  lipides: plat.lipides,
                  source: "chef2box" as const,
                  plat_id: plat.id,
                  quantiteParDefaut: 1,
                }
              : undefined;
          })()}
          onClose={() => setModalOuverte(false)}
          onAjoute={rafraichir}
        />
      )}

      {detail && (
        <DetailNutrition
          repas={repasDuJour}
          objectifs={{
            calories: client.objectif_calories,
            proteines: client.objectif_proteines,
            glucides: client.objectif_glucides,
            lipides: client.objectif_lipides,
          }}
          initial={detail}
          onClose={() => setDetail(null)}
          assistantActif={assistantActif && estAujourdhui}
        />
      )}

      {repasEnEdition && (
        <EditMealModal
          repas={repasEnEdition}
          estFavori={nomsFavoris.has(repasEnEdition.nom.toLowerCase())}
          onClose={() => setRepasEnEdition(null)}
          onModifie={rafraichir}
        />
      )}
    </main>
  );
}
