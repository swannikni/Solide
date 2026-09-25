"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Client, Commande, Plat } from "@/lib/types";
import { Check } from "lucide-react";
import { kcalPalier, portionPalier } from "@/lib/objectifs";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";

export function AdminClient({
  clients,
  plats,
  commandesInitiales,
  dateDuJour,
}: {
  clients: Client[];
  plats: Plat[];
  commandesInitiales: Commande[];
  dateDuJour: string;
}) {
  const supabase = createClient();
  const [date, setDate] = useState(dateDuJour);
  const [commandes, setCommandes] = useState(commandesInitiales);
  const [enregistrementId, setEnregistrementId] = useState<string | null>(null);

  // Changer de date recharge les box déjà assignées pour ce jour-là.
  async function changerDate(nouvelleDate: string) {
    setDate(nouvelleDate);
    if (!nouvelleDate) return;
    const { data } = await supabase
      .from("application_commandes")
      .select("*, plats:application_plats(*)")
      .eq("date_livraison", nouvelleDate)
      .returns<Commande[]>();
    setCommandes(data ?? []);
  }

  function commandePour(clientId: string, repasType: "dejeuner" | "diner") {
    return commandes.find((c) => c.client_id === clientId && c.repas_type === repasType);
  }

  async function enregistrer(clientId: string, repasType: "dejeuner" | "diner", platId: string, portion: number) {
    const cle = `${clientId}-${repasType}`;
    setEnregistrementId(cle);

    const { data, error } = await supabase
      .from("application_commandes")
      .upsert(
        {
          client_id: clientId,
          repas_type: repasType,
          date_livraison: date,
          plat_id: platId || null,
          portion,
          statut: "confirmee",
        },
        { onConflict: "client_id,date_livraison,repas_type" }
      )
      .select("*, plats:application_plats(*)")
      .single<Commande>();

    setEnregistrementId(null);
    if (!error && data) {
      setCommandes((prev) => [...prev.filter((c) => c.id !== data.id), data]);
    }
  }

  // Nouveau plat : on garde le choix standard / adaptée déjà fait pour ce client.
  function assignerPlat(client: Client, repasType: "dejeuner" | "diner", platId: string) {
    const avant = commandePour(client.id, repasType);
    const plat = plats.find((p) => p.id === platId);
    const adaptee = !!avant && Number(avant.portion) !== 1;
    const portion = adaptee && plat ? (portionPalier(client.palier, plat.calories) ?? 1) : 1;
    enregistrer(client.id, repasType, platId, portion);
  }

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
      <AdminOnglets />
      <header className="flex items-center justify-between">
        <div>
          <span className="lbl mb-2">Espace admin</span>
          <h1 className="titre text-[34px]">
            Box <em>du jour</em>
          </h1>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => changerDate(e.target.value)}
          className="champ w-auto py-2"
        />
      </header>

      {(clients.length === 0 || plats.length === 0) && (
        <div className="carte p-5 text-sm text-c2b-green space-y-1.5">
          {clients.length === 0 && (
            <p>
              Aucun client pour l&apos;instant.{" "}
              <Link href="/admin/clients" className="font-bold text-c2b-gold">
                Créer un client →
              </Link>
            </p>
          )}
          {plats.length === 0 && (
            <p>
              Aucun plat au menu.{" "}
              <Link href="/admin/menu" className="font-bold text-c2b-gold">
                Ajouter des plats →
              </Link>
            </p>
          )}
        </div>
      )}

      <p className="text-sm text-c2b-muted">
        Le client voit sa box en haut de son écran : photo, ingrédients et recette, avec les macros déjà prêtes à
        ajouter. Par défaut la box est standard ; choisissez « Adaptée » pour ajuster la portion à son palier.
      </p>

      <div className="space-y-3">
        {clients.map((client) => (
          <div key={client.id} className="carte p-4 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-bold text-c2b-green">{client.nom}</p>
              {client.palier && (
                <span className="text-[11px] font-bold tracking-wider text-c2b-gold">
                  {client.palier} · repas {kcalPalier(client.palier)} kcal
                </span>
              )}
            </div>
            {(["dejeuner", "diner"] as const).map((repasType) => {
              const commande = commandePour(client.id, repasType);
              const plat = commande?.plats;
              const cle = `${client.id}-${repasType}`;
              const portionAdaptee = plat ? portionPalier(client.palier, plat.calories) : null;
              const portion = Number(commande?.portion ?? 1);
              return (
                <div key={repasType} className="grid grid-cols-[70px_1fr] items-center gap-x-2 gap-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-c2b-muted">
                    {repasType === "dejeuner" ? "Déj." : "Dîner"}
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      value={commande?.plat_id ?? ""}
                      onChange={(e) => assignerPlat(client, repasType, e.target.value)}
                      className="champ py-2 px-3 text-sm flex-1 min-w-0"
                    >
                      <option value="">— Aucun —</option>
                      {plats.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom}
                        </option>
                      ))}
                    </select>
                    <span className="w-4 flex-shrink-0">
                      {enregistrementId === cle ? (
                        <span className="text-xs text-c2b-green/40">...</span>
                      ) : commande?.plat_id ? (
                        <Check size={14} className="text-c2b-gold" />
                      ) : null}
                    </span>
                  </div>
                  {plat && (
                    <div className="col-start-2 flex flex-wrap gap-1.5">
                      <button
                        onClick={() => enregistrer(client.id, repasType, plat.id, 1)}
                        className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold border ${
                          portion === 1
                            ? "bg-c2b-green text-c2b-cream border-c2b-green"
                            : "bg-white text-c2b-green border-black/10"
                        }`}
                      >
                        Standard · {plat.calories} kcal
                      </button>
                      {portionAdaptee !== null && portionAdaptee !== 1 && (
                        <button
                          onClick={() => enregistrer(client.id, repasType, plat.id, portionAdaptee)}
                          className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold border ${
                            portion !== 1
                              ? "bg-c2b-green text-c2b-cream border-c2b-green"
                              : "bg-white text-c2b-green border-black/10"
                          }`}
                        >
                          Adaptée {client.palier} · {Math.round(plat.calories * portionAdaptee)} kcal
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </main>
  );
}
