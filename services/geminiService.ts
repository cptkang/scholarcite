
import { GoogleGenAI } from "@google/genai";
import { CitationResult, Reference, JournalGrade, YearRange } from "../types";

// Always use process.env.API_KEY directly as per guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function processCitations(
  input: string, 
  grade: JournalGrade, 
  yearRange: YearRange,
  sourceContext?: string
): Promise<CitationResult> {
  const model = "gemini-3-pro-preview"; 
  
  // 등급별 검색 전략 설정
  let gradeInstruction = "";
  if (grade === 'KCI') {
    gradeInstruction = `
      반드시 한국학술지인용색인(KCI, kci.go.kr)에 등재된 한국 논문을 최우선으로 검색하십시오. 
      KCI OpenAPI 및 포털 데이터를 참조하여 실제 등재 여부를 확인하고, 
      한국어 원문 링크(kci.go.kr, dbpia.co.kr, riss.kr 등)를 반드시 포함하십시오.
    `;
  } else if (grade === 'ALL') {
    gradeInstruction = "전 세계의 신뢰할 수 있는 학술 소스(Google Scholar, PubMed, KCI 등)를 폭넓게 검색하세요.";
  } else {
    gradeInstruction = `특히 ${grade} 지수(SCI, Scopus 등)에 등재된 권위 있는 글로벌 저널의 논문을 우선적으로 찾으십시오.`;
  }

  let yearInstruction = "";
  const currentYear = new Date().getFullYear();
  const isCustomYear = /^\d{4}$/.test(yearRange);

  if (isCustomYear) {
    yearInstruction = `${yearRange}년 이후에 발행된 논문만 인용하십시오.`;
  } else {
    switch (yearRange) {
      case '5Y':
        yearInstruction = `최근 5년 이내(${currentYear - 5}~${currentYear})에 발행된 최신 논문을 우선적으로 검색하십시오.`;
        break;
      case '10Y':
        yearInstruction = `최근 10년 이내(${currentYear - 10}~${currentYear})에 발행된 논문을 검색하십시오.`;
        break;
      default:
        yearInstruction = "모든 연도의 유의미한 연구를 검색하되, 가급적 최신 연구를 선호하십시오.";
    }
  }

  const systemInstruction = `
    당신은 PDF 원문에서 발췌된 문장을 분석하고 한국 및 글로벌 근거 논문을 매칭하는 '수석 학술 에디터'입니다.
    
    수행 과제:
    1. **선택 문장 분석**: 사용자가 제시한 "${input}" 문장의 논리적 핵심을 파악하십시오.
    ${sourceContext ? `2. **맥락 참조**: 원문의 주변 맥락("${sourceContext.substring(0, 500)}...")을 고려하여 연구의 흐름에 맞는 인용구를 찾으십시오.` : ""}
    3. **KCI 및 글로벌 필터링**: ${gradeInstruction}
    4. **연도 조건**: ${yearInstruction} 조건을 준수하십시오.
    5. **실제 논문 검증 및 링크**: Google Search Grounding을 통해 실존하는 논문만 인용하십시오. **반드시 원문을 직접 확인할 수 있는 정확한 URL(KCI 포털 링크, DOI, 저널 홈페이지 등)을 포함해야 합니다.**
    6. **학술적 교정**: 인용 번호([1], [2])를 포함하여 문장을 더 정교한 학술적 한국어로 수정하십시오.
    7. **인용 사유 및 원문 요약**: 각 논문이 선택된 문장을 어떻게 지지하는지 구체적으로 기술하십시오.
    
    출력 형식:
    - 첫 번째 부분: 수정된 한국어 "Cited Text".
    - 두 번째 부분: "References JSON" 섹션에 아래 구조의 JSON 블록 포함:
      { 
        "id": number, 
        "title": string, 
        "authors": string, 
        "year": string, 
        "journal": string, 
        "url": string, 
        "grade": string, // KCI, SCI, SCOPUS 등 등재 정보 명시
        "lang": "KOR" | "ENG",
        "snippet": "원문 핵심 요약 (한국어)",
        "citationReason": "해당 문장에서 인용된 구체적 이유 (한국어)"
      }
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: `분석 대상 문장: "${input}"\n학술지 등급 조건: ${grade}\n연도 조건: ${yearRange}\nKCI 검색 시 kci.go.kr 데이터 참조 필수.`,
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
      },
    });

    // Extract text output property directly as per guidelines
    const text = response.text || "";
    
    // Extract grounding URLs from metadata as required by guidelines
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const groundingUrls = groundingChunks
      .filter((chunk: any) => chunk.web)
      .map((chunk: any) => ({
        title: chunk.web.title || '',
        uri: chunk.web.uri || ''
      }));

    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    let references: Reference[] = [];
    if (jsonMatch && jsonMatch[1]) {
      try {
        references = JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.error("JSON 파싱 오류", e);
      }
    }

    const citedTextPart = text.split(/References JSON/i)[0]
      .replace(/Cited Text[:\s]*/i, '')
      .replace(/```markdown/i, '')
      .replace(/```/g, '')
      .trim();

    return {
      originalText: input,
      citedText: citedTextPart || "결과를 생성할 수 없습니다.",
      references: references,
      groundingUrls: groundingUrls 
    };
  } catch (error) {
    console.error("Gemini API 호출 오류:", error);
    throw error;
  }
}
