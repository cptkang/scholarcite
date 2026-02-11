
export type JournalGrade = 'ALL' | 'SCI' | 'KCI' | 'SCOPUS' | 'Q1' | 'Q2';
export type CitationStyle = 'APA' | 'IEEE' | 'Vancouver' | 'Chicago' | 'MLA';
export type RevisionMode = 'REFINE' | 'KEEP';
export type YearRange = string;

export interface Reference {
  id: number;
  title: string;
  authors: string;
  year: string;
  journal: string;
  url: string;
  grade?: string;
  lang?: 'KOR' | 'ENG';
  snippet?: string;
  citationReason?: string;
  relatedCitedSentence?: string;  
  originalSourceSentence?: string; 
  sourceParagraph?: string;        
  sourceSection?: string;          
  isSelected?: boolean;            // 사용자가 해당 인용을 사용할지 여부
  citationTag?: string;           // 본문 내 삽입된 실제 인용 표식 (예: [1], (Lee, 2024))
}

export interface CitationResult {
  originalText: string;
  citedText: string;
  references: Reference[];
  groundingUrls: { title: string; uri: string }[];
}

export interface SavedCitation extends CitationResult {
  timestamp: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  SEARCHING = 'SEARCHING',
  SYNCING_DOCS = 'SYNCING_DOCS',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface GoogleDocsStatus {
  paperDocId: string | null;
  citationDocId: string | null;
  isSynced: boolean;
}
