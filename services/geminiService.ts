
import { GoogleGenAI } from "@google/genai";
import { CitationResult, Reference, JournalGrade, YearRange, CitationStyle } from "../types";

export async function processCitations(
  input: string, 
  grade: JournalGrade, 
  style: CitationStyle,
  yearRange: YearRange,
  sourceContext?: string
): Promise<CitationResult> {
  // 429 오류 완화를 위해 Flash 모델 사용
  const modelName = "gemini-3-flash-preview"; 
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const gradeInstructions: Record<JournalGrade, string> = {
    'KCI': "반드시 한국학술지인용색인(KCI) 등재지를 최우선으로 검색하세요.",
    'SCI': "Web of Science(SCI, SCIE) 등재 저널 논문만 인용하십시오.",
    'Q1': "JCR 상위 25% 이내(Q1) 최상위 저널의 논문을 사용하십시오.",
    'Q2': "JCR 상위 50% 이내(Q2 이상) 우수 저널을 타겟팅하십시오.",
    'SCOPUS': "SCOPUS 등재 논문을 활용하십시오.",
    'ALL': "신뢰할 수 있는 학술적 출처를 폭넓게 검색하십시오."
  };

  const styleInstructions: Record<CitationStyle, string> = {
    'APA': "본문 내 인용은 반드시 (저자, 연도) 형식을 사용하십시오. 예: (Hong, 2024).",
    'IEEE': "본문 내 인용은 반드시 [1]과 같은 대괄호 번호 형식을 사용하십시오.",
    'Vancouver': "본문 내 인용은 (1) 또는 상첨자 번호를 사용하십시오.",
    'Chicago': "본문 내 인용은 (저자 연도) 형식을 사용하십시오.",
    'MLA': "본문 내 인용은 (저자) 형식을 사용하십시오."
  };

  const systemInstruction = `
    당신은 전 세계 학술 논문의 인용 및 교정을 담당하는 수석 에디터입니다. 
    사용자가 제공한 텍스트 또는 '표(Table)' 데이터를 분석하고, Google Scholar 검색을 통해 실존하는 가장 적절한 논문을 찾아 내용을 '학술적으로 재구성'하십시오.

    [핵심 요구사항]
    1. 데이터 분석: 입력값에 표(Table)나 수치 데이터가 포함된 경우, 해당 수치의 의미를 해석하고 이를 뒷받침할 수 있는 학술적 근거(논문)를 찾으십시오.
    2. 문장 및 표 재구성: 입력된 내용의 의미를 유지하되, 전문적인 한국어 문체로 다시 쓰십시오. 
       **만약 입력이 표 형식이거나 결과가 데이터 비교를 포함한다면, 'Cited Text' 섹션에 HTML 표 태그(<table>, <tr>, <td> 등)를 사용하여 출력하십시오.**
    3. 언어 설정: 반드시 모든 'Cited Text'는 한국어(Korean)로 작성하십시오.
    4. 인용 스타일 엄수: 교정된 문장이나 표 내부의 적절한 위치에 [${style}] 스타일의 인용 표기를 삽입하십시오. (${styleInstructions[style]})
    5. 출력 구조: 
       - Cited Text: [교정된 한국어 문장 또는 HTML 표]
       - ---REFERENCES_START---
       - [JSON 데이터 배열]
    
    [JSON 데이터 스키마]
    [
      { 
        "id": 1, 
        "title": "논문 제목", 
        "authors": "대표 저자", 
        "year": "발행연도", 
        "journal": "학술지명", 
        "url": "실제 논문 URL", 
        "grade": "${grade}",
        "citationReason": "이 데이터나 문장을 인용하기에 적합한 학술적 근거"
      }
    ]
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `분석할 내용(텍스트 또는 표 데이터): "${input}"\n스타일: ${style}\n목표 등급: ${grade}`,
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
      },
    });

    const fullResponse = response.text || "";
    let citedText = "";
    let references: Reference[] = [];

    if (fullResponse.includes("---REFERENCES_START---")) {
      const parts = fullResponse.split("---REFERENCES_START---");
      citedText = parts[0].replace(/Cited Text[:\s]*/i, "").trim();
      const jsonPart = parts[1].match(/\[[\s\S]*\]/);
      if (jsonPart) try { references = JSON.parse(jsonPart[0]); } catch (e) {}
    } else {
      const jsonMatch = fullResponse.match(/\[\s*{[\s\S]*}\s*\]/);
      if (jsonMatch) {
        citedText = fullResponse.split(jsonMatch[0])[0].replace(/Cited Text[:\s]*/i, "").trim();
        try { references = JSON.parse(jsonMatch[0]); } catch (e) {}
      } else {
        citedText = fullResponse.replace(/Cited Text[:\s]*/i, "").trim();
      }
    }

    return {
      originalText: input,
      citedText: citedText || fullResponse,
      references: references,
      groundingUrls: response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title || "출처",
        uri: chunk.web?.uri || ""
      })) || []
    };
  } catch (error: any) {
    if (error?.message?.includes('429') || error?.status === 'RESOURCE_EXHAUSTED') {
      throw new Error("무료 API 할당량이 초과되었습니다. 사이드바 하단의 '내 전용 API 키 사용' 버튼을 클릭하여 개인 키를 등록해 주세요.");
    }
    console.error("Gemini API Error:", error);
    throw error;
  }
}
