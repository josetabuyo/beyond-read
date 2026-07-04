import fs from "node:fs";
import path from "node:path";
import { tokenizePoem, type Poem } from "./tokenize";

const POEMS_DIR = path.join(process.cwd(), "poems");

export interface PoemSummary {
  id: string;
  title: string;
  wordCount: number;
}

function poemIds(): string[] {
  return fs
    .readdirSync(POEMS_DIR)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => f.replace(/\.txt$/, ""))
    .sort();
}

export function getPoems(): PoemSummary[] {
  return poemIds().map((id) => {
    const poem = getPoem(id);
    return { id, title: poem.title, wordCount: poem.words.length };
  });
}

export function getPoem(id: string): Poem {
  const filePath = path.join(POEMS_DIR, `${id}.txt`);
  const raw = fs.readFileSync(filePath, "utf-8");
  return tokenizePoem(id, raw);
}

export function isValidPoemId(id: string): boolean {
  return poemIds().includes(id);
}
