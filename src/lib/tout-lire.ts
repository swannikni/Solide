// Le serveur Supabase renvoie au plus 1000 lignes par requête : on lit par
// pages jusqu'au bout. La requête doit avoir un ordre stable (ex. .order("id")).
type Page<T> = { range(de: number, a: number): PromiseLike<{ data: T[] | null; error: unknown }> };

export async function toutLire<T>(requete: () => Page<T>, taille = 1000): Promise<{ data: T[] }> {
  const tout: T[] = [];
  for (let de = 0; de < 200000; de += taille) {
    const { data, error } = await requete().range(de, de + taille - 1);
    if (error || !data) break;
    tout.push(...data);
    if (data.length < taille) break;
  }
  return { data: tout };
}
