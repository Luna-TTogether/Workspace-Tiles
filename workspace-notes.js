const MAX_NOTE_LENGTH = 10_000;
const CHECKLIST_LINE_PATTERN = /^(\s*-\s*\[)([ xX])(\])(.*)$/;

function normalizeNote(value) {
  if (typeof value !== "string") return "";
  return value.trim() ? value : "";
}

function normalizeCardFace(value) {
  return value === "note" ? "note" : "sites";
}

function parseNoteLines(note) {
  return String(note || "").split("\n").map((source, index) => {
    const match = source.match(CHECKLIST_LINE_PATTERN);
    if (!match) return { type: "text", index, source };
    return {
      type: "checklist",
      index,
      source,
      checked: match[2].toLowerCase() === "x",
      text: match[4].replace(/^\s/, ""),
    };
  });
}

function toggleChecklistLine(note, lineIndex, checked) {
  const lines = String(note || "").split("\n");
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) return String(note || "");
  const match = lines[lineIndex].match(CHECKLIST_LINE_PATTERN);
  if (!match) return String(note || "");
  lines[lineIndex] = `${match[1]}${checked ? "x" : " "}${match[3]}${match[4]}`;
  return lines.join("\n");
}

export {
  MAX_NOTE_LENGTH,
  normalizeCardFace,
  normalizeNote,
  parseNoteLines,
  toggleChecklistLine,
};
