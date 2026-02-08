
import React, { useState, useRef } from 'react';
import { processCitations } from './services/geminiService';
import { AppStatus, CitationResult, SavedCitation, JournalGrade, CitationStyle } from './types';
import { generateENW, downloadFile } from './utils/enwGenerator';

// pdfjs-dist import (via CDN)
import * as pdfjsLib from 'https://esm.sh/pdfjs-dist@4.10.38';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.mjs';

type AppMode = 'SENTENCE' | 'PDF' | 'COMPARE';

const getWordDiff = (oldStr: string, newStr: string) => {
  if (!oldStr || !newStr) return <span>{newStr}</span>;
  // HTML 태그 제거 후 텍스트 비교 (표가 포함된 경우를 대비)
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
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [savedCitations, setSavedCitations] = useState<SavedCitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLDivElement>(null);

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
      alert("API 키가 성공적으로 설정되었습니다. 이제 다시 시도해 주세요.");
    } catch (err) {
      console.error("Failed to open key selector:", err);
    }
  };

  const handleCiteAction = async () => {
    // innerHTML을 사용하여 표 구조까지 포함하여 전송 (필요시 innerText만 전송)
    const inputText = inputRef.current?.innerHTML || "";
    if (!inputText.trim()) return;

    setStatus(AppStatus.SEARCHING);
    setError(null);
    try {
      const data = await processCitations(inputText, selectedGrade, selectedStyle, 'ALL');
      setSavedCitations(prev => [{ ...data, timestamp: Date.now() }, ...prev]);
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

  const updateCitedText = (timestamp: number, newText: string) => {
    setSavedCitations(prev => prev.map(c => c.timestamp === timestamp ? { ...c, citedText: newText } : c));
  };

  const downloadEndNote = (res: SavedCitation) => {
    const content = generateENW(res.references);
    downloadFile(content, `citation_${res.timestamp}.enw`, 'text/plain');
  };

  const menuItems = [
    { id: 'SENTENCE' as AppMode, label: '문장 및 표 분석 인용 생성', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
    { id: 'PDF' as AppMode, label: 'PDF 파일 단위 수정 및 인용 정리', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'COMPARE' as AppMode, label: '기존 내용과 수정 내용 비교', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  ];

  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      {/* Global CSS for Table rendering */}
      <style>{`
        .academic-output table {
          border-collapse: collapse;
          width: 100%;
          margin: 1.5rem 0;
          font-family: sans-serif;
          font-style: normal;
        }
        .academic-output th, .academic-output td {
          border: 1px solid #e2e8f0;
          padding: 12px;
          text-align: left;
          font-size: 0.95rem;
        }
        .academic-output th {
          background-color: #f8fafc;
          font-weight: 700;
          color: #1e293b;
        }
        .academic-input table {
          border-collapse: collapse;
          margin: 20px 0;
          width: 100%;
        }
        .academic-input th, .academic-input td {
          border: 1px solid #cbd5e1;
          padding: 12px;
          text-align: left;
          font-family: sans-serif;
          font-size: 0.95rem;
          font-style: normal;
        }
        .academic-input th {
          background-color: #f8fafc;
          font-weight: 700;
        }
        .academic-input:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
        }
      `}</style>

      {/* Sidebar */}
      <aside className="w-80 bg-slate-900 flex flex-col border-r border-slate-800 shadow-2xl z-50">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
            </div>
            <h1 className="text-xl font-black text-white italic tracking-tighter uppercase">ScholarCite <span className="text-indigo-400 text-xs">AI</span></h1>
          </div>
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
        </div>
        <div className="mt-auto p-8 border-t border-slate-800 space-y-6">
           <div className="bg-slate-800/50 rounded-2xl p-6 space-y-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Workspace Settings</p>
              <div className="space-y-3">
                <select value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value as CitationStyle)} className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 transition-colors">
                  {citationStyles.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value as JournalGrade)} className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 transition-colors">
                  {journalGrades.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
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
        </header>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {activeMode === 'SENTENCE' && (
            <div className="flex-1 flex gap-8 p-10 overflow-hidden min-h-0">
              <div className="w-1/2 flex flex-col min-h-0">
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50 flex-1 flex flex-col min-h-0 overflow-hidden">
                  <div className="p-10 pb-4 border-b border-slate-50 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Input Area</p>
                      <span className="bg-emerald-50 text-emerald-600 text-[8px] font-black px-2 py-0.5 rounded border border-emerald-100 uppercase tracking-wider">Rich Text & Table Supported</span>
                    </div>
                    <span className="text-[9px] font-bold text-slate-300">Draft Source</span>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-10 min-h-0 custom-scrollbar">
                    <div 
                      ref={inputRef}
                      contentEditable
                      data-placeholder="분석할 문장이나 표(Table) 데이터를 이곳에 붙여넣으세요..."
                      className="w-full outline-none text-lg font-serif italic text-slate-800 academic-input min-h-[200px]"
                    />
                  </div>
                  
                  <div className="p-10 pt-0 shrink-0">
                    <button 
                      onClick={handleCiteAction}
                      disabled={status === AppStatus.SEARCHING}
                      className="w-full py-6 rounded-3xl bg-indigo-600 text-white font-black text-lg shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-4"
                    >
                      {status === AppStatus.SEARCHING && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                      {status === AppStatus.SEARCHING ? '학술 데이터 분석 중...' : '데이터 분석 및 한국어 인용 생성'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="w-1/2 overflow-y-auto space-y-8 pr-4 custom-scrollbar min-h-0">
                {savedCitations.map((res) => (
                  <ResultCard key={res.timestamp} res={res} onDownload={downloadEndNote} />
                ))}
                {savedCitations.length === 0 && (
                   <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50 space-y-4">
                      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      <p className="text-sm font-black uppercase tracking-widest">분석 대기 중</p>
                   </div>
                )}
              </div>
            </div>
          )}

          {activeMode === 'PDF' && (
            <div className="flex-1 flex overflow-hidden min-h-0">
              <div className="w-1/3 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex justify-between items-center shrink-0">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Extracted Paragraphs</p>
                   <span className="text-[9px] font-black bg-indigo-50 text-indigo-500 px-2 py-1 rounded-md">{paragraphs.length} Units</span>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                  {paragraphs.length > 0 ? paragraphs.map((para, idx) => (
                    <div key={idx} onClick={() => setSelectedText(para)} className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${selectedText === para ? 'bg-indigo-50 border-indigo-400 shadow-lg' : 'bg-white border-slate-100 hover:border-indigo-200'}`}>
                      <p className="text-sm text-slate-600 line-clamp-4 leading-relaxed font-serif">{para}</p>
                    </div>
                  )) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 py-20 text-center space-y-4">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12"/></svg>
                      <p className="text-xs font-bold uppercase tracking-widest">PDF를 업로드하여 <br/>분석을 시작하세요</p>
                    </div>
                  )}
                </div>
                {selectedText && (
                  <div className="p-6 bg-white border-t border-indigo-100 shadow-2xl shrink-0">
                    <button onClick={() => {
                      if (inputRef.current) inputRef.current.innerText = selectedText;
                      handleCiteAction();
                    }} disabled={status === AppStatus.SEARCHING} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20">
                      단락 분석 및 인용 생성
                    </button>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
                 {savedCitations.map((res) => (
                    <ResultCard key={res.timestamp} res={res} onDownload={downloadEndNote} />
                 ))}
              </div>
            </div>
          )}

          {activeMode === 'COMPARE' && (
            <div className="flex-1 p-10 overflow-y-auto custom-scrollbar min-h-0">
              <div className="grid gap-12 max-w-7xl mx-auto">
                {savedCitations.map((res) => (
                  <div key={res.timestamp} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
                    <div className="bg-slate-900 px-10 py-6 flex items-center justify-between">
                       <div className="flex items-center gap-6">
                          <div className="bg-indigo-500 text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest italic shadow-lg shadow-indigo-500/20">Academic Diff Engine</div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(res.timestamp).toLocaleString()}</span>
                       </div>
                       <button onClick={() => downloadEndNote(res)} className="text-[10px] font-black text-emerald-400 border border-emerald-400/30 px-5 py-2 rounded-xl hover:bg-emerald-400 hover:text-white transition-all uppercase flex items-center gap-2">
                         Export ENW
                       </button>
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-slate-100 min-h-[500px]">
                      <div className="p-10 space-y-10 bg-slate-50/50 overflow-hidden flex flex-col min-h-0">
                         <div className="space-y-4 flex flex-col min-h-0">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Original Draft/Data</label>
                            <div className="p-8 bg-white border border-slate-200 rounded-[2rem] text-base text-slate-500 font-serif italic leading-relaxed shadow-sm overflow-y-auto flex-1 academic-output" dangerouslySetInnerHTML={{ __html: res.originalText }}>
                            </div>
                         </div>
                         <div className="space-y-4 flex flex-col min-h-0">
                            <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Visual Comparison Analysis</label>
                            <div className="p-10 bg-indigo-50/30 border border-indigo-100 rounded-[2.5rem] text-xl text-slate-900 font-serif leading-relaxed shadow-sm overflow-y-auto flex-1">
                               {getWordDiff(res.originalText, res.citedText)}
                            </div>
                         </div>
                      </div>
                      <div className="p-10 flex flex-col space-y-6 bg-white min-h-0">
                        <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1">Refined Academic Text (Editable)</label>
                        <div className="flex-1 relative group overflow-hidden min-h-0">
                          <textarea value={res.citedText} onChange={(e) => updateCitedText(res.timestamp, e.target.value)} className="w-full h-full p-10 bg-slate-50/50 border-2 border-slate-100 rounded-[2.5rem] outline-none focus:border-indigo-400 focus:bg-white transition-all text-xl font-serif font-bold text-slate-900 leading-relaxed shadow-inner resize-none" />
                        </div>
                        <div className="flex justify-end gap-3 mt-4 shrink-0">
                           <button onClick={() => navigator.clipboard.writeText(res.citedText)} className="group flex items-center gap-3 text-[10px] font-black text-slate-600 bg-slate-100 px-6 py-4 rounded-2xl hover:bg-slate-200 transition-all uppercase active:scale-95">
                             Copy Final Text
                           </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="h-10 bg-white border-t border-slate-100 px-10 flex items-center justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">
           <div className="flex gap-6">
              <span>Grade: {selectedGrade}</span>
              <span>Style: {selectedStyle}</span>
              <span>Total: {savedCitations.length}</span>
           </div>
           <div>ScholarCite AI Platinum v6.9.2 • Korean Academic Engine</div>
        </div>
      </main>

      {error && (
        <div className="fixed bottom-10 right-10 bg-red-600 text-white px-8 py-5 rounded-[2rem] shadow-2xl flex items-start gap-4 animate-in slide-in-from-bottom-10 z-[100] max-w-md border-b-4 border-red-800">
          <div className="shrink-0 mt-1"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
          <div className="flex-1 space-y-3">
             <p className="font-black text-sm leading-tight">{error}</p>
             {error.includes('할당량') && <button onClick={handleSetUserApiKey} className="w-full py-2.5 bg-white text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-colors shadow-lg">개인 API 키 등록하기</button>}
          </div>
          <button onClick={() => setError(null)} className="shrink-0 hover:opacity-50 transition-opacity"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
      )}
    </div>
  );
};

const ResultCard: React.FC<{res: SavedCitation, onDownload: (res: SavedCitation) => void}> = ({res, onDownload}) => (
  <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm hover:shadow-2xl transition-all duration-500 animate-in slide-in-from-right-8 relative shrink-0 overflow-hidden">
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-4">
        <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-5 py-2 rounded-full border border-indigo-100 italic">Refined Academic Korean Text</span>
        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{new Date(res.timestamp).toLocaleTimeString()}</span>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => navigator.clipboard.writeText(res.citedText)} className="bg-slate-50 text-slate-400 p-3 rounded-2xl hover:bg-indigo-50 hover:text-indigo-600 transition-all border border-slate-100 active:scale-95"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg></button>
        <button onClick={() => onDownload(res)} className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 hover:scale-[1.02] transition-all active:scale-95 uppercase tracking-widest"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12"/></svg>EndNote</button>
      </div>
    </div>
    <div className="mb-12">
      <div className="relative group">
         <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-[2rem] blur opacity-10 group-hover:opacity-20 transition-opacity"></div>
         <div className="relative bg-white p-10 rounded-[2rem] border border-slate-100 shadow-xl selection:bg-indigo-600 selection:text-white">
            <div className="text-xl font-serif italic text-slate-900 leading-relaxed font-bold academic-output" dangerouslySetInnerHTML={{ __html: res.citedText }}></div>
         </div>
      </div>
    </div>
    <div className="pt-10 border-t border-slate-100 space-y-8">
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3"><svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/></svg>Scholar Evidence ({res.references.length})</span>
      <div className="grid gap-6">
        {res.references.map((ref, rIdx) => (
          <div key={rIdx} className="bg-slate-50/50 p-8 rounded-3xl border border-slate-100 flex items-start justify-between gap-8 hover:bg-white hover:border-indigo-200 transition-all group/ref hover:shadow-lg">
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-3 mb-1">
                 <div className="bg-slate-900 text-white text-[9px] font-black px-3 py-1 rounded-lg uppercase tracking-widest italic group-hover/ref:bg-indigo-600 transition-colors">Ref {ref.id}</div>
                 <p className="text-lg font-bold text-slate-900 leading-tight tracking-tight">{ref.title}</p>
              </div>
              <p className="text-xs text-slate-500 font-medium ml-1">{ref.authors} ({ref.year}) • <span className="italic font-bold text-slate-600">{ref.journal}</span> • <span className="font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded">[{ref.grade}]</span></p>
              <div className="mt-6 text-xs text-slate-500 leading-relaxed bg-white p-5 rounded-2xl border border-slate-100 italic shadow-inner">
                <span className="font-black text-[9px] uppercase text-indigo-400 block mb-2 tracking-[0.2em]">Logical Linkage</span>{ref.citationReason}
              </div>
            </div>
            <a href={ref.url} target="_blank" rel="noopener noreferrer" className="shrink-0 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:bg-indigo-600 hover:text-white transition-all active:scale-95"><svg className="w-6 h-6 text-indigo-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg></a>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default App;
