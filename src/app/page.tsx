import { redirect } from "next/navigation";
import { lireSession } from "@/lib/session";

export default async function Home() {
  const session = await lireSession();
  if (!session?.client) redirect("/login");
  redirect(session.client.est_admin ? "/admin/clients" : "/dashboard");
}
