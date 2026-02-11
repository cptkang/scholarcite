
import React, { useState, useRef, useMemo } from 'react';
import { processCitations } from './services/geminiService';
import { AppStatus, CitationResult, SavedCitation, JournalGrade, CitationStyle, RevisionMode, Reference } from './types';
import { generateENW, downloadFile } from './utils/enwGenerator';
import { generateEvidenceMD, generateEvidenceDoc } from './utils/exportEvidence';

// pdfjs-dist import (via CDN)
import * as pdfjsLib from 'https://esm.sh/pdfjs-dist@4.10.38';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.mjs';

type AppMode = 'SENTENCE' | 'PDF' | 'COMPARE' | 'RESOURCES';

/**
 * 인용 태그를 제거한 텍스트 반환 (체크박스 해제된 인용들을 본문에서 실시간 제거)
 */
const getFilteredCitedText = (citedText: string, references: Reference[]) => {
  let filteredText = citedText;
  
  references.forEach(ref => {
    if (!ref.isSelected && ref.citationTag) {
      const tag = ref.citationTag.trim();
      if (tag) {
        filteredText = filteredText.split(tag).join("");
      }
    }
  });

  return filteredText
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/\(\s*,\s*/g, '(')
    .replace(/,\s*\)/g, ')')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s+([.,])/g, '$1')
    .trim();
};

const getWordDiff = (oldStr: string, newStr: string) => {
  if (!oldStr || !newStr) return <span>{newStr || ""}</span>;
  const stripHtml = (html: string) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || "";
  };
  const cleanOld = stripHtml(oldStr);
  const cleanNew = stripHtml(newStr);
  
  const oldWords = cleanOld.split(/(\s+)/);
  const newWords = cleanNew.split(/(\s+)/);
  
  return newWords.map((word, i) => {
    if (word.trim() === "") return <span key={i}>{word}</span>;
    if (oldWords.includes(word)) {
      return <span key={i} className="text-slate-600">{word}</span>;
    } else {
      return <span key={i} className="bg-emerald-100 text-emerald-900 font-bold px-1 rounded mx-0.5 border-b-2 border-emerald-400">{word}</span>;
    }
  });
};

