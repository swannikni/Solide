import { exigerSession } from "@/lib/session";
import { ProfilClient } from "@/app/(espace)/profil/ProfilClient";

export default async function ProfilPage() {
  const { client, email } = await exigerSession();

  return (
    <div className="min-h-screen pt-[68px] md:pt-20 pb-28 md:pb-10">
      <ProfilClient client={client} email={email} />
    </div>
  );
}
