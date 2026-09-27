"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Point } from "@/lib/tournees";

// Cartes de l'onglet Livraison (fond OpenStreetMap, sans clé) :
//  - CarteTournees : la cuisine et les arrêts numérotés, une couleur par
//    livreur, pour voir d'un coup d'œil une adresse mal placée ;
//  - ChoixSurCarte : on touche la carte (ou on glisse l'épingle) pour placer
//    une adresse exactement.

const MARRAKECH: Point = { lat: 31.6295, lng: -7.9811 };
const TUILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Leaflet touche à « window » : chargé seulement dans le navigateur.
function useLeaflet() {
  const [L, setL] = useState<typeof Leaflet | null>(null);
  useEffect(() => {
    import("leaflet").then((m) => setL(m.default ?? m)).catch(() => {});
  }, []);
  return L;
}

const pastille = (L: typeof Leaflet, texte: string, couleur: string, taille = 26) =>
  L.divIcon({
    className: "",
    iconSize: [taille, taille],
    iconAnchor: [taille / 2, taille / 2],
    html: `<div style="width:${taille}px;height:${taille}px;border-radius:50%;background:${couleur};color:#fff;font:700 12px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${texte}</div>`,
  });

const epingle = (L: typeof Leaflet) =>
  L.divIcon({
    className: "",
    iconSize: [30, 40],
    iconAnchor: [15, 38],
    html: `<svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 1C7.3 1 1 7.1 1 14.7 1 25 15 39 15 39s14-14 14-24.3C29 7.1 22.7 1 15 1z" fill="#b91c1c" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14.5" r="5" fill="#fff"/></svg>`,
  });

const echapper = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface GroupeCarte {
  couleur: string;
  nom: string;
  arrets: (Point & { cle: string; nom: string })[];
}

export function CarteTournees({ depart, groupes }: { depart: Point; groupes: GroupeCarte[] }) {
  const L = useLeaflet();
  const boite = useRef<HTMLDivElement>(null);
  const carte = useRef<Leaflet.Map | null>(null);
  const calque = useRef<Leaflet.LayerGroup | null>(null);

  useEffect(() => {
    if (!L || !boite.current || carte.current) return;
    carte.current = L.map(boite.current, { zoomControl: true, attributionControl: true }).setView([depart.lat, depart.lng], 13);
    L.tileLayer(TUILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(carte.current);
    calque.current = L.layerGroup().addTo(carte.current);
    return () => {
      carte.current?.remove();
      carte.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L]);

  // Marqueurs redessinés à chaque changement (adresse, répartition, ordre).
  useEffect(() => {
    if (!L || !carte.current || !calque.current) return;
    calque.current.clearLayers();
    const points: Leaflet.LatLngExpression[] = [[depart.lat, depart.lng]];
    L.marker([depart.lat, depart.lng], { icon: pastille(L, "🏠", "#1c2e1e", 30), zIndexOffset: 1000 })
      .bindPopup("<b>Cuisine</b>")
      .addTo(calque.current);
    for (const g of groupes) {
      const trace: Leaflet.LatLngExpression[] = [[depart.lat, depart.lng]];
      g.arrets.forEach((a, k) => {
        trace.push([a.lat, a.lng]);
        points.push([a.lat, a.lng]);
        L.marker([a.lat, a.lng], { icon: pastille(L, String(k + 1), g.couleur) })
          .bindPopup(`<b>${k + 1}. ${echapper(a.nom)}</b><br>${echapper(g.nom)}`)
          .addTo(calque.current!);
      });
      L.polyline(trace, { color: g.couleur, weight: 3, opacity: 0.7, dashArray: "6 6" }).addTo(calque.current);
    }
    if (points.length > 1) carte.current.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 16 });
  }, [L, depart, groupes]);

  return <div ref={boite} className="h-[360px] w-full overflow-hidden rounded-2xl bg-c2b-cream" />;
}

// Placement d'une adresse à la main : l'épingle suit le doigt, puis on valide.
export function ChoixSurCarte({
  depart,
  point,
  onValider,
  onAnnuler,
}: {
  depart: Point | null;
  point: Point | null;
  onValider: (p: Point) => void;
  onAnnuler: () => void;
}) {
  const L = useLeaflet();
  const boite = useRef<HTMLDivElement>(null);
  const [choisi, setChoisi] = useState<Point | null>(point);

  useEffect(() => {
    if (!L || !boite.current) return;
    const centre = point ?? depart ?? MARRAKECH;
    const map = L.map(boite.current).setView([centre.lat, centre.lng], point ? 17 : 13);
    L.tileLayer(TUILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    if (depart) L.marker([depart.lat, depart.lng], { icon: pastille(L, "🏠", "#1c2e1e", 26), interactive: false }).addTo(map);
    let marqueur: Leaflet.Marker | null = null;
    const placer = (p: Point) => {
      if (!marqueur) {
        marqueur = L.marker([p.lat, p.lng], { icon: epingle(L), draggable: true }).addTo(map);
        marqueur.on("dragend", () => {
          const ll = marqueur!.getLatLng();
          setChoisi({ lat: ll.lat, lng: ll.lng });
        });
      } else marqueur.setLatLng([p.lat, p.lng]);
      setChoisi(p);
    };
    if (point) placer(point);
    map.on("click", (e: Leaflet.LeafletMouseEvent) => placer({ lat: e.latlng.lat, lng: e.latlng.lng }));
    return () => {
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L]);

  return (
    <div className="mt-2 space-y-2">
      <div ref={boite} className="h-[300px] w-full overflow-hidden rounded-2xl bg-c2b-cream" />
      <p className="text-[11px] text-c2b-muted">Touchez l&apos;endroit exact (zoomez avec deux doigts), ou glissez l&apos;épingle rouge.</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onAnnuler} className="rounded-full border border-c2b-green/15 bg-white py-2 text-sm font-bold text-c2b-green">
          Annuler
        </button>
        <button
          onClick={() => choisi && onValider(choisi)}
          disabled={!choisi}
          className="rounded-full bg-c2b-green py-2 text-sm font-bold text-c2b-cream disabled:opacity-40"
        >
          Valider ici
        </button>
      </div>
    </div>
  );
}
