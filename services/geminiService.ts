
import { GoogleGenAI } from "@google/genai";
import { CitationResult, Reference, JournalGrade, YearRange, CitationStyle, RevisionMode } from "../types";

export async function processCitations(
  input: string, 
  grade: JournalGrade, 
  style: CitationStyle,
  mode: RevisionMode,
  yearRange: YearRange,
  sourceContext?: string
): Promise<CitationResult> {
  const modelName = "gemini-3-flash-preview"; 
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const styleInstructions: Record<CitationStyle, string> = {
    'APA': "본문 내 인용은 반드시 (저자, 연도) 형식을 사용하십시오.",
    'IEEE': "본문 내 인용은 반드시 [1] 형식을 사용하십시오.",
    'Vancouver': "본문 내 인용은 번호 형식을 사용하십시오.",
    'Chicago': "본문 내 인용은 (저자 연도) 형식을 사용하십시오.",
    'MLA': "본문 내 인용은 (저자) 형식을 사용하십시오."
  };

  const systemInstruction = `
    당신은 전 세계 학계의 무결성을 수호하는 수석 학술 에디터입니다. 
    당신의 임무는 사용자의 입력을 분석하여 실존하는 학술적 근거를 바탕으로 문장을 교정하는 것입니다.

    [절대 규칙 - 무결성 보장]
    1. **근거 엄격성**: Google Search를 통해 인용하고자 하는 문장과 직접적으로 연관된 실존 논문의 '정확한 원문(Original Sentence)'을 찾아낸 경우에만 인용을 생성하십시오.
    2. **인용 생략**: 만약 적절한 실존 근거 문장을 찾지 못했거나, 근거가 불분명한 경우 해당 부분에는 **절대 인용을 삽입하지 마십시오.** (할루시네이션 방지)
    3. **원문 보존**: 'originalSourceSentence' 필드에는 반드시 논문 원본의 언어(주로 영어)로 된 실제 문장을 기입하십시오.
    4. **인용 태그**: 본문(Cited Text)에 삽입한 인용 표식(예: [1], (Lee, 2023) 등)을 'citationTag' 필드에 그대로 기입하여 시스템이 추후 필터링할 수 있도록 하십시오.

    [출력 형식]
    Cited Text: [인용이 포함된 교정된 한국어 문장/표]
    
    ---REFERENCES_START---
    [
      { 
        "id": 1, 
        "title": "실존하는 논문의 전체 제목", 
        "authors": "모든 주요 저자 리스트", 
        "year": "정확한 출판 연도", 
        "journal": "학술지 또는 컨퍼런스 명칭", 
        "url": "논문 원문을 확인할 수 있는 실제 URL", 
        "citationTag": "[1]", 
        "citationReason": "이 논문의 어떤 내용이 사용자 문장의 근거가 되는지에 대한 학술적 설명 (한국어)",
        "relatedCitedSentence": "당신이 작성한 'Cited Text' 중 이 논문이 담당하고 있는 구체적인 문장 (한국어)",
        "originalSourceSentence": "논문 본문에서 직접 발췌한 100% 실제 원문 문장 (원본 언어)",
        "sourceSection": "원문이 위치한 섹션 (예: INTRODUCTION, DISCUSSION, RESULTS 등)",
        "sourceParagraph": "원문 문장을 포함한 앞뒤 문맥이 담긴 단락 전체 (원본 언어)"
      }
    ]

    - 스타일: ${styleInstructions[style]}
    - 재구성 모드: ${mode === 'REFINE' ? "학술적 재구성 (Refine)" : "원본 유지 (Keep Original)"}
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `사용자 입력: "${input}"\n목표 등급: ${grade}\n스타일: ${style}`,
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
      },
    });

    const fullResponse = response.text || "";
    let citedText = "";
    let rawReferences: any[] = [];

    const extractJsonArray = (text: string) => {
      const firstBracket = text.indexOf('[');
      const lastBracket = text.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        return text.substring(firstBracket, lastBracket + 1);
      }
      return null;
    };

    if (fullResponse.includes("---REFERENCES_START---")) {
      const parts = fullResponse.split("---REFERENCES_START---");
      citedText = parts[0].replace(/Cited Text[:\s]*/i, "").trim();
      const jsonContent = extractJsonArray(parts[1]);
      if (jsonContent) {
        try { rawReferences = JSON.parse(jsonContent); } catch (e) { console.error(e); }
      }
    } else {
      const jsonContent = extractJsonArray(fullResponse);
      if (jsonContent) {
        citedText = fullResponse.split(jsonContent)[0].replace(/Cited Text[:\s]*/i, "").trim();
        try { rawReferences = JSON.parse(jsonContent); } catch (e) { console.error(e); }
      } else {
        citedText = fullResponse.trim();
      }
    }

    const references: Reference[] = Array.isArray(rawReferences) 
      ? rawReferences
        .filter(ref => ref.title && ref.originalSourceSentence && ref.citationTag)
        .map((ref: any) => ({
          ...ref,
          isSelected: true,
          id: ref.id || Math.floor(Math.random() * 1000)
        })) 
      : [];

    return {
      originalText: input,
      citedText: citedText || "분석 결과를 생성하지 못했습니다.",
      references: references,
      groundingUrls: []
    };
  } catch (error: any) {
    throw error;
  }
}
