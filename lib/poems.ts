import fs from "node:fs";
import path from "node:path";
import { tokenizePoem, type Poem } from "./tokenize";
import { CATEGORIES, type Category } from "./categories";

const POEMS_DIR = path.join(process.cwd(), "poems");

export { CATEGORIES, type Category };

export interface PoemSummary {
  id: string;
  title: string;
  wordCount: number;
  category: Category;
}

interface PoemFile {
  id: string;
  category: Category;
  slug: string;
  filePath: string;
}

function poemFiles(): PoemFile[] {
  const files: PoemFile[] = [];
  for (const { key: category } of CATEGORIES) {
    const dir = path.join(POEMS_DIR, category);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith(".txt")) continue;
      const slug = f.replace(/\.txt$/, "");
      files.push({
        id: `${category}--${slug}`,
        category,
        slug,
        filePath: path.join(dir, f),
      });
    }
  }
  return files;
}

function findPoemFile(id: string): PoemFile | undefined {
  return poemFiles().find((f) => f.id === id);
}

export function getPoems(): PoemSummary[] {
  return poemFiles().map(({ id, category, filePath }) => {
    const raw = fs.readFileSync(filePath, "utf-8");
    const poem = tokenizePoem(id, raw);
    return { id, title: poem.title, wordCount: poem.words.length, category };
  });
}

export function getPoem(id: string): Poem {
  const file = findPoemFile(id);
  if (!file) throw new Error(`unknown poem id: ${id}`);
  const raw = fs.readFileSync(file.filePath, "utf-8");
  return tokenizePoem(id, raw);
}

export function isValidPoemId(id: string): boolean {
  return Boolean(findPoemFile(id));
}
