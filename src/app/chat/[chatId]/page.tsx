import { notFound } from "next/navigation";
import { ChatScreen } from "@/components/ChatScreen";
import { getChats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: PageProps<"/chat/[chatId]">) {
  const { chatId } = await params;
  const chats = await getChats();
  const chat = chats.find((c) => c.id === Number(chatId));
  if (!chat) notFound();
  return <ChatScreen chats={chats} chat={chat} />;
}
