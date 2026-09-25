import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/questionnaire : reçoit les questionnaires envoyés depuis chef2box.com.
const PUBLIC_PATHS = ["/login", "/api/questionnaire", "/confidentialite", "/conditions"];

interface CookieAEcrire {
  name: string;
  value: string;
  options: CookieOptions;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieAEcrire[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims : vérifie le jeton sur place (clés asymétriques) au lieu d'un
  // aller-retour vers Supabase à chaque page ; rafraîchit la session si besoin.
  // En cas d'échec de cette vérification, on retombe sur getUser (aller-retour Auth).
  const { data, error } = await supabase.auth.getClaims();
  let user: { user_metadata?: Record<string, unknown> } | null = data?.claims ?? null;
  if (!user && error) user = (await supabase.auth.getUser()).data.user;

  const isPublic = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Après connexion, on revient là où on allait (ex. le QR d'une étiquette).
    const suite = request.nextUrl.pathname + request.nextUrl.search;
    if (suite !== "/") url.searchParams.set("suite", suite);
    return NextResponse.redirect(url);
  }

  // Compte créé par l'admin avec un code provisoire : le client choisit
  // son propre mot de passe avant d'aller plus loin.
  const chemin = request.nextUrl.pathname;
  if (user?.user_metadata?.doit_choisir_mdp && !isPublic && !chemin.startsWith("/bienvenue") && !chemin.startsWith("/api")) {
    const url = request.nextUrl.clone();
    url.pathname = "/bienvenue";
    url.search = "";
    const suite = chemin + request.nextUrl.search;
    if (suite !== "/") url.searchParams.set("suite", suite);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|webp|wasm)$).*)"],
};
