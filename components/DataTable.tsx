import React from 'react';
import { POLineRow } from '../types';

interface DataTableProps {
  data: POLineRow[];
  onDelete: (index: number) => void;
}

const DataTable: React.FC<DataTableProps> = ({ data, onDelete }) => {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 bg-white border-2 border-dashed border-slate-200 rounded-2xl shadow-sm group hover:border-blue-400 transition-colors">
        <div className="bg-slate-50 p-6 rounded-3xl mb-4 group-hover:scale-110 transition-transform">
          <i className="fa-solid fa-file-circle-plus text-5xl text-slate-300"></i>
        </div>
        <h3 className="text-lg font-bold text-slate-900">Queue is empty</h3>
        <p className="text-slate-500 text-sm max-w-xs text-center mt-2">Upload Purchasing or Sales orders to begin automated line extraction.</p>
      </div>
    );
  }

  const getLaneBadge = (lane: string) => {
    switch (lane) {
      case 'AUTO': return 'bg-emerald-50 text-emerald-700 border-emerald-100 ring-1 ring-emerald-400/20';
      case 'ASSIST': return 'bg-amber-50 text-amber-700 border-amber-100 ring-1 ring-amber-400/20';
      case 'HUMAN': return 'bg-rose-50 text-rose-700 border-rose-100 ring-1 ring-rose-400/20';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const getFlagBadge = (flag: string) => {
    if (!flag) return null;
    return (
      <span key={flag} className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200 mr-1 mb-1">
        {flag.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-left">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em]">Target Lane</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em]">Doc Reference</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em]">Customer / Entity</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em]">Item / Desc</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em] text-right">Details</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em] text-right">Extended</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em] text-center">Confidence</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em] text-center">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-50">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50/80 transition-all group">
                <td className="px-4 py-5 whitespace-nowrap">
                  <div className="flex flex-col gap-1.5">
                    <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black text-center ${getLaneBadge(row.automation_lane)}`}>
                      {row.automation_lane}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400 text-center uppercase tracking-tighter">PHASE {row.phase_target}</span>
                  </div>
                </td>
                <td className="px-4 py-5 whitespace-nowrap">
                  <div className="text-sm font-bold text-slate-900 leading-tight truncate max-w-[120px]" title={row.doc_id}>{row.doc_id}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-wide">{row.doc_type}</div>
                </td>
                <td className="px-4 py-5">
                  <div className="text-sm font-semibold text-slate-700 truncate max-w-[150px]" title={row.customer_name}>
                    {row.customer_name || <span className="text-slate-300 italic">None</span>}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[150px]">PO: {row.customer_po_number || '---'}</div>
                </td>
                <td className="px-4 py-5">
                  <div className="flex flex-col gap-1">
                    <div className="text-sm font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded w-fit">{row.item_no || 'MANUAL'}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-1 max-w-[200px]" title={row.customer_item_desc_raw}>
                      {row.customer_item_desc_raw}
                    </div>
                    <div className="flex flex-wrap mt-1">
                      {getFlagBadge(row.edge_case_flag_1)}
                      {getFlagBadge(row.edge_case_flag_2)}
                      {getFlagBadge(row.edge_case_flag_3)}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-5 whitespace-nowrap text-right">
                  <div className="text-sm font-bold text-slate-900">{row.qty ?? 0} {row.uom}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">@ ${ (row.unit_price ?? 0).toFixed(2) }</div>
                </td>
                <td className="px-4 py-5 whitespace-nowrap text-right">
                  <div className="text-sm font-black text-slate-900">${ (row.extended_price ?? 0).toFixed(2) }</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">TOTAL AMT</div>
                </td>
                <td className="px-4 py-5 whitespace-nowrap">
                  <div className="flex flex-col items-center">
                    <div className="w-16 bg-slate-100 rounded-full h-1.5 mb-1.5 relative overflow-hidden ring-1 ring-slate-200">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${row.confidence_score > 0.8 ? 'bg-emerald-500' : row.confidence_score > 0.6 ? 'bg-amber-400' : 'bg-rose-500'}`} 
                        style={{ width: `${row.confidence_score * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 tabular-nums">{Math.round(row.confidence_score * 100)}%</span>
                  </div>
                </td>
                <td className="px-4 py-5 whitespace-nowrap text-center">
                  <button 
                    onClick={() => onDelete(idx)}
                    className="p-2 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                    title="Remove item"
                  >
                    <i className="fa-solid fa-trash-can"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-slate-50/50 px-4 py-3 border-t border-slate-100 flex justify-between items-center">
        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">
          Showing {data.length} Line Items
        </p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
             <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
             <span className="text-[10px] text-slate-500 font-bold uppercase">Ready</span>
          </div>
          <div className="flex items-center gap-1.5">
             <div className="w-2 h-2 rounded-full bg-amber-400"></div>
             <span className="text-[10px] text-slate-500 font-bold uppercase">Review</span>
          </div>
          <div className="flex items-center gap-1.5">
             <div className="w-2 h-2 rounded-full bg-rose-500"></div>
             <span className="text-[10px] text-slate-500 font-bold uppercase">Manual</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataTable;
