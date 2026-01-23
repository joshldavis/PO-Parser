import React, { useState, useRef, useCallback } from 'react';
import { POLineRow, GeminiParsingResult } from './types';
import { ReferencePack } from './referencePack.schema';
import { parseDocument } from './services/geminiService';
import { geminiResultToPOLineRows, downloadCsv } from './services/mappingService';
import { buildControlSurfaceWorkbook, downloadBlob } from './services/xlsxExport';
import { exportControlSurfaceXlsxUsingTemplate, exportControlSurfaceCsv } from './services/controlSurfaceExport';
import { ReferenceService } from './services/referenceService';
import { enrichAndValidate } from './services/enrichAndValidate';
import DataTable from './components/DataTable';

declare const Tesseract: any;

const App: React.FC = () => {
  const [rows, setRows] = useState<POLineRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [controlTemplateFile, setControlTemplateFile] = useState<File | null>(null);
  const [referencePack, setReferencePack] = useState<ReferencePack | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const refPackInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (files: FileList) => {
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
          setProgress(baseProgress + (stepSize * 0.2));
          try {
            const result = await Tesseract.recognize(file, 'eng');
            ocrTextHint = result.data.text;
          } catch (ocrErr) {
            console.warn("OCR Hint failed", ocrErr);
          }
        }

        setProcessingStatus(`AI Extracting: ${file.name}...`);
        setProgress(baseProgress + (stepSize * 0.5));

        const base64 = await fileToBase64(file);
        const parsed: GeminiParsingResult = await parseDocument(
          base64, 
          file.type, 
          ocrTextHint, 
          referencePack || undefined
        );
        
        let mappedRows = geminiResultToPOLineRows({ 
          parsed, 
          sourceFileStem: fileStem,
          refPack: referencePack
        });

        // If we have a reference pack, run the enrichment and validation engine
        if (referencePack) {
          const refService = new ReferenceService(referencePack);
          mappedRows = enrichAndValidate(mappedRows, refService, referencePack.version);
        }

        allNewRows = [...allNewRows, ...mappedRows];

      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        alert(`Could not process ${file.name}. Ensure your Gemini API Key is valid.`);
      }
      
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setRows(prev => [...allNewRows, ...prev]);
    setIsProcessing(false);
    setProgress(0);
    setProcessingStatus('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRefPackUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string) as ReferencePack;
        if (json.version && Array.isArray(json.manufacturers)) {
          setReferencePack(json);
          alert(`Reference Pack v${json.version} loaded successfully!`);
        } else {
          throw new Error("Invalid format");
        }
      } catch (err) {
        alert("Failed to load reference pack: JSON structure invalid.");
      }
    };
    reader.readAsText(file);
  };

  const handleTemplateUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setControlTemplateFile(file);
      alert(`Template loaded: ${file.name}`);
    }
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
    const csv = exportControlSurfaceCsv(rows);
    downloadCsv(`OrderFlow_ControlSurface_${Date.now()}.csv`, csv);
  };

  const handleExportControlSurfaceXlsx = async () => {
    if (rows.length === 0) return;
    try {
      let templateBuf: ArrayBuffer;

      if (controlTemplateFile) {
        templateBuf = await controlTemplateFile.arrayBuffer();
      } else {
        // Fetch default master template from the server/public folder
        const resp = await fetch("/PO_Automation_Control_Surface_Template_v3.xlsx");
        if (!resp.ok) {
           // Fallback to generating a fresh sheet if master template is missing in public folder
           const blob = buildControlSurfaceWorkbook({ poLineRows: rows });
           downloadBlob(`OrderFlow_Export_${Date.now()}.xlsx`, blob);
           return;
        }
        templateBuf = await resp.arrayBuffer();
      }

      const outputBuf = exportControlSurfaceXlsxUsingTemplate({
        rows,
        templateArrayBuffer: templateBuf,
        sheetName: "PO_LineItem_Analysis",
      });

      const blob = new Blob([outputBuf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      downloadBlob(`PO_Automation_Control_Surface_${Date.now()}.xlsx`, blob);
    } catch (err: any) {
      console.error("XLSX Export Error:", err);
      alert("Export failed: " + err.message);
    }
  };

  return (
    <div 
      className={`min-h-screen bg-slate-50 flex flex-col antialiased text-slate-900 transition-colors duration-300 ${isDragging ? 'bg-blue-50/50' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) processFiles(e.dataTransfer.files); }}
    >
      <header className="bg-white/90 border-b border-slate-200 sticky top-0 z-40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-indigo-600 to-blue-500 p-2.5 rounded-2xl shadow-lg shadow-blue-500/20">
              <i className="fa-solid fa-file-invoice-dollar text-white text-2xl"></i>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">OrderFlow <span className="text-blue-600">Pro</span></h1>
              <div className="flex items-center gap-2 mt-0.5">
                 <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Grounded AI</span>
                 <p className="text-[11px] text-slate-400 font-medium">Enterprise Data Processor</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden lg:flex flex-col items-end mr-2 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-sm">
               <span className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Config</span>
               <div className="flex gap-2">
                 <button 
                   onClick={() => refPackInputRef.current?.click()}
                   className={`text-[10px] font-bold transition-all flex items-center gap-1.5 px-2 py-0.5 rounded-lg ${referencePack ? 'text-indigo-700 bg-indigo-50' : 'text-slate-500 bg-slate-50 hover:bg-slate-100'}`}
                   title="Load Reference Pack"
                 >
                   <i className={`fa-solid ${referencePack ? 'fa-book-bookmark' : 'fa-book'}`}></i>
                   <span>{referencePack ? `KB v${referencePack.version}` : 'Ref Pack'}</span>
                 </button>
                 <button 
                   onClick={() => templateInputRef.current?.click()}
                   className={`text-[10px] font-bold transition-all flex items-center gap-1.5 px-2 py-0.5 rounded-lg ${controlTemplateFile ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-50 hover:bg-slate-100'}`}
                   title="Load XLSX Template"
                 >
                   <i className={`fa-solid ${controlTemplateFile ? 'fa-file-circle-check' : 'fa-file-excel'}`}></i>
                   <span>{controlTemplateFile ? 'Template OK' : 'Template'}</span>
                 </button>
               </div>
               <input type="file" ref={refPackInputRef} onChange={handleRefPackUpload} className="hidden" accept=".json" />
               <input type="file" ref={templateInputRef} onChange={handleTemplateUpload} className="hidden" accept=".xlsx" />
            </div>

            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="group flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-2xl font-bold hover:bg-blue-600 transition-all shadow-xl active:scale-95"
            >
              <i className="fa-solid fa-plus-circle"></i>
              <span>Import Documents</span>
            </button>
            <input type="file" ref={fileInputRef} onChange={(e) => e.target.files && processFiles(e.target.files)} className="hidden" multiple accept="application/pdf,image/*" />
            
            <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 gap-1 shadow-sm">
              <button 
                onClick={handleExportControlSurfaceXlsx}
                disabled={rows.length === 0 || isProcessing}
                className="flex items-center gap-2 px-4 py-2 text-emerald-700 hover:bg-emerald-50 rounded-xl font-bold disabled:opacity-30 transition-all text-sm"
              >
                <i className="fa-solid fa-file-excel"></i>
                <span className="hidden sm:inline">XLSX</span>
              </button>
              <button 
                onClick={handleExportCSV}
                disabled={rows.length === 0 || isProcessing}
                className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-50 rounded-xl font-bold disabled:opacity-30 transition-all text-sm"
              >
                <i className="fa-solid fa-file-csv"></i>
                <span className="hidden sm:inline">CSV</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full px-6 py-8">
        {isProcessing ? (
          <div className="mb-10 bg-white border border-blue-100 rounded-[3rem] p-16 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-50">
               <div className="h-full bg-blue-600 transition-all duration-500 ease-out shadow-[0_0_15px_rgba(37,99,235,0.6)]" style={{ width: `${progress}%` }}></div>
            </div>
            <div className="flex flex-col items-center gap-8">
              <div className="relative">
                 <div className="w-28 h-28 border-[6px] border-slate-100 border-t-blue-600 rounded-full animate-spin"></div>
                 <div className="absolute inset-0 flex items-center justify-center">
                    <i className="fa-solid fa-bolt-lightning text-blue-600 text-4xl animate-pulse"></i>
                 </div>
              </div>
              <h3 className="text-3xl font-black text-slate-900 mb-3">{processingStatus}</h3>
              <div className="w-full max-w-lg">
                <div className="bg-slate-100 rounded-full h-5 p-1.5 shadow-inner">
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-500 h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="mb-10 bg-white border-2 border-dashed border-slate-200 rounded-[3rem] p-24 text-center group hover:border-blue-400 transition-all cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
               <i className="fa-solid fa-cloud-arrow-up text-4xl text-slate-300 group-hover:text-blue-500"></i>
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-3">Drop Orders to Begin</h2>
            <p className="text-slate-500 text-lg max-w-md mx-auto mb-8">
              OrderFlow uses grounded AI to extract and normalize hardware order items for ERP injection.
            </p>
          </div>
        ) : (
          <DataTable data={rows} onDelete={(idx) => setRows(prev => prev.filter((_, i) => i !== idx))} />
        )}
      </main>
    </div>
  );
};

export default App;