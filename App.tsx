import React, { useState, useRef, useCallback, useEffect } from 'react';
import { POLineRow, GeminiParsingResult } from './types';
import { ReferencePack } from './referencePack.schema';
import { parseDocument } from './services/geminiService';
import { geminiResultToPOLineRows, downloadCsv } from './services/mappingService';
import { buildControlSurfaceWorkbook, downloadBlob } from './services/xlsxExport';
import { exportControlSurfaceCsv } from './services/controlSurfaceExport';
import { ReferenceService } from './services/referenceService';
import { enrichAndValidate } from './services/enrichAndValidate';
import DataTable from './components/DataTable';
import { loadPolicy, savePolicy } from './policy/policyLocalStore';
import { finalizePolicy, bumpVersion } from './policy/policyVersioning';
import { exportPolicyToXlsxTemplate, importPolicyFromXlsx } from './services/policyXlsx';
import { PolicyAdmin } from './components/PolicyAdmin';
import { ControlSurfacePolicy } from './policy/controlSurfacePolicy';
import { applyPolicyRouting } from './services/policyRouting';
import { loadReferencePack, saveReferencePack as persistReferencePack } from './reference/referenceLocalStore';
import { ReferencePackAdmin } from './components/ReferencePackAdmin';

declare const Tesseract: any;

