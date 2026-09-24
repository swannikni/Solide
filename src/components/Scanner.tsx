"use client";

import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

export function Scanner({
  onResult,
  onClose,
}: {
  onResult: (texte: string) => void;
  onClose: () => void;
}) {
  const conteneurId = "chef2box-scanner";
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(conteneurId);
    scannerRef.current = scanner;
    let arrete = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (texteDecode) => {
          if (arrete) return;
          arrete = true;
          scanner.stop().catch(() => {});
          onResult(texteDecode);
        },
        () => {
          // callback d'échec image par image : ignoré, normal tant qu'aucun
          // code n'est dans le cadre.
        }
      )
      .catch(() => {
        onClose();
      });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div id={conteneurId} className="rounded-xl overflow-hidden bg-black" />
      <p className="text-xs text-center text-c2b-green/60">
        Visez l'étiquette ou le code-barres avec votre caméra.
      </p>
      <button
        onClick={onClose}
        className="w-full rounded-lg border border-c2b-green/20 py-2 text-sm text-c2b-green"
      >
        Annuler
      </button>
    </div>
  );
}
