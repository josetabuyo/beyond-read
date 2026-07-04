export interface PoemWord {
  text: string;
  index: number;
  lineIndex: number;
  isLineEnd: boolean;
  isStanzaEnd: boolean;
}

export interface Poem {
  id: string;
  title: string;
  lines: PoemWord[][];
  words: PoemWord[];
}

export function tokenizePoem(id: string, raw: string): Poem {
  const rawLines = raw.replace(/\r\n/g, "\n").split("\n");

  let i = 0;
  while (i < rawLines.length && rawLines[i].trim() === "") i++;
  const title = (rawLines[i] ?? "").trim();
  i++;
  while (i < rawLines.length && rawLines[i].trim() === "") i++;

  const bodyRawLines = rawLines.slice(i);

  // Trim trailing blank lines so the poem doesn't end on a phantom stanza break.
  let end = bodyRawLines.length;
  while (end > 0 && bodyRawLines[end - 1].trim() === "") end--;
  const trimmed = bodyRawLines.slice(0, end);

  const lines: PoemWord[][] = [];
  let globalIndex = 0;
  let currentLineIndex = 0;
  let pendingStanzaBreak = false;

  for (const rawLine of trimmed) {
    if (rawLine.trim() === "") {
      pendingStanzaBreak = true;
      continue;
    }

    if (pendingStanzaBreak && lines.length > 0) {
      const prevLine = lines[lines.length - 1];
      const lastWord = prevLine[prevLine.length - 1];
      lastWord.isStanzaEnd = true;
    }
    pendingStanzaBreak = false;

    const tokens = rawLine.trim().split(/\s+/).filter(Boolean);
    const lineWords: PoemWord[] = tokens.map((text, tokenIdx) => ({
      text,
      index: globalIndex++,
      lineIndex: currentLineIndex,
      isLineEnd: tokenIdx === tokens.length - 1,
      isStanzaEnd: false,
    }));

    lines.push(lineWords);
    currentLineIndex++;
  }

  const words = lines.flat();

  return { id, title, lines, words };
}
