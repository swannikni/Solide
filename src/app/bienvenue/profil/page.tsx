"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { FormulaireProfil, PROFIL_VIDE, versProfil, type ProfilSaisi } from "@/components/FormulaireProfil";
import { calculerObjectifs, horsLimites, profilComplet } from "@/lib/objectifs";

// Après l'inscription : le questionnaire du site (sexe, âge, taille, poids,
// objectif, activité...) calcule les objectifs kcal et macros du client.
// Obligatoire une fois : le proxy y ramène tant qu'il n'est pas rempli.
export default function QuestionnaireBienvenue() {
  const router = useRouter();
  const supabase = createClient();
  const [nom, setNom] = useState("");
  const [profil, setProfil] = useState<ProfilSaisi>({ ...PROFIL_VIDE });
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const n = data.user?.user_metadata?.nom;
      if (typeof n === "string") setNom(n);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const p = versProfil(profil);
  const complet = profilComplet(p) && horsLimites(p).length === 0;
  const calcul = complet ? calculerObjectifs(p) : null;

  async function valider() {
    if (!calcul || !profilComplet(p)) return setErreur("Répondez à toutes les questions pour calculer vos objectifs.");
    setEnCours(true);
    setErreur(null);
    const { error } = await supabase.rpc("application_maj_mon_profil", {
      p_nom: nom.trim() || "Client",
      p_profil: p,
      p_calories: calcul.calories,
      p_proteines: calcul.proteines,
      p_glucides: calcul.glucides,
      p_lipides: calcul.lipides,
      p_palier: calcul.palier,
    });
    if (error) {
      setEnCours(false);
      return setErreur("Enregistrement impossible, vérifiez vos réponses.");
    }
    await supabase.auth.updateUser({ data: { doit_completer_profil: false } });
    // Nouveau jeton : l'ancien indique encore « questionnaire à remplir ».
    await supabase.auth.refreshSession();
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-c2b-cream px-5 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          <Logo className="h-16 w-auto mb-5" />
          <h1 className="titre text-[34px]">
            Bienvenue{nom ? ` ${nom.split(" ")[0]}` : ""} <em className="block">faisons connaissance</em>
          </h1>
          <p className="text-sm text-c2b-muted mt-3">
            Quelques questions pour calculer vos calories et vos macros du jour. Vous pourrez tout modifier plus tard dans « Mon profil ».
          </p>
        </div>

        <div className="carte p-5">
          <FormulaireProfil profil={profil} onChange={(modif) => setProfil((avant) => ({ ...avant, ...modif }))} />
        </div>

        {calcul && (
          <div className="carte mt-4 p-5 text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-c2b-gold">Vos objectifs du jour</p>
            <p className="mt-1 font-serif text-[40px] leading-none text-c2b-green">
              {calcul.calories} <span className="font-sans text-base font-bold">kcal</span>
            </p>
            <p className="mt-2 text-sm text-c2b-muted">
              Protéines {calcul.proteines} g · Glucides {calcul.glucides} g · Lipides {calcul.lipides} g
            </p>
          </div>
        )}

        {erreur && <p className="mt-3 text-center text-sm font-semibold text-red-700">{erreur}</p>}

        <button onClick={valider} disabled={enCours || !calcul} className="btn-primary mt-4 w-full py-4 disabled:opacity-50">
          {enCours ? "Enregistrement..." : calcul ? "C'est parti !" : "Répondez aux questions pour continuer"}
        </button>
      </div>
    </div>
  );
}
