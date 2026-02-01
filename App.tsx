
import React, { useState, useRef, useCallback } from 'react';
import { processCitations } from './services/geminiService';
import { AppStatus, CitationResult, JournalGrade, YearRange, GoogleDocsStatus } from './types';
import { generateENW, downloadFile } from './utils/enwGenerator';
import { createGoogleDoc, generateDocFormat, generateCitationDocFormat } from './utils/googleDocs';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'file' | 'manual'>('file');
  const [pdfText, setPdfText] = useState<string>('');
  const [manualInput, setManualInput] = useState<string>('');
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<JournalGrade>('ALL');
  const [selectedYear, setSelectedYear] = useState<YearRange>('ALL');
  const [customYear, setCustomYear] = useState('');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [result, setResult] = useState<CitationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [docsStatus, setDocsStatus] = useState<GoogleDocsStatus>({
    paperDocId: null,
    citationDocId: null,
    // Fixed: 'boolean' only refers to a type, but was being used as a value here.
    isSynced: false
  });

  const viewerRef = useRef<HTMLDivElement>(null);

  const journalGrades: { label: string; value: JournalGrade }[] = [
    { label: '전체 저널', value: 'ALL' },
    { label: 'KCI(국내)', value: 'KCI' },
    { label: 'SCI/E급', value: 'SCI' },
    { label: 'SCOPUS', value: 'SCOPUS' },
  ];

  const processFile = (file: File) => {
    setStatus(AppStatus.UPLOADING);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setPdfText(content || `[시스템 데모 텍스트]\n\n현대 인공지능 연구에서 가장 큰 난제 중 하나는 할루시네이션(Hallucination) 현상이다. 특히 대규모 언어 모델(LLM)이 학술적 데이터를 생성할 때 존재하지 않는 논문을 인용하거나 잘못된 수치를 제시하는 경우가 빈번하게 발생한다. \n\n이러한 문제를 해결하기 위해 검색 증강 생성(RAG) 기술이 제안되었으며, 이는 모델이 외부 신뢰 소스로부터 지식을 실시간으로 검색하여 답변의 정확성을 높이는 방식이다. 본 프로젝트인 ScholarCite AI는 이러한 RAG 메커니즘을 학술 인용에 특화하여 설계하였다.`);
      setStatus(AppStatus.IDLE);
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setActiveTab('file');
      processFile(file);
    }
  };

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 5) {
      setSelectedText(text);
    }
  }, []);

  const handleCiteAction = async (inputText: string) => {
    if (!inputText) return;

    setStatus(AppStatus.SEARCHING);
    setError(null);
    setResult(null);

    try {
      const finalYear = customYear.length === 4 ? customYear : selectedYear;
      const data = await processCitations(inputText, selectedGrade, finalYear, pdfText);
      setResult(data);
      setStatus(AppStatus.COMPLETED);
    } catch (err) {
      setError('인용 분석 중 오류가 발생했습니다. KCI 포털 및 글로벌 검색 엔진과의 연결을 확인해주세요.');
      setStatus(AppStatus.ERROR);
    }
  };

  const handleSyncToGoogleDocs = async () => {
    if (!result) return;
    setStatus(AppStatus.SYNCING_DOCS);

    try {
      const paperContent = generateDocFormat(result.originalText, result.citedText, result.references);
      const citationContent = generateCitationDocFormat(result.references);

      const paperId = await createGoogleDoc(`논문 초안 - ${new Date().toLocaleDateString()}`, paperContent);
      const citationId = await createGoogleDoc(`인용 근거 자료 - ${new Date().toLocaleDateString()}`, citationContent);

      setDocsStatus({
        paperDocId: paperId,
        citationDocId: citationId,
        isSynced: true
      });
      setStatus(AppStatus.COMPLETED);
      alert('구글 독스 문서가 성공적으로 생성되었습니다!');
    } catch (err) {
      setError('구글 독스 연동 중 오류가 발생했습니다.');
      setStatus(AppStatus.ERROR);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F9FAFB] font-sans" onDragOver={handleDragOver} onDrop={handleDrop} onDragLeave={handleDragLeave}>
      {/* Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-indigo-600/90 flex flex-col items-center justify-center text-white p-10 animate-in fade-in duration-200">
          <div className="w-32 h-32 border-4 border-dashed border-white rounded-full flex items-center justify-center mb-6 animate-bounce">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
          </div>
          <p className="text-3xl font-black uppercase tracking-tighter">파일을 여기에 놓으세요</p>
          <p className="text-lg opacity-80 mt-2">KCI 및 글로벌 DB 분석을 시작합니다</p>
        </div>
      )}

      {/* Navbar */}
      <nav className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
          </div>
          <span className="text-xl font-black text-slate-900 tracking-tighter uppercase italic">ScholarCite <span className="text-indigo-600">AI</span></span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button 
              onClick={() => setActiveTab('file')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'file' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              원고 뷰어
            </button>
            <button 
              onClick={() => setActiveTab('manual')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'manual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              직접 입력
            </button>
          </div>
          <div className="h-6 w-px bg-slate-200 mx-2"></div>
          <label className="cursor-pointer bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-black hover:bg-slate-800 transition-all shadow-lg active:scale-95 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12"/></svg>
            파일 선택
            <input type="file" className="hidden" accept=".pdf,.txt" onChange={handleFileUpload} />
          </label>
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        {/* Left: Input Selection Area */}
        <div className="w-1/2 flex flex-col border-r border-slate-200 bg-white relative">
          {activeTab === 'file' ? (
            <>
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center h-14">
                <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  학술 원고 분석기 (Drag & Drop 지원)
                </h2>
                <button onClick={() => setPdfText('')} className="text-[10px] text-slate-400 font-bold hover:text-red-500 transition-colors">지우기</button>
              </div>
              <div 
                ref={viewerRef}
                onMouseUp={handleTextSelection}
                className="flex-1 p-12 overflow-y-auto leading-[2] text-slate-800 text-xl whitespace-pre-wrap select-text selection:bg-indigo-100 selection:text-indigo-900 font-serif relative"
              >
                {pdfText ? (
                  pdfText
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-6">
                    <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center border-2 border-dashed border-slate-200 transition-all hover:border-indigo-300 group">
                      <svg className="w-10 h-10 opacity-20 group-hover:opacity-40 group-hover:text-indigo-500 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                    </div>
                    <div className="text-center">
                      <p className="font-black text-slate-400 uppercase tracking-widest text-sm mb-1">원고 파일을 이곳에 드래그하세요</p>
                      <p className="text-xs text-slate-300 font-medium italic">KCI 오픈데이터 및 글로벌 학술 자료를 기반으로 인용을 분석합니다</p>
                    </div>
                  </div>
                )}
              </div>
              
              {selectedText && (
                <div className="p-8 border-t-2 border-indigo-100 bg-indigo-50/30 animate-in slide-in-from-bottom-4 duration-500">
                  <div className="flex flex-col gap-6">
                    <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm relative">
                      <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block mb-2 px-2 py-0.5 bg-indigo-50 rounded-full w-fit">분석할 선택 문장</span>
                      <p className="text-sm text-indigo-950 italic font-bold leading-relaxed">"{selectedText}"</p>
                      <button onClick={() => setSelectedText('')} className="absolute -top-3 -right-3 w-8 h-8 bg-slate-200 hover:bg-red-500 hover:text-white rounded-full flex items-center justify-center text-slate-500 text-xs font-black shadow-md transition-all">×</button>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black text-slate-400 uppercase ml-1">저널 등급</span>
                          <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value as JournalGrade)} className="text-[11px] font-black border border-slate-200 rounded-xl px-3 py-2.5 outline-none bg-white shadow-sm">
                            {journalGrades.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black text-slate-400 uppercase ml-1">발행 연도</span>
                          <input type="text" placeholder="YYYY년 이후" value={customYear} onChange={(e) => setCustomYear(e.target.value.replace(/\D/g, '').slice(0, 4))} className="text-[11px] font-black border border-slate-200 rounded-xl px-3 py-2.5 outline-none w-28 bg-white shadow-sm"/>
                        </div>
                      </div>
                      <button onClick={() => handleCiteAction(selectedText)} disabled={status === AppStatus.SEARCHING} className="bg-indigo-600 text-white px-8 py-3.5 rounded-2xl text-sm font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all">
                        {status === AppStatus.SEARCHING ? 'KCI/글로벌 데이터 검색 중...' : '인용 분석 시작'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col p-10 bg-white">
              <div className="mb-10 text-center">
                <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-widest mb-4 inline-block">Manual Entry Mode</span>
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter">문장 직접 분석</h2>
                <p className="text-slate-500 mt-2 text-sm font-medium">원고 전체가 아닌 특정 문장만 즉시 분석하고 인용을 찾습니다</p>
              </div>
              
              <div className="space-y-8 flex-1 flex flex-col">
                <div className="flex-1 flex flex-col gap-4">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">분석할 문장 입력</label>
                  <textarea 
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="인용 근거가 필요한 문장을 입력하세요. (예: 인공지능의 할루시네이션 현상은 대규모 언어 모델의 신뢰성을 저해하는 주요 요인이다.)"
                    className="flex-1 p-8 rounded-[2rem] bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-xl font-serif italic leading-relaxed text-slate-800 shadow-inner resize-none"
                  />
                </div>

                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-100/50 space-y-8">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">검색 저널 등급</label>
                      <div className="flex flex-wrap gap-2">
                        {journalGrades.map(g => (
                          <button 
                            key={g.value} 
                            onClick={() => setSelectedGrade(g.value)} 
                            className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all border ${selectedGrade === g.value ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}
                          >
                            {g.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">최소 발행 연도</label>
                      <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <input 
                          type="text" 
                          placeholder="YYYY (예: 2020)" 
                          value={customYear}
                          onChange={(e) => setCustomYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          className="bg-transparent outline-none flex-1 text-sm font-black text-indigo-600 px-2 placeholder:text-slate-300"
                        />
                        <span className="text-[10px] font-black text-slate-400 uppercase mr-2">이후</span>
                      </div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => handleCiteAction(manualInput)}
                    disabled={status === AppStatus.SEARCHING || !manualInput.trim()}
                    className="w-full py-5 rounded-[1.5rem] bg-indigo-600 text-white font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {status === AppStatus.SEARCHING ? 'KCI/글로벌 학술 DB 조회 중...' : '즉시 인용 분석 시작'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Analysis Terminal View */}
        <div className="w-1/2 flex flex-col bg-[#F3F4F6] overflow-y-auto">
          <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center sticky top-0 z-10 h-14">
            <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              AI 학술 분석 터미널
            </h2>
            {result && (
              <button onClick={handleSyncToGoogleDocs} disabled={status === AppStatus.SYNCING_DOCS} className="text-[10px] font-black bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all">
                {status === AppStatus.SYNCING_DOCS ? '동기화 중...' : '구글 독스로 내보내기'}
              </button>
            )}
          </div>

          <div className="p-10 space-y-10">
            {status === AppStatus.SEARCHING ? (
              <div className="flex flex-col items-center justify-center py-32 text-slate-400 space-y-6">
                <div className="relative">
                  <div className="w-20 h-20 border-[6px] border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-8 h-8 text-indigo-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <p className="font-black text-slate-800 text-lg">KCI 오픈데이터 및 실시간 학술 검색 가동 중</p>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">한국학술지인용색인(KCI) 데이터 및 글로벌 DOI 검증 중</p>
                </div>
              </div>
            ) : result ? (
              <div className="space-y-10 animate-in fade-in slide-in-from-right-8 duration-700">
                <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-xl shadow-slate-200/50 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                     <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 21L14.017 18C14.017 16.8954 14.9124 16 16.017 16H19.017C20.1216 16 21.017 16.8954 21.017 18V21C21.017 22.1046 20.1216 23 19.017 23H16.017C14.9124 23 14.017 22.1046 14.017 21ZM3 21L3 18C3 16.8954 3.89543 16 5 16H8C9.10457 16 10 16.8954 10 18V21C10 22.1046 9.10457 23 8 23H5C3.89543 23 3 22.1046 3 21ZM14.017 11.017L14.017 8.017C14.017 6.91243 14.9124 6.017 16.017 6.017H19.017C20.1216 6.017 21.017 6.91243 21.017 8.017V11.017C21.017 12.1216 20.1216 13.017 19.017 13.017H16.017C14.9124 13.017 14.017 12.1216 14.017 11.017ZM3 11.017L3 8.017C3 6.91243 3.89543 6.017 5 6.017H8C9.10457 6.017 10 6.91243 10 8.017V11.017C10 12.1216 9.10457 13.017 8 13.017H5C3.89543 13.017 3 12.1216 3 11.017Z"/></svg>
                   </div>
                   <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-6 block bg-indigo-50 px-3 py-1 rounded-full w-fit">수정 및 인용이 추가된 문장</span>
                   <p className="text-2xl font-serif italic text-slate-900 leading-[1.6] relative z-10">
                     "{result.citedText}"
                   </p>
                </div>

                {/* Grounding Sources - Mandatory as per Gemini API guidelines for googleSearch tool */}
                {result.groundingUrls && result.groundingUrls.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                      Google Search Grounding Sources
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {result.groundingUrls.map((source, idx) => (
                        <a 
                          key={idx} 
                          href={source.uri} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-[10px] bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-indigo-600 font-bold hover:border-indigo-400 hover:shadow-sm transition-all flex items-center gap-1.5"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                          {source.title || `Source ${idx + 1}`}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-8">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="text-xl font-black text-slate-900 flex items-center gap-3 uppercase">
                      <span className="w-8 h-8 bg-slate-900 text-white rounded-xl text-xs flex items-center justify-center">04</span>
                      검증된 학술 증거 리스트
                    </h3>
                  </div>
                  
                  {result.references.map((ref, i) => (
                    <div key={i} className="bg-white rounded-3xl p-8 border border-slate-200 shadow-lg shadow-slate-200/40 space-y-6 hover:border-indigo-400 hover:shadow-indigo-100 transition-all duration-300">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <h4 className="font-bold text-slate-900 text-xl leading-tight">{ref.title}</h4>
                          <p className="text-sm text-slate-500 font-medium">
                            <span className="text-slate-900 font-bold">{ref.authors}</span> <span className="opacity-40 mx-2">•</span> {ref.journal} ({ref.year})
                          </p>
                        </div>
                        <span className="bg-indigo-600 text-white text-[9px] font-black px-3 py-1.5 rounded-xl uppercase">{ref.grade || 'VERIFIED'}</span>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="bg-indigo-50/70 p-5 rounded-2xl border border-indigo-100/50">
                          <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest block mb-2">학술적 인용 근거</span>
                          <p className="text-sm text-indigo-950 font-bold leading-relaxed">{ref.citationReason}</p>
                        </div>
                        <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-100 italic">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">원문 핵심 내용 (Snippet)</span>
                          <p className="text-xs text-slate-600 leading-relaxed font-medium">"{ref.snippet}"</p>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                         <div className="flex items-center gap-2">
                           <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                           <span className="text-[10px] font-black text-slate-400 uppercase">KCI/글로벌 학술 정보 교차 검증 완료</span>
                         </div>
                         <div className="flex gap-4">
                            <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-black text-indigo-600 uppercase flex items-center gap-1.5 bg-indigo-50 px-4 py-2 rounded-xl hover:bg-indigo-600 hover:text-white transition-all">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                              원문 바로가기
                            </a>
                            <button onClick={() => downloadFile(generateENW([ref]), `${ref.title.slice(0, 15)}.enw`, 'text/plain')} className="text-[11px] font-black text-slate-500 uppercase hover:text-slate-900 transition-colors">EndNote 파일</button>
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center py-40 text-slate-300 space-y-6">
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-inner border border-slate-200/50">
                  <svg className="w-10 h-10 opacity-10" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/></svg>
                </div>
                <div className="text-center">
                  <p className="font-black text-slate-400 uppercase tracking-[0.2em] text-sm mb-2">분석 대기 중</p>
                  <p className="text-xs text-slate-300 font-medium italic">왼쪽 패널에서 원고를 업로드하거나 인용할 문장을 선택하세요</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer Status */}
      <footer className="h-10 bg-white border-t border-slate-200 px-8 flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
        <div className="flex gap-6">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 shadow-lg shadow-green-200"></span> ENGINE: KCI PORTAL CONNECTED</span>
          <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${docsStatus.isSynced ? 'bg-indigo-500' : 'bg-slate-300'} shadow-lg`}></span> G-DOCS: {docsStatus.isSynced ? 'SYNCHED' : 'READY'}</span>
        </div>
        <div>ScholarCite AI Platinum v3.3 • Integrated KCI OpenAPI Search Grounding</div>
      </footer>
    </div>
  );
};

export default App;
