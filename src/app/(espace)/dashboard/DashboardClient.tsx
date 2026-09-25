"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Copy, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CalorieRing } from "@/components/CalorieRing";
import { MacroBar } from "@/components/MacroBar";
import { MealCard } from "@/components/MealCard";
import { AddMealModal } from "@/components/AddMealModal";
import { EditMealModal } from "@/components/EditMealModal";
import { InstallerAppli } from "@/components/InstallerAppli";
import { ORDRE_REPAS, REPAS_TYPE_LABELS, repasSelonHeure, totauxDuJour } from "@/lib/macros";
import { decalerDate, libelleDate } from "@/lib/dates";
import type { Client, Favori, Plat, RepasJournal, RepasType } from "@/lib/types";

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

  const totaux = totauxDuJour(repasDuJour);
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

  return (
    <main className="max-w-2xl mx-auto px-4 pt-7 pb-20 space-y-6">
      <header>
        <div className="flex items-center justify-between mb-2">
          <Link
            href={lienJour(veille, aujourdhui)}
            className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
            aria-label="Jour précédent"
          >
            <ChevronLeft size={22} />
          </Link>
          <span className="lbl first-letter:uppercase">{libelleDate(date, aujourdhui)}</span>
          {estAujourdhui ? (
            <span className="w-9 h-9 -mr-2" />
          ) : (
            <Link
              href={lienJour(decalerDate(date, 1), aujourdhui)}
              className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center text-c2b-green hover:bg-c2b-green/[0.06]"
              aria-label="Jour suivant"
            >
              <ChevronRight size={22} />
            </Link>
          )}
        </div>
        <h1 className="titre text-[38px]">
          {estAujourdhui ? (
            <>
              Bonjour <em className="inline">{client.nom.split(" ")[0]}</em>
            </>
          ) : (
            <>
              Votre <em className="inline">journée</em>
            </>
          )}
        </h1>
        {!estAujourdhui && (
          <Link href="/dashboard" className="inline-block mt-1 text-sm font-semibold text-c2b-gold">
            Revenir à aujourd&apos;hui →
          </Link>
        )}
      </header>

      {estAujourdhui && <InstallerAppli />}

      {alerteQr && (
        <button
          onClick={() => setAlerteQr(null)}
          className="w-full rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-left text-sm text-red-700"
        >
          {alerteQr} <span className="font-semibold">Fermer</span>
        </button>
      )}

      <section className="rounded-[20px] bg-c2b-green p-6 md:p-8">
        <span className="lbl mb-4">{estAujourdhui ? "Objectif du jour" : "Bilan de la journée"}</span>
        <CalorieRing consommees={totaux.calories} objectif={client.objectif_calories} />
        <div className="grid grid-cols-3 gap-2.5 mt-6">
          <MacroBar label="Protéines" consomme={totaux.proteines} objectif={client.objectif_proteines} couleur="#f7f3ec" />
          <MacroBar label="Glucides" consomme={totaux.glucides} objectif={client.objectif_glucides} couleur="#c9973a" />
          <MacroBar label="Lipides" consomme={totaux.lipides} objectif={client.objectif_lipides} couleur="#9db8a0" />
        </div>
      </section>

      {ORDRE_REPAS.map((type) => {
        const repasSection = repasDuJour.filter((r) => r.repas_type === type);
        const kcalSection = totauxDuJour(repasSection).calories;
        const veilleSection = repasVeille.filter((r) => r.repas_type === type);
        return (
          <section key={type} className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <h2 className="font-serif text-[22px] text-c2b-green">{REPAS_TYPE_LABELS[type]}</h2>
                {repasSection.length > 0 && (
                  <span className="text-xs font-bold text-c2b-gold">{Math.round(kcalSection)} kcal</span>
                )}
              </div>
              <button
                onClick={() => ouvrirAjout(type)}
                className="inline-flex items-center gap-1 rounded-full bg-white border border-black/5 px-3 py-1.5 text-[13px] font-bold text-c2b-green hover:border-c2b-gold/50"
              >
                <Plus size={15} /> Ajouter
              </button>
            </div>
            {repasSection.length === 0 ? (
              <div className="space-y-2">
                <button
                  onClick={() => ouvrirAjout(type)}
                  className="w-full rounded-[20px] border-2 border-dashed border-c2b-green/10 py-4 text-sm text-c2b-muted hover:border-c2b-gold/40"
                >
                  Rien pour l&apos;instant
                </button>
                {veilleSection.length > 0 && (
                  <button
                    onClick={() => copierVeille(type)}
                    disabled={copieEnCours !== null}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-c2b-gold/[0.12] py-2.5 text-[13px] font-bold text-c2b-green hover:bg-c2b-gold/20 disabled:opacity-60"
                  >
                    <Copy size={15} className="text-c2b-gold" />
                    {copieEnCours === type
                      ? "Copie..."
                      : `Reprendre celui de la veille · ${Math.round(totauxDuJour(veilleSection).calories)} kcal`}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {repasSection.map((r) => (
                  <MealCard key={r.id} repas={r} onModifier={setRepasEnEdition} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <button
        onClick={() => ouvrirAjout(repasSelonHeure())}
        className="fixed bottom-[92px] md:bottom-8 right-4 md:right-8 z-10 bg-c2b-gold hover:bg-c2b-gold-light text-c2b-green rounded-full w-14 h-14 flex items-center justify-center shadow-[0_8px_24px_rgba(201,151,58,0.45)] transition"
        aria-label="Ajouter un repas"
      >
        <Plus size={26} />
      </button>

      {modalOuverte && (
        <AddMealModal
          clientId={client.id}
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
