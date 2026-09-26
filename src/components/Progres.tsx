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
  poidsObjectif,
  poidsDepart,
}: {
  clientId: string;
  aujourdhui: string;
  poids: Pick<Poids, "date" | "poids_kg">[];
  caloriesSemaine: { date: string; calories: number }[];
  objectifCalories: number;
  poidsObjectif: number | null;
  // Poids de départ pour la barre d'objectif (questionnaire, sinon 1re pesée).
  poidsDepart: number | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const pesee = poids.find((p) => p.date === aujourdhui);
  const [saisie, setSaisie] = useState(pesee ? String(pesee.poids_kg).replace(".", ",") : "");
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState("");
  const [editionObjectif, setEditionObjectif] = useState(false);
  const [saisieObjectif, setSaisieObjectif] = useState(
    poidsObjectif ? String(poidsObjectif).replace(".", ",") : ""
  );
  const [messageObjectif, setMessageObjectif] = useState("");

  const mesures = poids.map((p) => ({ date: p.date, poids_kg: Number(p.poids_kg) }));
  const actuel = mesures[mesures.length - 1];
  const premier = mesures[0];
  const ecart = actuel && premier && mesures.length > 1 ? actuel.poids_kg - premier.poids_kg : null;

  const joursRemplis = caloriesSemaine.filter((j) => j.calories > 0);
  const moyenne = joursRemplis.length
    ? Math.round(joursRemplis.reduce((t, j) => t + j.calories, 0) / joursRemplis.length)
    : null;

  async function enregistrerObjectif(e: React.FormEvent) {
    e.preventDefault();
    const valeur = parseFloat(saisieObjectif.replace(",", "."));
    if (!Number.isFinite(valeur) || valeur < 30 || valeur > 300) {
      setMessageObjectif("Indiquez un poids en kg, par exemple 70.");
      return;
    }
    setEnCours(true);
    const { error } = await supabase.rpc("application_definir_poids_objectif", { p_kg: valeur });
    setEnCours(false);
    if (error) {
      setMessageObjectif("Enregistrement impossible, réessayez.");
      return;
    }
    setMessageObjectif("");
    setEditionObjectif(false);
    router.refresh();
  }

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
            <h2 className="font-bold tracking-tight text-xl text-c2b-green">Poids</h2>
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

        {poidsObjectif && !editionObjectif ? (
          <BarreObjectif
            depart={poidsDepart ?? actuel?.poids_kg ?? poidsObjectif}
            actuel={actuel?.poids_kg ?? poidsDepart ?? poidsObjectif}
            objectif={poidsObjectif}
            mesures={mesures}
            onModifier={() => setEditionObjectif(true)}
          />
        ) : editionObjectif ? (
          <form onSubmit={enregistrerObjectif} className="mb-4 rounded-2xl bg-c2b-cream p-3.5">
            <label htmlFor="objectif-poids" className="block text-xs font-bold text-c2b-muted mb-2">
              Mon objectif de poids (kg)
            </label>
            <div className="flex gap-2">
              <input
                id="objectif-poids"
                type="text"
                inputMode="decimal"
                autoFocus
                value={saisieObjectif}
                onChange={(e) => {
                  setSaisieObjectif(e.target.value.replace(/[^0-9.,]/g, ""));
                  setMessageObjectif("");
                }}
                placeholder="Ex : 70"
                className="champ"
              />
              <button type="submit" disabled={enCours || !saisieObjectif} className="btn-primary px-5 flex-shrink-0">
                OK
              </button>
            </div>
            {messageObjectif && <p className="text-xs font-semibold text-red-600 mt-2">{messageObjectif}</p>}
          </form>
        ) : (
          <button
            onClick={() => setEditionObjectif(true)}
            className="mb-4 w-full rounded-2xl border-2 border-dashed border-c2b-gold/50 py-3 text-sm font-bold text-c2b-green"
          >
            🎯 Fixer mon objectif de poids
          </button>
        )}

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
            <h2 className="font-bold tracking-tight text-xl text-c2b-green">Calories · 7 jours</h2>
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

const kg = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

function BarreObjectif({
  depart,
  actuel,
  objectif,
  mesures,
  onModifier,
}: {
  depart: number;
  actuel: number;
  objectif: number;
  mesures: { date: string; poids_kg: number }[];
  onModifier: () => void;
}) {
  const total = Math.abs(depart - objectif);
  const sens = objectif < depart ? -1 : 1; // -1 : perte, +1 : prise
  const fait = Math.max(0, (actuel - depart) * sens);
  const reste = Math.max(0, (objectif - actuel) * sens);
  const pourcent = total > 0 ? Math.min(100, Math.round((fait / total) * 100)) : 100;
  const atteint = total > 0 && reste === 0;

  // Rythme sur les 4 dernières semaines de pesées, s'il va dans le bon sens.
  let estimation: string | null = null;
  if (mesures.length >= 2 && !atteint) {
    const fin = mesures[mesures.length - 1];
    const limite = new Date(`${fin.date}T12:00:00Z`).getTime() - 28 * 86400000;
    const debut = mesures.find((m) => new Date(`${m.date}T12:00:00Z`).getTime() >= limite) ?? mesures[0];
    const jours = (new Date(`${fin.date}T12:00:00Z`).getTime() - new Date(`${debut.date}T12:00:00Z`).getTime()) / 86400000;
    const parJour = ((fin.poids_kg - debut.poids_kg) * sens) / (jours || 1);
    if (jours >= 7 && parJour > 0) {
      const joursRestants = reste / parJour;
      if (joursRestants < 730) {
        estimation = new Date(Date.now() + joursRestants * 86400000).toLocaleDateString("fr-FR", {
          month: "long",
          year: "numeric",
        });
      }
    }
  }

  return (
    <div className="mb-4 rounded-2xl bg-c2b-cream p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-c2b-green">
          <span className="font-bold">🎯 Objectif {kg(objectif)} kg</span>
        </p>
        <button onClick={onModifier} className="text-xs font-semibold text-c2b-muted underline-offset-2 hover:underline">
          Modifier
        </button>
      </div>
      <div
        className="mt-2.5 h-3 rounded-full bg-c2b-green/10 overflow-hidden"
        role="progressbar"
        aria-valuenow={pourcent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progression vers l'objectif de poids"
      >
        <div className="h-full rounded-full bg-c2b-gold transition-all" style={{ width: `${Math.max(pourcent, 3)}%` }} />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-c2b-muted">Départ {kg(depart)} kg</span>
        <span className="font-bold text-c2b-green">{pourcent} %</span>
      </div>
      <p className="mt-2 text-sm text-c2b-green">
        {atteint ? (
          <span className="font-bold">🏆 Objectif atteint, bravo !</span>
        ) : (
          <>
            <span className="font-semibold">
              {sens < 0 ? "−" : "+"}
              {kg(fait)} kg
            </span>{" "}
            <span className="text-c2b-muted">sur {kg(total)} kg · encore</span>{" "}
            <span className="font-semibold">{kg(reste)} kg</span>
          </>
        )}
      </p>
      {estimation && (
        <p className="mt-1 text-xs text-c2b-muted">
          À ce rythme, objectif atteint vers <span className="font-semibold text-c2b-green">{estimation}</span>.
        </p>
      )}
    </div>
  );
}
