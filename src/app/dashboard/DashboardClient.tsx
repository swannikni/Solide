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
    <main className="max-w-2xl mx-auto px-4 pt-7 space-y-6">
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

      <section className="space-y-3">
        <span className="lbl">Repas du jour</span>
        {repasDuJour.length === 0 ? (
          <div className="carte px-6 py-8 text-center">
            <p className="font-serif text-xl text-c2b-green mb-1">Rien pour l&apos;instant.</p>
            <p className="text-sm text-c2b-muted mb-5">Ajoutez votre premier repas de la journée.</p>
            <button
              onClick={() => {
                setPrefillBox(null);
                setModalOuverte(true);
              }}
              className="btn-primary"
            >
              <Plus size={18} /> Ajouter un repas
            </button>
          </div>
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
        className="fixed bottom-[92px] md:bottom-8 right-4 md:right-8 z-10 bg-c2b-gold hover:bg-c2b-gold-light text-c2b-green rounded-full w-14 h-14 flex items-center justify-center shadow-[0_8px_24px_rgba(201,151,58,0.45)] transition"
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
