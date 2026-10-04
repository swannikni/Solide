// Mots de passe déjà piratés (fuites de données connues), vérifiés avec le
// service public « Pwned Passwords » de HaveIBeenPwned. Le mot de passe ne
// quitte jamais l'appareil : seuls les 5 premiers caractères de son empreinte
// SHA-1 sont envoyés (k-anonymat), la comparaison se fait ici.
// Service injoignable : on n'empêche pas le choix (pas de blocage à tort).
export async function motDePassePirate(motDePasse: string): Promise<boolean> {
  try {
    const octets = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(motDePasse));
    const empreinte = Array.from(new Uint8Array(octets), (o) => o.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    const res = await fetch(`https://api.pwnedpasswords.com/range/${empreinte.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const fin = empreinte.slice(5);
    return (await res.text()).split("\n").some((ligne) => {
      const [suffixe, nombre] = ligne.trim().split(":");
      return suffixe === fin && Number(nombre) > 0;
    });
  } catch {
    return false;
  }
}

export const MESSAGE_PIRATE =
  "Ce mot de passe apparaît dans des fuites de données connues : choisissez-en un autre, que vous n'utilisez nulle part ailleurs.";
