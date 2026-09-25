"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GraphiqueCalories, GraphiquePoids } from "@/components/Graphiques";
import type { Poids } from "@/lib/types";

export function Progres({
  clientId,
  aujourdhui,
  poids,
  caloriesSemaine,
  objectifCalories,
}: {
  clientId: string;
  aujourdhui: string;
  poids: Pick<Poids, "date" | "poids_kg">[];
  caloriesSemaine: { date: string; calories: number }[];
  objectifCalories: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const pesee = poids.find((p) => p.date === aujourdhui);
  const [saisie, setSaisie] = useState(pesee ? String(pesee.poids_kg).replace(".", ",") : "");
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState("");

  const mesures = poids.map((p) => ({ date: p.date, poids_kg: Number(p.poids_kg) }));
  const actuel = mesures[mesures.length - 1];
  const premier = mesures[0];
  const ecart = actuel && premier && mesures.length > 1 ? actuel.poids_kg - premier.poids_kg : null;

  const joursRemplis = caloriesSemaine.filter((j) => j.calories > 0);
  const moyenne = joursRemplis.length
    ? Math.round(joursRemplis.reduce((t, j) => t + j.calories, 0) / joursRemplis.length)
    : null;

  async function enregistrerPoids(e: React.FormEvent) {
    e.preventDefault();
    const valeur = parseFloat(saisie.replace(",", "."));
    if (!Number.isFinite(valeur) || valeur < 20 || valeur > 400) {
      setMessage("Indiquez un poids en kg, par exemple 72,5.");
      return;
    }
    setEnCours(true);
    setMessage("");
    const { error } = await supabase
      .from("application_poids")
      .upsert({ client_id: clientId, date: aujourdhui, poids_kg: valeur }, { onConflict: "client_id,date" });
    setEnCours(false);
    if (error) {
      setMessage("Enregistrement impossible, réessayez.");
      return;
    }
    setMessage("Poids enregistré ✓");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <section className="carte p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-serif text-xl text-c2b-green">Poids</h2>
            {actuel && (
              <p className="mt-1">
                <span className="text-[32px] font-semibold text-c2b-text leading-none">
                  {actuel.poids_kg.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
                </span>
                <span className="text-sm text-c2b-muted"> kg</span>
                {ecart !== null && (
                  <span className="ml-2 text-sm font-semibold text-c2b-green">
                    {ecart > 0 ? "+" : ecart < 0 ? "−" : "±"}
                    {Math.abs(ecart).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kg
                    <span className="font-normal text-c2b-muted">
                      {" "}
                      depuis le{" "}
                      {new Date(`${premier.date}T12:00:00Z`).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </span>
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={enregistrerPoids} className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value.replace(/[^0-9.,]/g, ""))}
            placeholder="Poids du jour (kg)"
            aria-label="Poids du jour en kg"
            className="champ"
          />
          <button type="submit" disabled={enCours || !saisie} className="btn-primary px-5 flex-shrink-0">
            {enCours ? "..." : pesee ? "Modifier" : "Ajouter"}
          </button>
        </form>
        {message && <p className="text-xs font-semibold text-c2b-green mt-2">{message}</p>}

        {mesures.length >= 2 ? (
          <div className="mt-4">
            <GraphiquePoids mesures={mesures} />
          </div>
        ) : (
          <p className="text-xs text-c2b-muted mt-3">
            Pesez-vous le matin, à jeun, une ou deux fois par semaine : la courbe apparaît dès la deuxième pesée.
          </p>
        )}
      </section>

      <section className="carte p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-serif text-xl text-c2b-green">Calories · 7 jours</h2>
            {moyenne !== null && (
              <p className="text-sm text-c2b-muted mt-0.5">
                Moyenne <span className="font-semibold text-c2b-text">{moyenne.toLocaleString("fr-FR")} kcal</span>{" "}
                par jour renseigné
              </p>
            )}
            <p className="text-xs text-c2b-muted mt-1 flex items-center gap-1.5">
              <span className="inline-block w-4 h-px bg-c2b-green/70" />
              Objectif {objectifCalories.toLocaleString("fr-FR")} kcal
            </p>
          </div>
        </div>
        <GraphiqueCalories jours={caloriesSemaine} objectif={objectifCalories} />
      </section>
    </div>
  );
}
