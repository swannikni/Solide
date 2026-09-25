"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Flashlight, Keyboard, Loader2 } from "lucide-react";
import type { BarcodeDetector as Detecteur, BarcodeFormat } from "barcode-detector/ponyfill";

type ModeScan = "qr" | "code_barres";

const FORMATS: Record<ModeScan, BarcodeFormat[]> = {
  qr: ["qr_code"],
  code_barres: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
};

// Lecteur natif du navigateur quand il existe (Chrome sur Android), sinon
// ZXing compilé en WebAssembly (iPhone) : bien plus fiable que l'ancien
// décodage JavaScript. Le fichier .wasm est servi par l'appli (/zxing/).
async function creerDetecteur(mode: ModeScan): Promise<Detecteur> {
  const formats = FORMATS[mode];
  const Natif = (globalThis as { BarcodeDetector?: typeof Detecteur }).BarcodeDetector;
  if (Natif) {
    try {
      const geres = await Natif.getSupportedFormats();
      if (formats.every((f) => geres.includes(f))) return new Natif({ formats });
    } catch {
      // On passe à ZXing.
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({
    overrides: {
      locateFile: (chemin: string, prefixe: string) => (chemin.endsWith(".wasm") ? `/zxing/${chemin}` : prefixe + chemin),
    },
  });
  return new BarcodeDetector({ formats });
}

export function Scanner({
  mode,
  onResult,
  onClose,
}: {
  mode: ModeScan;
  onResult: (texte: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fluxRef = useRef<MediaStream | null>(null);
  const detecteurRef = useRef<Promise<Detecteur> | null>(null);
  const termineRef = useRef(false);
  const [etatCamera, setEtatCamera] = useState<"demarrage" | "active" | "indisponible">("demarrage");
  const [lampe, setLampe] = useState<{ possible: boolean; allumee: boolean }>({ possible: false, allumee: false });
  const [analysePhoto, setAnalysePhoto] = useState(false);
  const [erreurPhoto, setErreurPhoto] = useState<string | null>(null);
  const [saisie, setSaisie] = useState("");

  const detecteur = () => (detecteurRef.current ??= creerDetecteur(mode));

  function arreterCamera() {
    fluxRef.current?.getTracks().forEach((t) => t.stop());
    fluxRef.current = null;
  }

  function terminer(texte: string) {
    if (termineRef.current) return;
    termineRef.current = true;
    arreterCamera();
    navigator.vibrate?.(60);
    onResult(texte.trim());
  }

  useEffect(() => {
    let annule = false;
    let minuteur: ReturnType<typeof setTimeout> | undefined;

    async function demarrer() {
      try {
        const flux = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (annule) return flux.getTracks().forEach((t) => t.stop());
        fluxRef.current = flux;
        const piste = flux.getVideoTracks()[0];
        // Mise au point continue et lampe, quand le téléphone le permet.
        const capacites = (piste.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
          focusMode?: string[];
          torch?: boolean;
        };
        if (capacites.focusMode?.includes("continuous")) {
          piste.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
        }
        setLampe({ possible: !!capacites.torch, allumee: false });

        const video = videoRef.current!;
        video.srcObject = flux;
        await video.play();
        setEtatCamera("active");
      } catch {
        if (!annule) setEtatCamera("indisponible");
        return;
      }

      const lecteur = await detecteur().catch(() => null);
      if (!lecteur) return;
      const lire = async () => {
        if (annule || termineRef.current) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          try {
            const trouves = await lecteur.detect(video);
            const valeur = trouves.find((t) => t.rawValue)?.rawValue;
            if (valeur) return terminer(valeur);
          } catch {
            // Image pas prête : on réessaie.
          }
        }
        minuteur = setTimeout(lire, 120);
      };
      lire();
    }

    demarrer();
    return () => {
      annule = true;
      clearTimeout(minuteur);
      arreterCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function basculerLampe() {
    const piste = fluxRef.current?.getVideoTracks()[0];
    if (!piste) return;
    const allumee = !lampe.allumee;
    try {
      await piste.applyConstraints({ advanced: [{ torch: allumee } as MediaTrackConstraintSet] });
      setLampe({ possible: true, allumee });
    } catch {
      setLampe({ possible: false, allumee: false });
    }
  }

  // Photo nette (autofocus, pleine résolution) ou capture d'écran du code.
  async function surPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    setErreurPhoto(null);
    setAnalysePhoto(true);
    try {
      const lecteur = await detecteur();
      const image = await createImageBitmap(fichier);
      const trouves = await lecteur.detect(image);
      image.close();
      const valeur = trouves.find((t) => t.rawValue)?.rawValue;
      if (valeur) return terminer(valeur);
      setErreurPhoto("Aucun code trouvé sur cette image. Rapprochez-vous : le code doit être net et bien visible.");
    } catch {
      setErreurPhoto("Impossible de lire cette image. Réessayez avec une autre photo.");
    } finally {
      setAnalysePhoto(false);
    }
  }

  return (
    <div className="space-y-3">
      {etatCamera !== "indisponible" ? (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[20px] bg-black">
          <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
          {/* Cadre de visée */}
          <div
            className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-c2b-gold/90 shadow-[0_0_0_2000px_rgba(0,0,0,0.35)] ${
              mode === "code_barres" ? "h-[38%] w-[82%]" : "aspect-square h-[70%]"
            }`}
          />
          {etatCamera === "demarrage" && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
              <Loader2 className="mr-2 animate-spin" size={18} /> Ouverture de la caméra...
            </div>
          )}
          {lampe.possible && (
            <button
              onClick={basculerLampe}
              className={`absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full ${
                lampe.allumee ? "bg-c2b-gold text-c2b-green" : "bg-black/50 text-white"
              }`}
              aria-label={lampe.allumee ? "Éteindre la lampe" : "Allumer la lampe"}
            >
              <Flashlight size={18} />
            </button>
          )}
        </div>
      ) : (
        <p className="carte p-4 text-center text-sm text-c2b-muted">
          Caméra indisponible (autorisation refusée ?). Prenez une photo du code ou utilisez une capture d&apos;écran
          ci-dessous.
        </p>
      )}

      <p className="text-center text-xs text-c2b-muted">
        {mode === "code_barres"
          ? "Placez le code-barres dans le cadre, à 10-15 cm."
          : "Visez le QR code de l'étiquette Chef2Box."}
      </p>

      {/* Sans « capture » : le téléphone propose l'appareil photo, la photothèque
          (captures d'écran comprises) ou un fichier. */}
      <label className="btn-primary w-full cursor-pointer">
        {analysePhoto ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
        {analysePhoto ? "Lecture de l'image..." : "Photo ou capture d'écran du code"}
        <input type="file" accept="image/*" className="hidden" onChange={surPhoto} disabled={analysePhoto} />
      </label>
      {erreurPhoto && <p className="text-center text-xs font-semibold text-red-700">{erreurPhoto}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (saisie.trim()) terminer(saisie);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Keyboard size={16} className="absolute left-3.5 top-3.5 text-c2b-muted/60" />
          <input
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            inputMode={mode === "code_barres" ? "numeric" : "text"}
            placeholder={mode === "code_barres" ? "Ou tapez les chiffres du code" : "Ou le code sous le QR (C2B-…)"}
            className="champ pl-10"
          />
        </div>
        <button type="submit" className="btn-secondary px-5 py-2">
          OK
        </button>
      </form>

      <button
        onClick={() => {
          termineRef.current = true;
          arreterCamera();
          onClose();
        }}
        className="btn-secondary w-full"
      >
        Annuler
      </button>
    </div>
  );
}
