import { redirect } from "next/navigation";
import { getChats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [first] = await getChats();
  if (!first) {
    return (
      <main className="flex h-full items-center justify-center p-6 text-center text-tg-muted">
        База пуста. Импортируйте экспорт: <code className="ml-1">npm run import -- backup/result.json</code>
      </main>
    );
  }
  redirect(`/chat/${first.id}`);
}
