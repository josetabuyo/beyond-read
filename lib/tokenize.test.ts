import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tokenizePoem } from "./tokenize";

describe("tokenizePoem", () => {
  it("extracts the title from the first line", () => {
    const poem = tokenizePoem("t", "El número\n\nGuardé tu número\ncomo quien guarda una llave.");
    expect(poem.title).toBe("El número");
  });

  it("keeps punctuation attached to words", () => {
    const poem = tokenizePoem("t", "Título\n\nHola, mundo.");
    expect(poem.words.map((w) => w.text)).toEqual(["Hola,", "mundo."]);
  });

  it("marks stanza breaks at blank lines", () => {
    const poem = tokenizePoem(
      "t",
      "Título\n\nPrimera linea\nsegunda linea\n\nTercera linea",
    );
    const secondLineLastWord = poem.words.find((w) => w.text === "linea" && w.lineIndex === 1);
    expect(secondLineLastWord?.isStanzaEnd).toBe(true);

    const firstLineLastWord = poem.words.find((w) => w.text === "linea" && w.lineIndex === 0);
    expect(firstLineLastWord?.isStanzaEnd).toBe(false);
  });

  it("does not create a phantom stanza break from trailing blank lines", () => {
    const poem = tokenizePoem("t", "Título\n\nUltima linea\n\n\n");
    const last = poem.words[poem.words.length - 1];
    expect(last.isStanzaEnd).toBe(false);
  });

  it("parses the real poem files without throwing and assigns sequential indices", () => {
    const poemsDir = path.join(process.cwd(), "poems");
    for (const file of fs.readdirSync(poemsDir)) {
      if (!file.endsWith(".txt")) continue;
      const raw = fs.readFileSync(path.join(poemsDir, file), "utf-8");
      const poem = tokenizePoem(file, raw);
      expect(poem.title.length).toBeGreaterThan(0);
      expect(poem.words.length).toBeGreaterThan(0);
      poem.words.forEach((w, i) => expect(w.index).toBe(i));
    }
  });
});
