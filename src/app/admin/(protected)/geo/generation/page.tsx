import { pageActor } from "@/lib/auth/page";
import { generationOptions } from "@/features/generation/service";
import { GenerationWorkspace } from "@/components/forms/GenerationWorkspace";
export const metadata = { title: "人工智能内容创作" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ task?: string; questionId?: string }>;
}) {
  const actor = await pageActor("generation.create");
  const query = await searchParams;
  const questionId = query.questionId?.slice(0, 64);
  return (
    <GenerationWorkspace
      initial={await generationOptions(actor, "", questionId)}
      taskId={query.task?.slice(0, 64)}
      initialQuestionId={questionId}
    />
  );
}
