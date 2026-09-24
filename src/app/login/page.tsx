"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    <div className="min-h-screen flex items-center justify-center bg-c2b-cream px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-hand text-5xl text-c2b-green">
            Chef<span className="text-c2b-gold">2</span>Box
          </h1>
          <p className="text-c2b-green/70 mt-1 text-sm tracking-wide">
            Prêt. Sain. Maîtrisé.
          </p>
        </div>

        <form
          onSubmit={seConnecter}
          className="bg-white rounded-2xl shadow-sm p-6 space-y-4 border border-c2b-green/10"
        >
          <div>
            <label className="block text-sm font-medium text-c2b-green mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-c2b-green/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-c2b-gold"
              placeholder="vous@exemple.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-c2b-green mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              required
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className="w-full rounded-lg border border-c2b-green/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-c2b-gold"
              placeholder="••••••••"
            />
          </div>

          {erreur && <p className="text-red-600 text-sm">{erreur}</p>}

          <button
            type="submit"
            disabled={chargement}
            className="w-full bg-c2b-green text-c2b-cream rounded-lg py-2.5 font-medium hover:bg-c2b-green/90 disabled:opacity-60 transition"
          >
            {chargement ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <p className="text-center text-xs text-c2b-green/60 mt-4">
          Pas encore de compte ? Contactez Swann sur WhatsApp pour recevoir votre invitation.
        </p>
      </div>
    </div>
  );
}
