"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, Keyboard } from "lucide-react";

type ModeScan = "qr" | "code_barres";

const FORMATS: Record<ModeScan, Html5QrcodeSupportedFormats[]> = {
  qr: [Html5QrcodeSupportedFormats.QR_CODE],
  code_barres: [
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.CODE_128,
  ],
};

function creerLecteur(elementId: string, mode: ModeScan) {
  return new Html5Qrcode(elementId, {
    verbose: false,
    formatsToSupport: FORMATS[mode],
    // Détecteur natif du navigateur (Chrome/Android) : bien plus fiable que
    // le décodage JavaScript sur les codes-barres produits.
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  });
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
  const idVideo = `scanner-video-${mode}`;
  const idPhoto = `scanner-photo-${mode}`;
  const lecteurRef = useRef<Html5Qrcode | null>(null);
  const termineRef = useRef(false);
  const [cameraIndisponible, setCameraIndisponible] = useState(false);
  const [analysePhoto, setAnalysePhoto] = useState(false);
  const [erreurPhoto, setErreurPhoto] = useState<string | null>(null);
  const [saisie, setSaisie] = useState("");

  function terminer(texte: string) {
    if (termineRef.current) return;
    termineRef.current = true;
    arreterCamera().finally(() => onResult(texte.trim()));
  }

  async function arreterCamera() {
    const lecteur = lecteurRef.current;
    lecteurRef.current = null;
    if (lecteur?.isScanning) {
      await lecteur.stop().catch(() => {});
    }
  }

  useEffect(() => {
    const lecteur = creerLecteur(idVideo, mode);
    lecteurRef.current = lecteur;

    lecteur
      .start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: (largeur, hauteur) =>
            mode === "code_barres"
              ? { width: Math.floor(largeur * 0.9), height: Math.floor(hauteur * 0.45) }
              : {
                  width: Math.floor(Math.min(largeur, hauteur) * 0.7),
                  height: Math.floor(Math.min(largeur, hauteur) * 0.7),
                },
          videoConstraints: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        (texte) => terminer(texte),
        () => {}
      )
      .catch(() => setCameraIndisponible(true));

    return () => {
      arreterCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sur iPhone la lecture en direct est peu fiable : une photo nette prise
  // avec l'appareil photo natif (autofocus, pleine résolution) se décode
  // beaucoup mieux.
  async function surPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;

    setErreurPhoto(null);
    setAnalysePhoto(true);
    await arreterCamera();

    try {
      const texte = await creerLecteur(idPhoto, mode).scanFile(fichier, false);
      terminer(texte);
    } catch {
      setErreurPhoto(
        "Code illisible sur cette photo. Rapprochez-vous pour que le code remplisse l'image, bien net et sans reflet."
      );
    } finally {
      setAnalysePhoto(false);
    }
  }

  return (
    <div className="space-y-3">
      {!cameraIndisponible ? (
        <div id={idVideo} className="rounded-xl overflow-hidden bg-black min-h-[200px]" />
      ) : (
        <p className="text-xs text-center text-c2b-green/70 bg-white rounded-lg p-3">
          Caméra en direct indisponible. Utilisez la photo ci-dessous.
        </p>
      )}
      <div id={idPhoto} className="hidden" />

      <p className="text-xs text-center text-c2b-green/60">
        {mode === "code_barres"
          ? "Placez le code-barres à l'horizontale dans le cadre."
          : "Visez le QR code de l'étiquette Chef2Box."}
      </p>

      <label className="flex items-center justify-center gap-2 w-full rounded-lg bg-c2b-green text-c2b-cream py-2.5 text-sm font-medium cursor-pointer">
        <Camera size={18} />
        {analysePhoto ? "Analyse de la photo..." : "Ça ne lit pas ? Prendre une photo du code"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={surPhoto}
          disabled={analysePhoto}
        />
      </label>
      {erreurPhoto && <p className="text-xs text-center text-red-700">{erreurPhoto}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (saisie.trim()) terminer(saisie);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Keyboard size={16} className="absolute left-3 top-2.5 text-c2b-green/40" />
          <input
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            inputMode={mode === "code_barres" ? "numeric" : "text"}
            placeholder={mode === "code_barres" ? "Ou tapez les chiffres du code" : "Ou tapez le code du plat"}
            className="w-full rounded-lg border border-c2b-green/20 pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <button type="submit" className="rounded-lg border border-c2b-green/20 px-3 text-sm text-c2b-green">
          OK
        </button>
      </form>

      <button
        onClick={() => {
          termineRef.current = true;
          arreterCamera().finally(onClose);
        }}
        className="w-full rounded-lg border border-c2b-green/20 py-2 text-sm text-c2b-green"
      >
        Annuler
      </button>
    </div>
  );
}
