
export type JournalGrade = 'ALL' | 'SCI' | 'KCI' | 'SCOPUS' | 'Q1' | 'Q2';
export type CitationStyle = 'APA' | 'IEEE' | 'Vancouver' | 'Chicago' | 'MLA';
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
