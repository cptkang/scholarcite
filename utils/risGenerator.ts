
import { Reference } from "../types";

export function generateRIS(references: Reference[]): string {
  let risContent = "";

  references.forEach((ref) => {
    risContent += "TY  - JOUR\n";
    risContent += `TI  - ${ref.title}\n`;
    risContent += `AU  - ${ref.authors}\n`;
    risContent += `PY  - ${ref.year}\n`;
    risContent += `JO  - ${ref.journal}\n`;
    risContent += `UR  - ${ref.url}\n`;
    risContent += "ER  - \n\n";
  });

  return risContent;
}

export function downloadFile(content: string, fileName: string, contentType: string) {
  const a = document.createElement("a");
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}
