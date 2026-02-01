
import { Reference } from "../types";

/**
 * Generates an EndNote Import Format (.enw) string.
 * %0 Type (Journal Article)
 * %T Title
 * %A Author
 * %D Year
 * %J Journal
 * %U URL
 */
export function generateENW(references: Reference[]): string {
  let enwContent = "";

  references.forEach((ref) => {
    enwContent += "%0 Journal Article\n";
    enwContent += `%T ${ref.title}\n`;
    enwContent += `%A ${ref.authors}\n`;
    enwContent += `%D ${ref.year}\n`;
    enwContent += `%J ${ref.journal}\n`;
    enwContent += `%U ${ref.url}\n`;
    enwContent += "\n"; // Blank line between records
  });

  return enwContent;
}

export function downloadFile(content: string, fileName: string, contentType: string) {
  const a = document.createElement("a");
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}
