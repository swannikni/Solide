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
import { totauxDuJour } from "@/lib/macros";
import type { Client, Commande, RepasJournal } from "@/lib/types";

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
    setModalOuverte(true);
  }

  const idsCommandesAjoutees = new Set(repasDuJour.map((r) => r.commande_id).filter(Boolean));

  return (
    <main className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
      <header>
        <h1 className="font-hand text-3xl text-c2b-green">Bonjour {client.nom.split(" ")[0]}</h1>
        <p className="text-sm text-c2b-green/60">
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-c2b-green/10 p-4">
        <CalorieRing consommees={totaux.calories} objectif={client.objectif_calories} />
        <div className="space-y-3 mt-4">
          <MacroBar label="Protéines" consomme={totaux.proteines} objectif={client.objectif_proteines} couleur="#1c2e1e" />
          <MacroBar label="Glucides" consomme={totaux.glucides} objectif={client.objectif_glucides} couleur="#c9973a" />
          <MacroBar label="Lipides" consomme={totaux.lipides} objectif={client.objectif_lipides} couleur="#b5482f" />
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

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-c2b-green uppercase tracking-wide">Repas du jour</h2>
        </div>
        {repasDuJour.length === 0 ? (
          <p className="text-sm text-c2b-green/50 italic py-4 text-center">
            Aucun repas ajouté pour l'instant.
          </p>
        ) : (
          <div className="space-y-2">
            {repasDuJour.map((r) => (
              <MealCard key={r.id} repas={r} onSupprimer={supprimerRepas} />
            ))}
          </div>
        )}
      </section>

      <button
        onClick={() => {
          setPrefillBox(null);
          setModalOuverte(true);
        }}
        className="fixed bottom-20 md:bottom-6 right-4 md:right-8 bg-c2b-gold text-c2b-green rounded-full w-14 h-14 flex items-center justify-center shadow-lg"
        aria-label="Ajouter un repas"
      >
        <Plus size={26} />
      </button>

      {modalOuverte && (
        <AddMealModal
          clientId={client.id}
          commandeId={prefillBox?.commande.id}
          repasTypeParDefaut={prefillBox?.commande.repas_type ?? "dejeuner"}
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
