"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Copy, Plus, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EtiquetteJour } from "@/components/EtiquetteJour";
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
    <main className="max-w-2xl mx-auto px-4 pt-6 pb-20 space-y-7" onTouchStart={debutGlisse} onTouchEnd={finGlisse}>
      {/* En-tête de carnet : la date en grand, les flèches pour changer de jour. */}
      <header className="border-b-[1.5px] border-c2b-green pb-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="lbl mb-1">{estAujourdhui ? "Aujourd'hui" : libelleDate(date, aujourdhui) === "Hier" ? "Hier" : "Journée"}</p>
            <h1 className="font-serif text-[44px] leading-[0.95] text-c2b-green first-letter:uppercase">{jourSemaine} {jourMois}</h1>
            <p className="mt-1 text-sm text-c2b-muted">
              {mois}
              {estAujourdhui && <> · Bonjour {client.nom.split(" ")[0]}</>}
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-1.5 pb-1">
            <Link
              href={lienJour(veille, aujourdhui)}
              className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-c2b-green/20 text-c2b-green"
              aria-label="Jour précédent"
            >
              <ChevronLeft size={20} />
            </Link>
            {!estAujourdhui && (
              <Link
                href={lienJour(decalerDate(date, 1), aujourdhui)}
                className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-c2b-green/20 text-c2b-green"
                aria-label="Jour suivant"
              >
                <ChevronRight size={20} />
              </Link>
            )}
          </div>
        </div>
        {estAujourdhui && (serie > 0 || points !== null || defiEnCours) && (
          <Link href="/history" className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-c2b-green">
            {serie > 0 && (
              <span>
                <strong className="tabular-nums text-c2b-gold">{serie}</strong> jour{serie > 1 ? "s" : ""} d&apos;affilée
                {repasDuJour.length === 0 && <span className="text-c2b-muted"> · notez un repas pour continuer</span>}
              </span>
            )}
            {points !== null && (
              <span>
                <strong className="tabular-nums text-c2b-gold">{points.toLocaleString("fr-FR")}</strong> points
              </span>
            )}
            {defiEnCours && (
              <span>
                Défi{" "}
                <strong className="tabular-nums text-c2b-gold">
                  {Math.min(defiEnCours.fait ?? 0, defiEnCours.cible)}/{defiEnCours.cible}
                </strong>
              </span>
            )}
          </Link>
        )}
        {!estAujourdhui && (
          <Link href="/dashboard" className="mt-2 inline-block text-sm font-semibold text-c2b-gold">
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

      <EtiquetteJour
        titre={estAujourdhui ? "Bilan du jour" : "Bilan de la journée"}
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
          <section key={type}>
            <div className="flex items-baseline justify-between border-b-[1.5px] border-c2b-green pb-1.5">
              <h2 className="font-serif text-[26px] leading-none text-c2b-green">{REPAS_TYPE_LABELS[type]}</h2>
              <span className="text-sm tabular-nums text-c2b-muted">
                {repasSection.length > 0 ? (
                  <>
                    <strong className="text-c2b-green">{Math.round(kcalSection)}</strong> kcal
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
            {repasSection.map((r) => (
              <MealCard key={r.id} repas={r} onModifier={setRepasEnEdition} />
            ))}
            {repasSection.length === 0 && (
              <p className="border-b border-c2b-green/15 py-3 text-sm italic text-c2b-muted">Rien de noté pour l&apos;instant</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2.5">
              <button
                onClick={() => ouvrirAjout(type)}
                className="inline-flex items-center gap-1 text-[14px] font-bold text-c2b-gold"
              >
                <Plus size={16} /> Ajouter
              </button>
              {repasSection.length === 0 && veilleSection.length > 0 && (
                <button
                  onClick={() => copierVeille(type)}
                  disabled={copieEnCours !== null}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-c2b-green disabled:opacity-60"
                >
                  <Copy size={14} />
                  {copieEnCours === type
                    ? "Copie..."
                    : `Comme hier · ${Math.round(totauxDuJour(veilleSection).calories)} kcal`}
                </button>
              )}
              {repasSection.length > 0 &&
                (favoriRepas?.type === type ? (
                  <div className="flex w-full gap-2">
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
                ) : messageFavori?.type === type ? (
                  <p className="text-[13px] font-semibold text-c2b-green">{messageFavori.texte}</p>
                ) : (
                  <button
                    onClick={() => {
                      setMessageFavori(null);
                      setFavoriRepas({ type, nom: `${type === "collation" ? "Ma" : "Mon"} ${REPAS_TYPE_LABELS[type].toLowerCase()}` });
                    }}
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-c2b-muted"
                  >
                    <Star size={14} /> En favori
                  </button>
                ))}
            </div>
          </section>
        );
      })}

      <button
        onClick={() => ouvrirAjout(repasSelonHeure())}
        className="fixed bottom-[92px] md:bottom-8 right-4 md:right-8 z-10 bg-c2b-gold hover:bg-c2b-gold-light text-c2b-green rounded-[16px] w-14 h-14 flex items-center justify-center shadow-[0_6px_18px_rgba(28,46,30,0.25)] transition"
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
