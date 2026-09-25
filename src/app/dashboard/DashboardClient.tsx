"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CalorieRing } from "@/components/CalorieRing";
import { MacroBar } from "@/components/MacroBar";
import { BoxDuJourCard } from "@/components/BoxDuJourCard";
import { MealCard } from "@/components/MealCard";
import { AddMealModal } from "@/components/AddMealModal";
import { ORDRE_REPAS, REPAS_TYPE_LABELS, repasSelonHeure, totauxDuJour } from "@/lib/macros";
import type { Client, Commande, RepasJournal, RepasType } from "@/lib/types";

export function DashboardClient({
  client,
  commandesDuJour,
  repasDuJour,
}: {
  client: Client;
  commandesDuJour: Commande[];
  repasDuJour: RepasJournal[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [modalOuverte, setModalOuverte] = useState(false);
  const [prefillBox, setPrefillBox] = useState<{
    commande: Commande;
    editable: boolean;
  } | null>(null);
  const [repasCible, setRepasCible] = useState<RepasType>("dejeuner");

  const totaux = totauxDuJour(repasDuJour);

  function rafraichir() {
    router.refresh();
  }

  async function supprimerRepas(id: string) {
    await supabase.from("application_repas_journal").delete().eq("id", id);
    rafraichir();
  }

  function ouvrirDepuisBox(commande: Commande) {
    setPrefillBox({ commande, editable: true });
    setRepasCible(commande.repas_type);
    setModalOuverte(true);
  }

  function ouvrirAjout(type: RepasType) {
    setPrefillBox(null);
    setRepasCible(type);
    setModalOuverte(true);
  }

  const idsCommandesAjoutees = new Set(repasDuJour.map((r) => r.commande_id).filter(Boolean));

  return (
    <main className="max-w-2xl mx-auto px-4 pt-7 pb-20 space-y-6">
      <header>
        <span className="lbl mb-2">
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </span>
        <h1 className="titre text-[38px]">
          Bonjour <em className="inline">{client.nom.split(" ")[0]}</em>
        </h1>
      </header>

      <section className="rounded-[20px] bg-c2b-green p-6 md:p-8">
        <span className="lbl mb-4">Objectif du jour</span>
        <CalorieRing consommees={totaux.calories} objectif={client.objectif_calories} />
        <div className="grid grid-cols-3 gap-2.5 mt-6">
          <MacroBar label="Protéines" consomme={totaux.proteines} objectif={client.objectif_proteines} couleur="#f7f3ec" />
          <MacroBar label="Glucides" consomme={totaux.glucides} objectif={client.objectif_glucides} couleur="#c9973a" />
          <MacroBar label="Lipides" consomme={totaux.lipides} objectif={client.objectif_lipides} couleur="#9db8a0" />
        </div>
      </section>

      {commandesDuJour.length > 0 && (
        <section className="space-y-3">
          {commandesDuJour.map((commande) => (
            <BoxDuJourCard
              key={commande.id}
              commande={commande}
              dejaAjoutee={idsCommandesAjoutees.has(commande.id)}
              onAjouterTelQuel={() => ouvrirDepuisBox(commande)}
              onAjuster={() => ouvrirDepuisBox(commande)}
            />
          ))}
        </section>
      )}

      {ORDRE_REPAS.map((type) => {
        const repasSection = repasDuJour.filter((r) => r.repas_type === type);
        const kcalSection = totauxDuJour(repasSection).calories;
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
              <button
                onClick={() => ouvrirAjout(type)}
                className="w-full rounded-[20px] border-2 border-dashed border-c2b-green/10 py-4 text-sm text-c2b-muted hover:border-c2b-gold/40"
              >
                Rien pour l&apos;instant
              </button>
            ) : (
              <div className="space-y-2">
                {repasSection.map((r) => (
                  <MealCard key={r.id} repas={r} onSupprimer={supprimerRepas} />
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
          commandeId={prefillBox?.commande.id}
          repasTypeParDefaut={repasCible}
          prefillTrouve={
            prefillBox?.commande.plats
              ? {
                  nom: prefillBox.commande.plats.nom,
                  calories: prefillBox.commande.plats.calories,
                  proteines: prefillBox.commande.plats.proteines,
                  glucides: prefillBox.commande.plats.glucides,
                  lipides: prefillBox.commande.plats.lipides,
                  source: "chef2box",
                  plat_id: prefillBox.commande.plats.id,
                  quantiteParDefaut: 1,
                }
              : undefined
          }
          onClose={() => setModalOuverte(false)}
          onAjoute={rafraichir}
        />
      )}
    </main>
  );
}
