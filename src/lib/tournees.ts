// Tournées de livraison : répartition des arrêts entre livreurs, ordre de
// passage et estimation du temps. Sans service extérieur : distances à vol
// d'oiseau corrigées (les rues ne sont pas droites), vitesse moyenne et temps
// passé à chaque arrêt réglables.

export interface Point {
  lat: number;
  lng: number;
}

export interface Arret extends Point {
  cle: string;
  nom: string;
}

export interface Reglages {
  vitesseKmh: number; // vitesse moyenne en ville
  minutesParArret: number; // se garer, monter, remettre la boîte
}

export interface Tournee<A extends Arret = Arret> {
  arrets: A[];
  // Minutes écoulées depuis le départ à l'arrivée à chaque arrêt.
  arrivees: number[];
  distanceKm: number;
  dureeMin: number; // jusqu'au dernier arrêt, remise comprise
}

const DETOUR = 1.35; // distance réelle ≈ 1,35 × vol d'oiseau en ville

export function distanceKm(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Coordonnées dans un texte collé : « 31.63, -8.01 », lien Google Maps
// (…@31.63,-8.01…, ?q=31.63,-8.01, !3d31.63!4d-8.01) ou position WhatsApp.
export function lireCoordonnees(texte: string): Point | null {
  const t = decodeURIComponent(texte.trim());
  const motifs = [
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query|ll|destination|daddr|center)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /^(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)$/,
  ];
  for (const m of motifs) {
    const r = t.match(m);
    if (r) {
      const lat = Number(r[1]);
      const lng = Number(r[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

function minutesTrajet(km: number, r: Reglages) {
  return ((km * DETOUR) / Math.max(r.vitesseKmh, 5)) * 60;
}

// Ordre de passage d'un groupe : plus proche voisin depuis le départ, puis
// amélioration « 2-opt » (on décroise les trajets). Parcours sans retour.
function ordonner<A extends Arret>(depart: Point, arrets: A[]): A[] {
  if (arrets.length <= 2) {
    return [...arrets].sort((a, b) => distanceKm(depart, a) - distanceKm(depart, b));
  }
  const restants = [...arrets];
  const ordre: A[] = [];
  let courant: Point = depart;
  while (restants.length) {
    let meilleur = 0;
    for (let i = 1; i < restants.length; i++) {
      if (distanceKm(courant, restants[i]) < distanceKm(courant, restants[meilleur])) meilleur = i;
    }
    courant = restants.splice(meilleur, 1)[0];
    ordre.push(courant as A);
  }
  const point = (i: number): Point => (i < 0 ? depart : ordre[i]);
  let ameliore = true;
  for (let passe = 0; ameliore && passe < 50; passe++) {
    ameliore = false;
    for (let i = 0; i < ordre.length - 1; i++) {
      for (let j = i + 1; j < ordre.length; j++) {
        const avant = distanceKm(point(i - 1), ordre[i]) + (j + 1 < ordre.length ? distanceKm(ordre[j], ordre[j + 1]) : 0);
        const apres = distanceKm(point(i - 1), ordre[j]) + (j + 1 < ordre.length ? distanceKm(ordre[i], ordre[j + 1]) : 0);
        if (apres + 1e-9 < avant) {
          ordre.splice(i, j - i + 1, ...ordre.slice(i, j + 1).reverse());
          ameliore = true;
        }
      }
    }
  }
  return ordre;
}

// Temps et distance d'un parcours dans l'ordre donné.
export function mesurer<A extends Arret>(depart: Point, arrets: A[], r: Reglages): Tournee<A> {
  let km = 0;
  let minutes = 0;
  let precedent: Point = depart;
  const arrivees: number[] = [];
  for (const a of arrets) {
    const d = distanceKm(precedent, a);
    km += d * DETOUR;
    minutes += minutesTrajet(d, r);
    arrivees.push(minutes);
    minutes += r.minutesParArret;
    precedent = a;
  }
  return { arrets, arrivees, distanceKm: km, dureeMin: minutes };
}

// Répartition entre livreurs par secteurs autour du départ (comme des parts
// de gâteau), en cherchant le découpage où la plus longue tournée est la plus
// courte possible. Puis ordre de passage dans chaque secteur.
export function planifier<A extends Arret>(depart: Point, arrets: A[], nbLivreurs: number, r: Reglages): Tournee<A>[] {
  const k = Math.max(1, Math.min(nbLivreurs, arrets.length || 1));
  if (arrets.length === 0) return Array.from({ length: k }, () => mesurer(depart, [] as A[], r));
  const angle = (a: Point) => Math.atan2(a.lat - depart.lat, (a.lng - depart.lng) * Math.cos((depart.lat * Math.PI) / 180));
  const tries = [...arrets].sort((a, b) => angle(a) - angle(b));
  let meilleur: Tournee<A>[] | null = null;
  let pire = Infinity;
  for (let debut = 0; debut < tries.length; debut++) {
    const tour = [...tries.slice(debut), ...tries.slice(0, debut)];
    // Découpages possibles en k parts contiguës (tailles proches, ±2).
    const base = Math.floor(tour.length / k);
    const essais: number[][] = [];
    const generer = (reste: number, parts: number[]) => {
      if (parts.length === k - 1) {
        if (reste >= 0) essais.push([...parts, reste]);
        return;
      }
      for (let t = Math.max(0, base - 2); t <= Math.min(reste, base + 2); t++) generer(reste - t, [...parts, t]);
    };
    generer(tour.length, []);
    for (const tailles of essais) {
      let i = 0;
      const tournees = tailles.map((t) => {
        const groupe = tour.slice(i, (i += t));
        return mesurer(depart, ordonner(depart, groupe), r);
      });
      const max = Math.max(...tournees.map((t) => t.dureeMin));
      if (max < pire - 1e-6) {
        pire = max;
        meilleur = tournees;
      }
    }
  }
  return meilleur!;
}

// Lien(s) Google Maps d'une tournée. L'appli mobile accepte 9 étapes
// intermédiaires : au-delà, l'itinéraire est découpé en plusieurs liens.
export function liensGoogleMaps(depart: Point, arrets: Point[]): string[] {
  const c = (p: Point) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  const liens: string[] = [];
  let origine = depart;
  for (let i = 0; i < arrets.length; i += 10) {
    const morceau = arrets.slice(i, i + 10);
    const destination = morceau[morceau.length - 1];
    const etapes = morceau.slice(0, -1).map(c).join("|");
    const params = new URLSearchParams({ api: "1", origin: c(origine), destination: c(destination), travelmode: "driving" });
    if (etapes) params.set("waypoints", etapes);
    liens.push(`https://www.google.com/maps/dir/?${params.toString()}`);
    origine = destination;
  }
  return liens;
}

export const lienPoint = (p: Point) => `https://maps.google.com/?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

export function heure(depart: string, minutes: number) {
  const [h, m] = depart.split(":").map(Number);
  const total = Math.round((h || 0) * 60 + (m || 0) + minutes);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function duree(minutes: number) {
  const m = Math.round(minutes);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}
