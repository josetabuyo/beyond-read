import { getPoems } from "@/lib/poems";
import PoemSelector from "@/components/PoemSelector";

export default function Home() {
  const poems = getPoems();
  return <PoemSelector poems={poems} />;
}
