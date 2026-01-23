import React, { useState, useRef } from 'react';
import { POLineRow, GeminiParsingResult } from './types';
import { parseDocument } from './services/geminiService';
import { geminiResultToPOLineRows, applyPhase1Routing, rowsToCsv, downloadCsv } from './services/mappingService';
import { buildControlSurfaceWorkbook, downloadBlob } from './services/xlsxExport';
import DataTable from './components/DataTable';

declare const Tesseract: any;

const App: React.FC = () => {
  const [rows, setRows] = useState<POLineRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [controlTemplateFile, setControlTemplateFile] = useState<File | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    let allNewRows: POLineRow[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileStem = file.name.replace(/\.[^/.]+$/, "");
      const stepSize = 100 / files.length;
      const baseProgress = (i / files.length) * 100;

      try {
        let ocrTextHint = '';
        if (file.type.startsWith('image/')) {
          setProcessingStatus(`OCR analyzing: ${file.name}...`);
          setProgress(baseProgress + (stepSize * 0.3));
          const result = await Tesseract.recognize(file, 'eng');
          ocrTextHint = result.data.text;
        }

        setProcessingStatus(`Gemini extracting: ${file.name}...`);
        setProgress(baseProgress + (stepSize * 0.7));

        const base64 = await fileToBase64(file);
        const parsed: GeminiParsingResult = await parseDocument(base64, file.type, ocrTextHint);
        
        const rows0 = geminiResultToPOLineRows({ 
          parsed, 
          sourceFileStem: fileStem 
        });

        const routedRows = applyPhase1Routing(rows0);
        allNewRows = [...allNewRows, ...routedRows];

      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        alert(`Could not process ${file.name}. Ensure file is a valid PDF or Image.`);
      }
      
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setRows(prev => [...allNewRows, ...prev]);
    setIsProcessing(false);
    setProgress(0);
    setProcessingStatus('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result?.toString().split(',')[1];
        if (base64String) resolve(base64String);
        else reject(new Error("Base64 conversion failed"));
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleExportCSV = () => {
    if (rows.length === 0) return;
    const csv = rowsToCsv(rows);
    const filename = `OrderFlow_Export_${new Date().getTime()}.csv`;
    downloadCsv(filename, csv);
  };

  const handleExportControlSurfaceXlsx = async () => {
    if (rows.length === 0) return;
    if (!controlTemplateFile) {
      alert("Please upload a 'Control Surface' template file (.xlsx) first.");
      templateInputRef.current?.click();
      return;
    }
    
    try {
      const buf = await controlTemplateFile.arrayBuffer();
      const blob = buildControlSurfaceWorkbook({
        templateArrayBuffer: buf,
        poLineRows: rows,
      });

      downloadBlob(`OrderFlow_ControlSurface_${new Date().getTime()}.xlsx`, blob);
    } catch (err: any) {
      alert("Export failed: " + err.message);
    }
  };

  const deleteRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    if (confirm("Clear all extracted lines from memory?")) {
      setRows([]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm backdrop-blur-md bg-white/80">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-700 p-2.5 rounded-2xl shadow-xl shadow-blue-500/20">
              <i className="fa-solid fa-file-invoice text-white text-2xl"></i>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight leading-none">OrderFlow <span className="text-blue-600">Pro</span></h1>
              <div className="flex items-center gap-2 mt-1">
                 <span className="text-[10px] bg-slate-900 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Enterprise v3</span>
                 <p className="text-[11px] text-slate-400 font-medium">Advanced Data Pipeline</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Template Selection */}
            <div className="hidden lg:flex flex-col items-end mr-4 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-inner">
               <span className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Active Template</span>
               <button 
                 onClick={() => templateInputRef.current?.click()}
                 className={`text-[11px] font-bold transition-all flex items-center gap-2 px-2 py-0.5 rounded-lg ${controlTemplateFile ? 'text-emerald-700 bg-emerald-50 border border-emerald-100' : 'text-blue-600 bg-blue-50 border border-blue-100 hover:bg-blue-100'}`}
               >
                 <i className={`fa-solid ${controlTemplateFile ? 'fa-check-circle' : 'fa-file-upload'} animate-pulse`}></i>
                 <span className="truncate max-w-[140px]">{controlTemplateFile ? controlTemplateFile.name : 'Load XLSX Template'}</span>
               </button>
               <input 
                 type="file" 
                 ref={templateInputRef} 
                 onChange={(e) => setControlTemplateFile(e.target.files?.[0] || null)}
                 className="hidden" 
                 accept=".xlsx"
               />
            </div>

            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="group flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-500/30 active:scale-95"
            >
              <i className="fa-solid fa-plus-circle group-hover:scale-110 transition-transform"></i>
              <span>Import Orders</span>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" multiple accept="application/pdf,image/*" />
            
            <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 gap-1 shadow-sm">
              <button 
                onClick={handleExportControlSurfaceXlsx}
                disabled={rows.length === 0 || isProcessing}
                className="flex items-center gap-2 px-4 py-2 text-emerald-700 hover:bg-emerald-50 rounded-xl font-bold disabled:opacity-30 transition-all text-sm group"
                title="Template-based Excel Export"
              >
                <i className="fa-solid fa-file-excel group-hover:rotate-12 transition-transform"></i>
                <span>Advanced XLSX</span>
              </button>
              <div className="w-px h-6 bg-slate-200"></div>
              <button 
                onClick={handleExportCSV}
                disabled={rows.length === 0 || isProcessing}
                className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-50 rounded-xl font-bold disabled:opacity-30 transition-all text-sm"
              >
                <i className="fa-solid fa-file-csv"></i>
                <span>CSV</span>
              </button>
            </div>

            {rows.length > 0 && (
              <button onClick={clearAll} className="p-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all" title="Clear All Data">
                <i className="fa-solid fa-trash-alt"></i>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[
            { label: 'Lines Extracted', val: rows.length, color: 'text-slate-900', icon: 'fa-list-check' },
            { label: 'Auto-Path Lanes', val: rows.filter(r => r.automation_lane === 'AUTO').length, color: 'text-emerald-600', icon: 'fa-robot' },
            { label: 'Human Review', val: rows.filter(r => r.automation_lane !== 'AUTO').length, color: 'text-amber-500', icon: 'fa-user-pen' },
            { label: 'Avg Confidence', val: `${rows.length > 0 ? Math.round((rows.reduce((a,b) => a + b.confidence_score, 0) / rows.length) * 100) : 0}%`, color: 'text-blue-600', icon: 'fa-crosshairs' }
          ].map((stat, i) => (
            <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm transition-all hover:shadow-md hover:-translate-y-1">
              <div className="flex items-start justify-between mb-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">{stat.label}</p>
                <i className={`fa-solid ${stat.icon} ${stat.color} opacity-20 text-xl`}></i>
              </div>
              <p className={`text-4xl font-black ${stat.color} tracking-tight`}>{stat.val}</p>
            </div>
          ))}
        </div>

        {isProcessing && (
          <div className="mb-10 bg-white border border-blue-100 rounded-[2.5rem] p-12 text-center shadow-xl shadow-blue-500/5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-blue-50 overflow-hidden">
               <div className="h-full bg-blue-600 transition-all duration-300 shadow-[0_0_10px_rgba(37,99,235,0.5)]" style={{ width: `${progress}%` }}></div>
            </div>
            
            <div className="flex flex-col items-center gap-6 relative z-10">
              <div className="relative">
                 <div className="w-24 h-24 border-[6px] border-slate-50 border-t-blue-600 rounded-full animate-spin"></div>
                 <div className="absolute inset-0 flex items-center justify-center">
                    <i className="fa-solid fa-microchip text-blue-600 text-3xl animate-pulse"></i>
                 </div>
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">{processingStatus}</h3>
                <p className="text-slate-500 text-base max-w-lg mx-auto leading-relaxed">
                  Parsing document geometry and mapping line items to your enterprise schema using Gemini 3 Vision.
                </p>
              </div>
              <div className="w-full max-w-md">
                <div className="bg-slate-100 rounded-full h-4 p-1 shadow-inner">
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-500 h-full rounded-full transition-all duration-700 ease-out shadow-sm" style={{ width: `${progress}%` }}></div>
                </div>
                <div className="flex justify-between mt-3 px-1">
                   <p className="text-xs font-bold text-slate-400 font-mono tracking-widest uppercase">System Processing</p>
                   <p className="text-sm font-black text-blue-600 font-mono">{Math.round(progress)}%</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <DataTable data={rows} onDelete={deleteRow} />
      </main>

      <footer className="bg-white border-t border-slate-200 py-10 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-left">
            <p className="text-[11px] text-slate-400 font-bold tracking-[0.25em] uppercase mb-2">Automated Supply Chain Logic</p>
            <p className="text-sm text-slate-500 font-medium max-w-md">
              Secure extraction for Sales and Purchase orders. High-fidelity mapping enabled via Advanced XLSX templates.
            </p>
          </div>
          <div className="flex items-center gap-10">
            <div className="text-center">
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-2 tracking-wider">AI Framework</p>
              <div className="flex items-center gap-2 bg-slate-50 px-4 py-1.5 rounded-xl border border-slate-200 shadow-sm">
                <i className="fa-solid fa-bolt-lightning text-amber-500 text-xs"></i>
                <span className="text-xs font-black text-slate-700">Gemini 3 Flash</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-2 tracking-wider">Storage Policy</p>
              <div className="flex items-center gap-2 bg-slate-50 px-4 py-1.5 rounded-xl border border-slate-200 shadow-sm">
                <i className="fa-solid fa-ghost text-blue-500 text-xs"></i>
                <span className="text-xs font-black text-slate-700">In-Memory Only</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
