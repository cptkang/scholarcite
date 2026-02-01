
import { Reference } from "../types";

/**
 * 시뮬레이션: 구글 독스 생성
 */
export async function createGoogleDoc(title: string, content: string): Promise<string> {
  console.log(`구글 독스 생성 중: ${title}`);
  await new Promise(resolve => setTimeout(resolve, 1500));
  return `mock-doc-id-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateDocFormat(original: string, cited: string, references: Reference[]): string {
  let docContent = `# 학술 논문 초안\n\n`;
  docContent += `## 1. 원본 소스 문구\n> ${original}\n\n`;
  docContent += `## 2. 인용이 포함된 교정 문구\n${cited}\n\n`;
  docContent += `## 3. 참고문헌 리스트 (원문 링크 확인 가능)\n`;
  
  references.forEach(ref => {
    docContent += `[${ref.id}] ${ref.authors} (${ref.year}). "${ref.title}". ${ref.journal}.\n`;
    docContent += `    검증 링크: ${ref.url}\n\n`;
  });
  
  return docContent;
}

export function generateCitationDocFormat(references: Reference[]): string {
  let docContent = `# 인용 참고문헌 및 증거 자료\n\n`;
  docContent += `본 문서는 사용된 인용의 학술적 무결성을 증명하기 위한 자료입니다.\n\n`;
  
  references.forEach(ref => {
    docContent += `### 참고문헌 [${ref.id}]: ${ref.title}\n`;
    docContent += `- **저자**: ${ref.authors}\n`;
    docContent += `- **학술지**: ${ref.journal} (${ref.year})\n`;
    docContent += `- **소스 URL**: ${ref.url}\n`;
    docContent += `- **인용 사유**: ${ref.citationReason}\n`;
    docContent += `- **핵심 증거 (Snippet)**: "${ref.snippet}"\n\n`;
    docContent += `---\n\n`;
  });
  
  return docContent;
}
