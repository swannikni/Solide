"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Client, Commande, Plat } from "@/lib/types";
import { Check } from "lucide-react";
import { AdminOnglets } from "@/app/admin/AdminOnglets";

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

  async function assignerPlat(clientId: string, repasType: "dejeuner" | "diner", platId: string) {
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

      <div className="carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-c2b-green text-c2b-cream text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Déjeuner</th>
              <th className="px-3 py-2 font-medium">Dîner</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="border-t border-c2b-green/10">
                <td className="px-3 py-2 text-c2b-green font-medium">{client.nom}</td>
                {(["dejeuner", "diner"] as const).map((repasType) => {
                  const commande = commandePour(client.id, repasType);
                  const cle = `${client.id}-${repasType}`;
                  return (
                    <td key={repasType} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={commande?.plat_id ?? ""}
                          onChange={(e) => assignerPlat(client.id, repasType, e.target.value)}
                          className="champ py-2 px-3 text-xs flex-1"
                        >
                          <option value="">— Aucun —</option>
                          {plats.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nom}
                            </option>
                          ))}
                        </select>
                        {enregistrementId === cle ? (
                          <span className="text-xs text-c2b-green/40">...</span>
                        ) : commande?.plat_id ? (
                          <Check size={14} className="text-c2b-gold flex-shrink-0" />
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
