import { notFound } from "next/navigation";
import { getPoem, isValidPoemId } from "@/lib/poems";
import ReaderStage from "@/components/ReaderStage";

export default async function ReadPage({
  params,
}: {
  params: Promise<{ poemId: string }>;
}) {
  const { poemId } = await params;
  if (!isValidPoemId(poemId)) notFound();

  const poem = getPoem(poemId);
  return <ReaderStage poem={poem} />;
}
