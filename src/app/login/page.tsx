"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  async function seConnecter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setChargement(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: motDePasse,
    });

    setChargement(false);

    if (error) {
      setErreur("Email ou mot de passe incorrect.");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-c2b-cream px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <Logo className="h-20 w-auto mb-6" />
          <span className="pastille mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-c2b-gold" /> Espace client
          </span>
          <h1 className="titre text-[38px]">
            Votre suivi,
            <em className="block">au macro près.</em>
          </h1>
        </div>

        <form onSubmit={seConnecter} className="carte p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-c2b-muted mb-2">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="champ"
              placeholder="vous@exemple.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-c2b-muted mb-2">
              Mot de passe
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className="champ"
              placeholder="••••••••"
            />
          </div>

          {erreur && <p className="text-red-700 text-sm">{erreur}</p>}

          <button type="submit" disabled={chargement} className="btn-primary w-full py-4">
            {chargement ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <p className="text-center text-[13px] text-c2b-muted mt-5">
          Pas encore de compte ?{" "}
          <a href="https://wa.me/212660831640" target="_blank" rel="noreferrer" className="font-semibold text-c2b-green underline-offset-2 hover:underline">
            Écrivez-nous sur WhatsApp
          </a>
        </p>
        <p className="text-center font-display tracking-[3px] text-c2b-green/40 mt-8">Prêt · Sain · Maîtrisé</p>
      </div>
    </div>
  );
}
