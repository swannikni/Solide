"use client";

import { useEffect, useState } from "react";
import { Share, X, Download } from "lucide-react";

type EvenementInstallation = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const CLE = "c2b-installation-masquee";

// Encart discret qui propose d'ajouter l'appli à l'écran d'accueil.
export function InstallerAppli() {
  const [mode, setMode] = useState<"ios" | "android" | null>(null);
  const [evenement, setEvenement] = useState<EvenementInstallation | null>(null);

  useEffect(() => {
    const dejaInstallee =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let masquee = false;
    try {
      masquee = localStorage.getItem(CLE) === "1";
    } catch {}
    if (dejaInstallee || masquee) return;

    const ua = navigator.userAgent;
    const estIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (estIos) {
      setMode("ios");
      return;
    }
    const surPrompt = (e: Event) => {
      e.preventDefault();
      setEvenement(e as EvenementInstallation);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", surPrompt);
    return () => window.removeEventListener("beforeinstallprompt", surPrompt);
  }, []);

  function masquer() {
    try {
      localStorage.setItem(CLE, "1");
    } catch {}
    setMode(null);
  }

  async function installer() {
    if (!evenement) return;
    await evenement.prompt();
    await evenement.userChoice.catch(() => null);
    masquer();
  }

  if (!mode) return null;

  return (
    <div className="carte flex items-start gap-3 p-4 border-c2b-gold/30">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-xl flex-shrink-0" />
      <div className="flex-1 text-sm text-c2b-green">
        <p className="font-bold">Installez l&apos;appli sur votre téléphone</p>
        {mode === "ios" ? (
          <p className="text-c2b-muted mt-0.5">
            Touchez <Share size={14} className="inline -mt-1 text-c2b-green" /> Partager en bas de Safari, puis
            « Sur l&apos;écran d&apos;accueil ».
          </p>
        ) : (
          <button onClick={installer} className="btn-gold mt-2 px-4 py-2 text-sm">
            <Download size={15} /> Installer
          </button>
        )}
      </div>
      <button onClick={masquer} className="text-c2b-muted/60 flex-shrink-0" aria-label="Masquer">
        <X size={18} />
      </button>
    </div>
  );
}
