// components/ReferencePackAdmin.tsx
import React, { useState, useRef, useEffect } from "react";
import { ReferencePack } from "../referencePack.schema";
import { saveReferencePack, clearReferencePack, EMPTY_REFERENCE_PACK } from "../reference/referenceLocalStore";
import { finalizeReferencePack } from "../reference/referenceVersioning";
import { exportReferencePackToXlsx, importReferencePackFromXlsx } from "../services/referencePackXlsx";

// Simple check for XLSX global if needed
declare const XLSX: any;

type Props = {
  referencePack: ReferencePack;
  onReferencePackChange: (pack: ReferencePack) => void;
};

export function ReferencePackAdmin({ referencePack, onReferencePackChange }: Props) {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debug: Check if XLSX is actually loaded in the environment
  useEffect(() => {
    try {
      if (typeof XLSX !== 'undefined') {
        console.log("XLSX Library loaded and ready.");
      }
    } catch (e) {
      console.warn("XLSX global check failed (using module import instead).");
    }
  }, []);

  async function handleSave(kind: "patch" | "minor" | "major") {
    const finalized = finalizeReferencePack(referencePack, kind);
    saveReferencePack(finalized);
    onReferencePackChange(finalized);
    alert(`Input Catalogue v${finalized.version} saved permanently to local storage.`);
  }

  async function handleExport() {
    try {
      const blob = exportReferencePackToXlsx(referencePack);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OrderFlow_Catalogue_v${referencePack.version}_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Export failed: " + err.message);
    }
  }

  async function handleImport() {
    console.log("Import button clicked.");
    if (!importFile) {
      alert("Please select an Excel file (.xlsx) first.");
      return;
    }
    
    setIsImporting(true);
    console.log("Starting import for:", importFile.name);

    try {
      const buffer = await importFile.arrayBuffer();
      console.log("File buffer created, length:", buffer.byteLength);
      
      const updated = importReferencePackFromXlsx(buffer, referencePack);
      
      const counts = {
        mfrs: updated.manufacturers.length,
        finishes: updated.finishes.length,
        cats: updated.categories.length,
        devices: updated.electrified_devices.length,
        wiring: updated.wiring_configs.length,
        sets: updated.hardware_sets.length
      };

      const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);

      if (totalItems === 0) {
        alert("Import finished, but 0 items were found.\n\nVerify that your sheet names match (e.g., 'Manufacturers') and that column headers exist in the first row.");
      } else {
        onReferencePackChange(updated);
        alert(`Successfully imported ${totalItems} items into the Catalogue!\n\nCheck the stats grid to verify counts.\n\nIMPORTANT: Click 'Patch' or 'Minor' save buttons above to commit this catalogue to your storage.`);
      }
    } catch (err: any) {
      console.error("Critical Import Error:", err);
      alert(`Import failed: ${err.message || 'An unexpected error occurred during Excel parsing.'}`);
    } finally {
      setIsImporting(false);
    }
  }

  function handleReset() {
    if (confirm("Are you sure? This will wipe the entire Input Catalogue. You should export it first if you want to keep a copy.")) {
      clearReferencePack();
      onReferencePackChange(EMPTY_REFERENCE_PACK);
    }
  }

  const StatCard = ({ label, count, icon, color }: { label: string, count: number, icon: string, color: string }) => (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
      <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center text-xl`}>
        <i className={`fa-solid ${icon}`}></i>
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</p>
        <p className="text-2xl font-black text-slate-900 leading-none">{count}</p>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-3">
            <div className="bg-indigo-600 text-white w-8 h-8 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <i className="fa-solid fa-book-bookmark text-sm"></i>
            </div>
            Input Catalogue / Grounding Engine
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Catalogue Version: <span className="font-bold text-indigo-600">{referencePack.version}</span> • 
            Last Updated: <span className="font-bold text-slate-400">{referencePack.updated_at ? new Date(referencePack.updated_at).toLocaleString() : 'Never'}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <button onClick={() => handleSave("patch")} className="px-3 py-1.5 text-[10px] font-black hover:bg-slate-50 rounded-lg text-slate-600 uppercase tracking-tighter" title="Bump Patch">Patch</button>
            <button onClick={() => handleSave("minor")} className="px-3 py-1.5 text-[10px] font-black hover:bg-slate-50 rounded-lg text-slate-600 uppercase tracking-tighter" title="Bump Minor">Minor</button>
            <button onClick={() => handleSave("major")} className="px-3 py-1.5 text-[10px] font-black hover:bg-slate-50 rounded-lg text-slate-600 uppercase tracking-tighter" title="Bump Major">Major</button>
          </div>
          <button onClick={handleReset} className="px-4 py-2.5 text-rose-500 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
            <i className="fa-solid fa-trash-can"></i> Clear
          </button>
        </div>
      </div>

      <div className="p-8 space-y-10">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Mfrs" count={referencePack.manufacturers?.length || 0} icon="fa-industry" color="bg-blue-50 text-blue-600" />
          <StatCard label="Finishes" count={referencePack.finishes?.length || 0} icon="fa-palette" color="bg-emerald-50 text-emerald-600" />
          <StatCard label="Categories" count={referencePack.categories?.length || 0} icon="fa-layer-group" color="bg-amber-50 text-amber-600" />
          <StatCard label="Devices" count={referencePack.electrified_devices?.length || 0} icon="fa-bolt" color="bg-rose-50 text-rose-600" />
          <StatCard label="Wiring" count={referencePack.wiring_configs?.length || 0} icon="fa-network-wired" color="bg-indigo-50 text-indigo-600" />
          <StatCard label="Templates" count={referencePack.hardware_sets?.length || 0} icon="fa-puzzle-piece" color="bg-slate-50 text-slate-600" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col justify-between">
             <div>
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Update Master Data</label>
               <h4 className="text-sm font-bold text-slate-700 mb-3">Bulk Import via Excel</h4>
               <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                 Upload an XLSX file with required sheets (Manufacturers, Finishes, etc.) to refresh the grounding engine with your local catalogue.
               </p>
             </div>
             <div className="flex gap-2">
               <input 
                 type="file" 
                 accept=".xlsx" 
                 ref={fileInputRef}
                 onChange={(e) => {
                   const file = e.target.files?.[0] || null;
                   setImportFile(file);
                   console.log("File ready:", file?.name);
                 }} 
                 className="flex-grow text-xs bg-white border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500/20"
               />
               <button 
                 onClick={handleImport} 
                 disabled={isImporting || !importFile}
                 className={`px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center gap-2`}
               >
                 {isImporting ? <i className="fa-solid fa-circle-notch animate-spin"></i> : <i className="fa-solid fa-file-import"></i>}
                 {isImporting ? 'Parsing...' : 'Import'}
               </button>
             </div>
           </div>

           <div className="p-6 bg-indigo-50/30 rounded-3xl border border-indigo-100 flex flex-col justify-between">
             <div>
               <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Archive Management</label>
               <h4 className="text-sm font-bold text-slate-700 mb-3">Download Catalogue Template</h4>
               <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                 Download the current catalogue structure. This can be used as a template for your own Excel uploads.
               </p>
             </div>
             <button 
               onClick={handleExport} 
               className="w-full px-5 py-3 bg-white border border-indigo-200 text-indigo-600 rounded-xl text-xs font-black hover:bg-indigo-600 hover:text-white transition-all shadow-md flex items-center justify-center gap-3 uppercase tracking-wider"
             >
               <i className="fa-solid fa-cloud-arrow-down text-base"></i>
               Download Current Catalogue
             </button>
           </div>
        </div>

        <div className="bg-slate-900 text-slate-300 p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <i className="fa-solid fa-graduation-cap text-8xl"></i>
          </div>
          <h3 className="text-white font-black text-lg mb-4 flex items-center gap-2">
            <i className="fa-solid fa-lightbulb text-amber-400"></i>
            Import Debugging Tips
          </h3>
          <ul className="space-y-4 text-sm font-medium">
            <li className="flex gap-4">
              <span className="w-6 h-6 bg-white/10 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0">1</span>
              <p>Check the <span className="text-white font-bold">Browser Console (F12)</span> for detailed logs showing which sheets were found.</p>
            </li>
            <li className="flex gap-4">
              <span className="w-6 h-6 bg-white/10 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0">2</span>
              <p>Ensure your Sheet Names contain the expected keywords (e.g., a sheet named <span className="text-white font-bold">"Manufacturer List"</span> will match <span className="text-white font-bold">"Manufacturers"</span>).</p>
            </li>
            <li className="flex gap-4">
              <span className="w-6 h-6 bg-white/10 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0">3</span>
              <p>Column headers should be in the <span className="text-white font-bold">First Row</span> of the sheet. Partial matches like "Mfr Name" for "Name" are supported.</p>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