const App: React.FC = () => {
  const [activeMode, setActiveMode] = useState<AppMode>('SENTENCE');
  const [paragraphs, setParagraphs] = useState<string[]>([]); 
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<JournalGrade>('SCI');
  const [selectedStyle, setSelectedStyle] = useState<CitationStyle>('APA');
  const [selectedRevisionMode, setSelectedRevisionMode] = useState<RevisionMode>('REFINE');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [savedCitations, setSavedCitations] = useState<SavedCitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedSessionTimestamp, setSelectedSessionTimestamp] = useState<number | null>(null);
  
  const inputRef = useRef<HTMLDivElement>(null);

  const activeSession = useMemo(() => {
    if (!selectedSessionTimestamp) return savedCitations[0] || null;
    return savedCitations.find(s => s.timestamp === selectedSessionTimestamp) || savedCitations[0] || null;
  }, [selectedSessionTimestamp, savedCitations]);

  const journalGrades: { label: string; value: JournalGrade }[] = [
    { label: 'SCI/E (글로벌 우수)', value: 'SCI' },
    { label: 'Q1 (상위 25%)', value: 'Q1' },
    { label: 'Q2 (상위 50%)', value: 'Q2' },
    { label: 'KCI (국내 등재)', value: 'KCI' },
    { label: 'SCOPUS', value: 'SCOPUS' },
    { label: '전체 검색', value: 'ALL' },
  ];

  const citationStyles: { label: string; value: CitationStyle }[] = [
    { label: 'APA 7th (사회과학)', value: 'APA' },
    { label: 'IEEE (공학/기술)', value: 'IEEE' },
    { label: 'Vancouver (의학)', value: 'Vancouver' },
    { label: 'Chicago (인문/학술)', value: 'Chicago' },
    { label: 'MLA (어문학)', value: 'MLA' },
  ];

  const handleSetUserApiKey = async () => {
    try {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      setError(null);
    } catch (err) {
      console.error("Failed to open key selector:", err);
    }
  };

  const handleCiteAction = async () => {
    const inputText = inputRef.current?.innerHTML || "";
    if (!inputText.trim()) return;

    setStatus(AppStatus.SEARCHING);
    setError(null);
    try {
      const data = await processCitations(inputText, selectedGrade, selectedStyle, selectedRevisionMode, 'ALL');
      const newCitation = { ...data, timestamp: Date.now() };
      setSavedCitations(prev => [newCitation, ...prev]);
      setSelectedSessionTimestamp(newCitation.timestamp);
      setStatus(AppStatus.COMPLETED);
    } catch (err: any) {
      setError(err.message || '분석 중 오류가 발생했습니다.');
      setStatus(AppStatus.ERROR);
    }
  };

  const processFile = async (file: File) => {
    setStatus(AppStatus.UPLOADING);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n\n';
      }
      const paras = fullText.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 40);
      setParagraphs(paras);
      setActiveMode('PDF');
      setStatus(AppStatus.IDLE);
    } catch (err) {
      setError('PDF 처리 중 오류가 발생했습니다.');
      setStatus(AppStatus.ERROR);
    }
  };

  const toggleReferenceSelection = (sessionTimestamp: number, refId: number) => {
    setSavedCitations(prev => prev.map(session => {
      if (session.timestamp === sessionTimestamp) {
        return {
          ...session,
          references: session.references.map(ref => 
            ref.id === refId ? { ...ref, isSelected: !ref.isSelected } : ref
          )
        };
      }
      return session;
    }));
  };

  const handleExportResources = (format: 'MD' | 'DOC', scope: 'SELECTED' | 'ALL') => {
    let targets = scope === 'SELECTED' ? (activeSession ? [activeSession] : []) : savedCitations;
    const filteredTargets = targets.map(t => ({
      ...t,
      references: t.references.filter(r => r.isSelected)
    })).filter(t => t.references.length > 0);

    if (filteredTargets.length === 0) return;
    if (format === 'MD') {
      const md = generateEvidenceMD(filteredTargets);
      downloadFile(md, `Evidence_${scope}_${Date.now()}.md`, 'text/markdown');
    } else {
      const doc = generateEvidenceDoc(filteredTargets);
      downloadFile(doc, `Evidence_${scope}_${Date.now()}.doc`, 'application/msword');
    }
  };

  const menuItems = [
    { id: 'SENTENCE' as AppMode, label: '문장 및 표 분석 인용 생성', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
    { id: 'PDF' as AppMode, label: 'PDF 파일 단위 인용 정리', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'COMPARE' as AppMode, label: '기존 내용과 수정 내용 비교', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { id: 'RESOURCES' as AppMode, label: '인용 논문 원문 증거 리스트', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  ];

  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      <style>{`
        .academic-output table { border-collapse: collapse; width: 100%; margin: 1.5rem 0; font-family: sans-serif; font-style: normal; }
        .academic-output th, .academic-output td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; font-size: 0.95rem; }
        .academic-output th { background-color: #f8fafc; font-weight: 700; color: #1e293b; }
        .academic-input table { border-collapse: collapse; margin: 20px 0; width: 100%; }
        .academic-input th, .academic-input td { border: 1px solid #cbd5e1; padding: 12px; text-align: left; font-family: sans-serif; font-size: 0.95rem; font-style: normal; }
        .academic-input th { background-color: #f8fafc; font-weight: 700; }
        .academic-input:empty:before { content: attr(data-placeholder); color: #94a3b8; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>

      {/* Sidebar */}
      <aside className="w-80 bg-slate-900 flex flex-col border-r border-slate-800 shadow-2xl z-50 overflow-hidden">
        <div className="p-8 shrink-0">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
            </div>
            <h1 className="text-xl font-black text-white italic tracking-tighter uppercase">ScholarCite <span className="text-indigo-400 text-xs">AI</span></h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 custom-scrollbar space-y-10 pb-20">
          <nav className="space-y-3">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveMode(item.id)}
                className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-sm font-bold transition-all duration-300 text-left ${activeMode === item.id ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={item.icon} /></svg>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="bg-slate-800/50 rounded-2xl p-6 space-y-5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Workspace Settings</p>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">인용 생성 모드</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setSelectedRevisionMode('REFINE')} className={`px-3 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all border ${selectedRevisionMode === 'REFINE' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300'}`}>재구성+인용</button>
                  <button onClick={() => setSelectedRevisionMode('KEEP')} className={`px-3 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all border ${selectedRevisionMode === 'KEEP' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300'}`}>원본유지+인용</button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">인용 스타일</label>
                <select value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value as CitationStyle)} className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 transition-colors">
                  {citationStyles.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">논문 검색 등급</label>
                <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value as JournalGrade)} className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 transition-colors">
                  {journalGrades.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
            </div>
          </div>
          
          <button onClick={handleSetUserApiKey} className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl text-[10px] font-black bg-slate-800 text-amber-400 border border-amber-400/20 hover:bg-amber-400 hover:text-slate-900 transition-all uppercase tracking-widest">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
            내 전용 API 키 사용
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-10 shrink-0">
          <div className="flex items-center gap-4">
             <span className="text-sm font-black text-slate-900 uppercase tracking-widest">{menuItems.find(i => i.id === activeMode)?.label}</span>
             <div className="h-4 w-px bg-slate-200"></div>
             <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${status === AppStatus.IDLE ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600 animate-pulse'}`}>
               {status}
             </span>
          </div>
          {activeMode === 'PDF' && (
            <label className="cursor-pointer bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-black hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12"/></svg>
              Upload New PDF
              <input type="file" className="hidden" accept=".pdf" onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />
            </label>
          )}
          {activeMode === 'RESOURCES' && savedCitations.length > 0 && (
            <div className="flex gap-2">
               <div className="relative group">
                 <button className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12"/></svg>
                   Export Selection
                 </button>
                 <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-slate-200 rounded-2xl shadow-2xl opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all z-[100] overflow-hidden">
                    <button onClick={() => handleExportResources('MD', 'SELECTED')} className="w-full px-6 py-4 text-left text-[10px] font-bold text-slate-700 hover:bg-slate-50 border-b border-slate-100">As Markdown (.md)</button>
                    <button onClick={() => handleExportResources('DOC', 'SELECTED')} className="w-full px-6 py-4 text-left text-[10px] font-bold text-slate-700 hover:bg-slate-50">As Word (.doc)</button>
                 </div>
               </div>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {activeMode === 'SENTENCE' && (
            <div className="flex-1 flex gap-8 p-10 overflow-hidden min-h-0">
              <div className="w-1/2 flex flex-col min-h-0">
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50 flex-1 flex flex-col min-h-0 overflow-hidden">
                  <div className="p-10 pb-4 border-b border-slate-50 flex items-center justify-between shrink-0">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Input Area</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-10 min-h-0 custom-scrollbar">
                    <div ref={inputRef} contentEditable data-placeholder="연구 초안이나 표 데이터를 입력하세요..." className="w-full outline-none text-lg font-serif italic text-slate-800 academic-input min-h-[200px]" />
                  </div>
                  <div className="p-10 pt-0 shrink-0">
                    <button onClick={handleCiteAction} disabled={status === AppStatus.SEARCHING} className={`w-full py-6 rounded-3xl text-white font-black text-lg shadow-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-4 ${selectedRevisionMode === 'REFINE' ? 'bg-indigo-600 shadow-indigo-600/30 hover:bg-indigo-700' : 'bg-emerald-600 shadow-emerald-600/30 hover:bg-emerald-700'}`}>
                      {status === AppStatus.SEARCHING ? '학술 검색 엔진 가동 중...' : '분석 및 인용 생성'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="w-1/2 overflow-y-auto space-y-8 pr-4 custom-scrollbar min-h-0">
                {savedCitations.map((res) => (
                  <ResultCard key={res.timestamp} res={res} />
                ))}
                {savedCitations.length === 0 && <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50 uppercase font-black text-xs tracking-widest">분석 대기 중</div>}
              </div>
            </div>
          )}

          {activeMode === 'RESOURCES' && (
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* History List */}
              <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/30">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Analysis History</p>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {savedCitations.map((session) => (
                    <button
                      key={session.timestamp}
                      onClick={() => setSelectedSessionTimestamp(session.timestamp)}
                      className={`w-full text-left p-6 border-b border-slate-50 transition-all ${activeSession?.timestamp === session.timestamp ? 'bg-indigo-50 border-r-4 border-r-indigo-500 shadow-inner' : 'hover:bg-slate-50'}`}
                    >
                      <div className="text-[9px] font-black text-slate-400 uppercase mb-2">{new Date(session.timestamp).toLocaleString()}</div>
                      <div className="text-xs font-bold text-slate-800 line-clamp-2 leading-relaxed">
                        {session.originalText.replace(/<[^>]*>/g, '').substring(0, 80)}...
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Detail Evidence Selection */}
              <div className="flex-1 overflow-y-auto p-12 bg-slate-50/30 custom-scrollbar">
                {activeSession ? (
                  <div className="max-w-5xl mx-auto space-y-12">
                    <div className="pb-8 border-b-2 border-slate-200">
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Academic Evidence Selection</h2>
                        <p className="text-sm text-slate-500 mt-2">인용을 유지할 논문만 체크하세요. 선택 해제 시 본문에서 해당 인용 태그가 즉시 제거됩니다.</p>
                    </div>

                    <div className="grid gap-12">
                      {activeSession.references.length > 0 ? activeSession.references.map((ref, idx) => (
                        <div key={idx} className={`bg-white rounded-[3rem] border-2 p-12 shadow-sm transition-all duration-500 relative ${ref.isSelected ? 'border-indigo-100' : 'border-slate-100 opacity-50 grayscale'}`}>
                          <div className="flex flex-col gap-10">
                             <div className="flex items-start justify-between">
                                <div className="flex items-start gap-8">
                                   <div className="pt-2">
                                     <input 
                                       type="checkbox" 
                                       checked={ref.isSelected} 
                                       onChange={() => toggleReferenceSelection(activeSession.timestamp, ref.id)}
                                       className="w-10 h-10 rounded-2xl border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shadow-sm"
                                     />
                                   </div>
                                   <div className="space-y-4">
                                      <div className="flex items-center gap-3">
                                         <span className="bg-slate-900 text-white text-[9px] font-black px-4 py-1.5 rounded-xl italic tracking-widest shadow-md">REF #{ref.id}</span>
                                         <h3 className="text-3xl font-bold text-slate-900 tracking-tight leading-tight max-w-2xl">{ref.title}</h3>
                                      </div>
                                      <p className="text-base font-medium text-slate-500 italic pl-1">{ref.authors} ({ref.year}) • {ref.journal} • <span className="text-indigo-600 font-black">[{ref.grade}]</span></p>
                                   </div>
                                </div>
                                <a href={ref.url} target="_blank" rel="noopener noreferrer" className="bg-slate-50 p-6 rounded-3xl text-slate-300 hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                                   <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                                </a>
                             </div>

                             {/* 핵심 영역: 원문 증거 및 단락 문맥 */}
                             <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                <div className="space-y-5">
                                   <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2 pl-2">
                                      <div className="w-2 h-2 bg-emerald-600 rounded-full shadow-sm"></div> 교정본에 삽입된 내용 (Applied in Result)
                                   </label>
                                   <div className="bg-emerald-50/40 p-10 rounded-[2.5rem] border border-emerald-100 text-slate-800 font-serif leading-relaxed text-lg min-h-[160px] shadow-sm">
                                      {ref.relatedCitedSentence || '문장 추출 불가'}
                                   </div>
                                </div>
                                
                                <div className="space-y-5">
                                   <div className="flex items-center justify-between px-2">
                                     <label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                                        <div className="w-2 h-2 bg-indigo-500 rounded-full shadow-sm"></div> 실제 논문 내 원문 근거 (Verified Original Evidence)
                                     </label>
                                     <span className="text-[10px] font-black bg-indigo-600 text-white px-4 py-1 rounded-full uppercase tracking-widest italic shadow-lg">{ref.sourceSection}</span>
                                   </div>
                                   <div className="bg-indigo-50/40 p-10 rounded-[2.5rem] border border-indigo-100 text-slate-800 italic font-serif leading-relaxed text-lg min-h-[160px] shadow-sm">
                                      "{ref.originalSourceSentence}"
                                   </div>
                                </div>
                             </div>
                             
                             {/* 단락 문맥 (Original Context) */}
                             <div className="space-y-5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 pl-2">
                                   <div className="w-2 h-2 bg-slate-300 rounded-full"></div> 논문 내 단락 전체 문맥 (Source Paragraph Context)
                                </label>
                                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 text-slate-500 text-sm italic leading-relaxed max-h-64 overflow-y-auto custom-scrollbar shadow-sm">
                                   {ref.sourceParagraph || '단락 정보를 가져올 수 없습니다.'}
                                </div>
                             </div>

                             <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white flex items-center justify-between shadow-2xl relative overflow-hidden group/card">
                                <div className="flex items-start gap-6 relative z-10 flex-1">
                                   <div className="mt-1 bg-indigo-500/20 p-3 rounded-2xl shadow-inner">
                                     <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                   </div>
                                   <div>
                                      <span className="text-[9px] font-black uppercase text-indigo-400 tracking-widest block mb-2">Academic Validation Protocol</span>
                                      <p className="text-base text-slate-300 italic font-medium leading-relaxed">{ref.citationReason}</p>
                                   </div>
                                </div>
                                <div className="flex items-center gap-4 relative z-10">
                                   <span className="text-[10px] font-black bg-white/10 px-4 py-2 rounded-xl">Target Tag: {ref.citationTag}</span>
                                   <button onClick={() => { navigator.clipboard.writeText(ref.originalSourceSentence || ""); alert('원문이 복사되었습니다.'); }} className="shrink-0 bg-white/5 hover:bg-white/10 p-5 rounded-3xl transition-all border border-white/5 shadow-inner">
                                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2"/></svg>
                                   </button>
                                </div>
                             </div>
                          </div>
                        </div>
                      )) : (
                        <div className="py-40 text-center text-slate-400 font-black text-sm uppercase tracking-widest italic border-2 border-dashed border-slate-200 rounded-[3rem]">
                           No verifiable evidence found for this session.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center space-y-4">
                     <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Select an analysis session from the left history to manage evidence.</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {activeMode === 'PDF' && (
             <div className="flex-1 flex overflow-hidden min-h-0">
               <div className="w-1/3 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
                 <div className="p-6 border-b border-slate-100 bg-slate-50/30 shrink-0">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PDF Content Selection</p>
                 </div>
                 <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                   {paragraphs.map((para, idx) => (
                     <div key={idx} onClick={() => setSelectedText(para)} className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${selectedText === para ? 'bg-indigo-50 border-indigo-400 shadow-md' : 'bg-white border-slate-100 hover:border-indigo-200'}`}>
                       <p className="text-sm text-slate-600 line-clamp-4 leading-relaxed font-serif">{para}</p>
                     </div>
                   ))}
                 </div>
                 {selectedText && <div className="p-6 bg-white border-t border-indigo-100 shrink-0"><button onClick={() => { if (inputRef.current) inputRef.current.innerText = selectedText; handleCiteAction(); }} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-sm shadow-xl">분석 및 인용 생성</button></div>}
               </div>
               <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
                  {savedCitations.map((res) => <ResultCard key={res.timestamp} res={res} />)}
               </div>
             </div>
          )}

          {activeMode === 'COMPARE' && (
            <div className="flex-1 p-10 overflow-y-auto custom-scrollbar min-h-0">
              <div className="grid gap-12 max-w-7xl mx-auto">
                {savedCitations.map((res) => (
                  <div key={res.timestamp} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden flex flex-col min-h-[500px]">
                    <div className="grid grid-cols-2 divide-x divide-slate-100 flex-1">
                      <div className="p-10 space-y-4 flex flex-col min-h-0 bg-slate-50/50">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Original Input</label>
                        <div className="p-8 bg-white border rounded-[2rem] text-base text-slate-500 font-serif italic leading-relaxed overflow-y-auto flex-1 academic-output" dangerouslySetInnerHTML={{ __html: res.originalText }} />
                      </div>
                      <div className="p-10 space-y-4 flex flex-col min-h-0 bg-white">
                        <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Final Selection (Refined)</label>
                        <div className="p-10 bg-indigo-50/30 border border-indigo-100 rounded-[2.5rem] text-xl text-slate-900 font-serif leading-relaxed overflow-y-auto flex-1 academic-output">
                          <div dangerouslySetInnerHTML={{ __html: getFilteredCitedText(res.citedText, res.references) }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="h-10 bg-white border-t border-slate-100 px-10 flex items-center justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">
           <div>ScholarCite AI Platinum v7.5.0 • Strict Evidence Verification Engine</div>
           <div className="flex gap-4"><span>Sessions: {savedCitations.length}</span><span>Active Selection: {savedCitations.reduce((a, c) => a + (c.references?.filter(r => r.isSelected).length || 0), 0)}</span></div>
        </footer>
      </main>

      {error && (
        <div className="fixed bottom-10 right-10 bg-red-600 text-white px-8 py-5 rounded-3xl shadow-2xl flex items-start gap-4 z-[100] animate-in slide-in-from-bottom-5 border-b-4 border-red-800 max-w-sm">
          <p className="font-black text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="font-bold">×</button>
        </div>
      )}
    </div>
  );
};

/**
 * 메인 문장 분석 화면에서 보여지는 결과 카드
 */
const ResultCard: React.FC<{res: SavedCitation}> = ({res}) => {
  const filteredText = useMemo(() => getFilteredCitedText(res.citedText, res.references), [res.citedText, res.references]);
  const activeReferences = useMemo(() => res.references.filter(r => r.isSelected), [res.references]);

  return (
    <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm hover:shadow-2xl transition-all duration-500 animate-in slide-in-from-right-5 overflow-hidden">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-4 py-1.5 rounded-full border border-indigo-100 shadow-sm">Analysis Result</span>
          <span className="text-[9px] font-black text-slate-300">{new Date(res.timestamp).toLocaleTimeString()}</span>
        </div>
        <button onClick={() => {
            const content = generateENW(activeReferences);
            downloadFile(content, `citation_${res.timestamp}.enw`, 'text/plain');
        }} className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-emerald-700 transition-colors">Export .ENW</button>
      </div>
      
      <div className="mb-10 relative group">
         <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-[2rem] blur opacity-5"></div>
         <div className="relative bg-white p-10 rounded-[2rem] border border-slate-100 shadow-xl min-h-[100px] text-xl font-serif text-slate-900 leading-relaxed academic-output" dangerouslySetInnerHTML={{ __html: filteredText || "결과 생성 중 오류가 발생했거나 근거를 찾지 못했습니다." }} />
      </div>

      <div className="pt-8 border-t border-slate-100 space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Evidence Verification Summary ({activeReferences.length})</div>
          <div className="flex gap-2">
            <span className="text-[8px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-tighter">Verified Sources</span>
          </div>
        </div>
        
        <div className="space-y-4">
          {activeReferences.length > 0 ? activeReferences.map((ref, idx) => (
            <div key={idx} className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 hover:bg-white hover:border-indigo-200 transition-all group">
              <div className="flex items-center justify-between mb-2">
                 <div className="flex items-center gap-3">
                   <span className="text-[9px] font-black bg-slate-200 text-slate-600 px-2 py-0.5 rounded uppercase tracking-tighter shadow-sm">{ref.sourceSection}</span>
                   <h4 className="text-base font-bold text-slate-900 leading-tight line-clamp-1">{ref.title}</h4>
                 </div>
                 <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-1 rounded shadow-sm italic">{ref.citationTag}</span>
              </div>
              <p className="text-[11px] text-slate-500 italic mb-4">{ref.authors} ({ref.year})</p>
              
              {/* 원문 근거 표시 (항상 보여줌) */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 text-[11px] text-slate-600 italic leading-relaxed border-l-4 border-l-indigo-400 shadow-sm">
                <span className="block text-[8px] font-black text-indigo-400 uppercase mb-2">Original Paper Evidence:</span>
                "{ref.originalSourceSentence}"
              </div>
            </div>
          )) : (
            <div className="p-8 text-center text-slate-400 text-[10px] font-black uppercase tracking-widest bg-slate-100 rounded-[2rem] border border-dashed border-slate-200">
               No verifiable evidence selected for this result.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