const App: React.FC = () => {
  const [currentPolicy, setCurrentPolicy] = useState<ControlSurfacePolicy>(() => loadPolicy());
  const [referencePack, setReferencePack] = useState<ReferencePack>(() => loadReferencePack());
  const [rows, setRows] = useState<POLineRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [controlTemplateFile, setControlTemplateFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'ops' | 'policy' | 'reference'>('ops');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentPolicy(loadPolicy());
    setReferencePack(loadReferencePack());
  }, []);

  const processFiles = async (files: FileList) => {
    setIsProcessing(true);
    let allNewRows: POLineRow[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileStem = file.name.replace(/\.[^/.]+$/, "");
      const stepSize = 100 / files.length;
      const baseProgress = (i / files.length) * 100;

      // PROACTIVE PACING: Add a mandatory 5s gap to prevent 429s
      if (i > 0) {
        setProcessingStatus(`Pacing for API Quota (5s)...`);
        await new Promise(r => setTimeout(r, 5000));
      }

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
          referencePack || undefined,
          (status) => setProcessingStatus(`${file.name}: ${status}`)
        );
        
        let mappedRows = geminiResultToPOLineRows({ 
          parsed, 
          sourceFileStem: fileStem,
          policy: currentPolicy,
          refPack: referencePack
        });

        if (referencePack && referencePack.manufacturers.length > 0) {
          const refService = new ReferenceService(referencePack);
          mappedRows = enrichAndValidate(mappedRows, refService, referencePack.version);
        }

        allNewRows = [...allNewRows, ...mappedRows];

      } catch (error: any) {
        console.error(`Error processing ${file.name}:`, error);
        const errorMsg = JSON.stringify(error);
        
        if (errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
          setProcessingStatus(`Quota Fully Exhausted for ${file.name}`);
          alert(`API Rate Limit reached. ${file.name} was skipped. Please wait 60 seconds before trying again.`);
        } else {
          alert(`Could not process ${file.name}: ${error?.message || "Check console"}`);
        }
      }
      
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setRows(prev => [...allNewRows, ...prev]);
    setIsProcessing(false);
    setProgress(0);
    setProcessingStatus('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const reRouteExistingRows = useCallback(() => {
    if (rows.length === 0) return;
    const updated = applyPolicyRouting(rows, currentPolicy, { phase: "PHASE_1" });
    setRows(updated);
  }, [rows, currentPolicy]);

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
    const routed = applyPolicyRouting(rows, currentPolicy, { phase: "PHASE_1" });
    const csv = exportControlSurfaceCsv(routed);
    downloadCsv(`OrderFlow_Audit_${Date.now()}.csv`, csv);
  };

  const handleExportControlSurfaceXlsx = async () => {
    if (rows.length === 0) return;
    try {
      let templateBuf: ArrayBuffer | undefined = undefined;
      
      if (controlTemplateFile) {
        templateBuf = await controlTemplateFile.arrayBuffer();
      } else {
        try {
          const resp = await fetch("/PO_Automation_Control_Surface_Template_v3.xlsx");
          if (resp.ok) {
            templateBuf = await resp.arrayBuffer();
          }
        } catch (fetchErr) {
          console.warn("Server template not found, using generic export format.", fetchErr);
        }
      }

      const routed = applyPolicyRouting(rows, currentPolicy, { phase: "PHASE_1" });

      const blob = buildControlSurfaceWorkbook({
        templateArrayBuffer: templateBuf,
        poLineRows: routed,
      });

      downloadBlob(`OrderFlow_ControlSurface_${Date.now()}.xlsx`, blob);
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

          <nav className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner">
            <button 
              onClick={() => setActiveTab('ops')}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'ops' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <i className="fa-solid fa-microchip"></i>
              Operations
            </button>
            <button 
              onClick={() => setActiveTab('policy')}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'policy' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <i className="fa-solid fa-shield-halved"></i>
              Policy
            </button>
            <button 
              onClick={() => setActiveTab('reference')}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'reference' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <i className="fa-solid fa-book"></i>
              Knowledge
            </button>
          </nav>

          <div className="flex items-center gap-3">
            {activeTab === 'ops' ? (
              <>
                <div className="hidden lg:flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-sm">
                  <button onClick={() => setActiveTab('reference')} className={`text-[10px] font-bold transition-all flex items-center gap-1.5 px-2 py-0.5 rounded-lg ${referencePack.manufacturers.length > 0 ? 'text-indigo-700 bg-indigo-50' : 'text-slate-500 bg-slate-50 hover:bg-slate-100'}`}>
                    <i className={`fa-solid ${referencePack.manufacturers.length > 0 ? 'fa-book-bookmark' : 'fa-book'}`}></i>
                    <span>{referencePack.manufacturers.length > 0 ? `KB v${referencePack.version}` : 'No KB'}</span>
                  </button>
                  <button onClick={() => templateInputRef.current?.click()} className={`text-[10px] font-bold transition-all flex items-center gap-1.5 px-2 py-0.5 rounded-lg ${controlTemplateFile ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-50 hover:bg-slate-100'}`}>
                    <i className={`fa-solid ${controlTemplateFile ? 'fa-file-circle-check' : 'fa-file-excel'}`}></i>
                    <span>{controlTemplateFile ? 'Template OK' : 'Template'}</span>
                  </button>
                  <div className="w-px h-4 bg-slate-100 mx-1"></div>
                  <button onClick={reRouteExistingRows} disabled={rows.length === 0} className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 px-2 py-0.5 rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-30" title="Recalculate policy lanes for existing data">
                    <i className="fa-solid fa-rotate"></i>
                    <span>Re-Route</span>
                  </button>
                  <input type="file" ref={templateInputRef} onChange={handleTemplateUpload} className="hidden" accept=".xlsx" />
                </div>
                <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="group flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-2xl font-bold hover:bg-blue-600 transition-all shadow-xl active:scale-95">
                  <i className="fa-solid fa-plus-circle"></i>
                  <span>Import Documents</span>
                </button>
                <input type="file" ref={fileInputRef} onChange={(e) => e.target.files && processFiles(e.target.files)} className="hidden" multiple accept="application/pdf,image/*" />
                <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 gap-1 shadow-sm">
                  <button onClick={handleExportControlSurfaceXlsx} disabled={rows.length === 0 || isProcessing} className="flex items-center gap-2 px-4 py-2 text-emerald-700 hover:bg-emerald-50 rounded-xl font-bold disabled:opacity-30 transition-all text-sm" title="Export to XLSX with Audit Columns">
                    <i className="fa-solid fa-file-excel"></i>
                  </button>
                  <button onClick={handleExportCSV} disabled={rows.length === 0 || isProcessing} className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-50 rounded-xl font-bold disabled:opacity-30 transition-all text-sm" title="Export to Audit CSV">
                    <i className="fa-solid fa-file-csv"></i>
                  </button>
                </div>
              </>
            ) : activeTab === 'policy' ? (
               <div className="flex items-center gap-2 bg-indigo-50 px-4 py-2 rounded-2xl border border-indigo-100">
                  <i className="fa-solid fa-circle-info text-indigo-400 text-xs"></i>
                  <span className="text-xs font-bold text-indigo-700">Automation Policy: Define how orders are routed based on detected attributes.</span>
               </div>
            ) : (
                <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-100">
                  <i className="fa-solid fa-graduation-cap text-emerald-400 text-xs"></i>
                  <span className="text-xs font-bold text-emerald-700">Master Knowledge Base: Manage manufacturers, finishes, and catalog standards.</span>
               </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full px-6 py-8">
        {activeTab === 'ops' ? (
          <>
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
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black text-slate-900">{processingStatus}</h3>
                    <p className="text-slate-400 font-medium tracking-tight">High-Throughput Gemini Flash Extraction</p>
                  </div>
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
                  OrderFlow Pro uses grounded AI and dynamic automation policies to process line items for ERP injection.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-6">
                   <h2 className="text-lg font-black text-slate-900">Extracted Order Data</h2>
                   <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                      <span>{rows.length} Items</span>
                      <span className="flex items-center gap-1.5"><i className="fa-solid fa-shield-halved text-[10px]"></i> Policy v{currentPolicy.meta.version}</span>
                   </div>
                </div>
                <DataTable data={rows} onDelete={(idx) => setRows(prev => prev.filter((_, i) => i !== idx))} />
              </div>
            )}
          </>
        ) : activeTab === 'policy' ? (
          <PolicyAdmin policy={currentPolicy} onPolicyChange={setCurrentPolicy} />
        ) : (
          <ReferencePackAdmin referencePack={referencePack} onReferencePackChange={setReferencePack} />
        )}
      </main>
    </div>
  );
};

export default App;
