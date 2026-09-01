import { AiChatPage } from "@/components/projects/ai-chat/ai-chat-page"

export default async function ProjectAiChatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <AiChatPage projectId={id} />
}
