"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Client, Commande, Plat } from "@/lib/types";
import { Check, Plus } from "lucide-react";

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
  const [afficherAjoutPlat, setAfficherAjoutPlat] = useState(false);

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
      <header className="flex items-center justify-between">
        <h1 className="font-hand text-3xl text-c2b-green">Box du jour — Admin</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-c2b-green/20 px-3 py-1.5 text-sm"
        />
      </header>

      <div className="bg-white rounded-2xl border border-c2b-green/10 overflow-hidden">
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
                          className="rounded-lg border border-c2b-green/20 px-2 py-1.5 text-xs flex-1"
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

      <section>
        <button
          onClick={() => setAfficherAjoutPlat((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-c2b-green font-medium"
        >
          <Plus size={16} /> Ajouter un plat au menu
        </button>
        {afficherAjoutPlat && <FormulaireNouveauPlat onCree={() => setAfficherAjoutPlat(false)} />}
      </section>
    </main>
  );
}

function FormulaireNouveauPlat({ onCree }: { onCree: () => void }) {
  const supabase = createClient();
  const [nom, setNom] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [calories, setCalories] = useState("");
  const [proteines, setProteines] = useState("");
  const [glucides, setGlucides] = useState("");
  const [lipides, setLipides] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);

  async function creer() {
    if (!nom || !qrCode || !calories) return;
    setEnregistrement(true);
    await supabase.from("application_plats").insert({
      nom,
      qr_code: qrCode,
      calories: Number(calories),
      proteines: Number(proteines) || 0,
      glucides: Number(glucides) || 0,
      lipides: Number(lipides) || 0,
    });
    setEnregistrement(false);
    onCree();
    window.location.reload();
  }

  return (
    <div className="mt-3 bg-white rounded-xl border border-c2b-green/10 p-4 space-y-2">
      <input
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        placeholder="Nom du plat"
        className="w-full rounded-lg border border-c2b-green/20 px-3 py-2 text-sm"
      />
      <input
        value={qrCode}
        onChange={(e) => setQrCode(e.target.value)}
        placeholder="Code QR (identifiant unique de l'étiquette)"
        className="w-full rounded-lg border border-c2b-green/20 px-3 py-2 text-sm"
      />
      <div className="grid grid-cols-4 gap-2">
        <input value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="kcal" type="number" className="rounded-lg border border-c2b-green/20 px-2 py-2 text-sm" />
        <input value={proteines} onChange={(e) => setProteines(e.target.value)} placeholder="P (g)" type="number" className="rounded-lg border border-c2b-green/20 px-2 py-2 text-sm" />
        <input value={glucides} onChange={(e) => setGlucides(e.target.value)} placeholder="G (g)" type="number" className="rounded-lg border border-c2b-green/20 px-2 py-2 text-sm" />
        <input value={lipides} onChange={(e) => setLipides(e.target.value)} placeholder="L (g)" type="number" className="rounded-lg border border-c2b-green/20 px-2 py-2 text-sm" />
      </div>
      <button
        onClick={creer}
        disabled={enregistrement}
        className="w-full rounded-lg bg-c2b-green text-c2b-cream py-2 text-sm disabled:opacity-60"
      >
        {enregistrement ? "Création..." : "Créer le plat"}
      </button>
    </div>
  );
}
