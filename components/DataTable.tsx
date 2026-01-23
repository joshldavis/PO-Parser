import React from 'react';
import { POLineRow } from '../types';

interface DataTableProps {
  data: POLineRow[];
  onDelete: (index: number) => void;
}

const DataTable: React.FC<DataTableProps> = ({ data, onDelete }) => {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 bg-white border-2 border-dashed border-slate-200 rounded-[2rem]">
        <div className="bg-slate-50 p-6 rounded-3xl mb-4">
          <i className="fa-solid fa-file-invoice text-5xl text-slate-300"></i>
        </div>
        <h3 className="text-lg font-bold text-slate-900">Queue is empty</h3>
        <p className="text-slate-500 text-sm mt-2">Upload documents to extract order details.</p>
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

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-left">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Reference</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Description</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Grounded Specs</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Details</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Total</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Score</th>
              <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Action</th>
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
                    <div className="flex items-center justify-center gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${row.sage_import_ready ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`}></div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">ERP SYNC</span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-5 whitespace-nowrap">
                  <div className="text-sm font-bold text-slate-900 leading-tight truncate max-w-[120px]" title={row.doc_id}>{row.doc_id}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[120px]">{row.customer_name}</div>
                </td>
                <td className="px-4 py-5">
                  <div className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded w-fit mb-1">{row.customer_item_no || 'NO_ITEM'}</div>
                  <div className="text-[11px] text-slate-500 line-clamp-1 max-w-[200px]" title={row.description_raw}>
                    {row.description_raw}
                  </div>
                </td>
                <td className="px-4 py-5">
                  <div className="flex flex-wrap gap-1">
                    {row.manufacturer_abbr && (
                      <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-[9px] font-black" title={row.manufacturer_full}>
                        {row.manufacturer_abbr}
                      </span>
                    )}
                    {row.finish_us_code && (
                      <span className="px-1.5 py-0.5 bg-slate-50 text-slate-700 border border-slate-200 rounded text-[9px] font-bold">
                        {row.finish_us_code}
                      </span>
                    )}
                    {row.gordon_symbol && (
                      <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[9px] font-bold">
                        {row.gordon_symbol}
                      </span>
                    )}
                    {row.electrified_device_type && (
                      <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-[9px] font-bold">
                        <i className="fa-solid fa-bolt text-[8px] mr-1"></i>
                        {row.electrified_device_type}
                      </span>
                    )}
                    {row.hardware_set_template && (
                      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[9px] font-bold">
                        <i className="fa-solid fa-layer-group text-[8px] mr-1"></i>
                        {row.hardware_set_template}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-5 whitespace-nowrap text-right">
                  <div className="text-sm font-bold text-slate-900">{row.quantity ?? 0} {row.uom_raw}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">@ ${ (row.unit_price ?? 0).toFixed(2) }</div>
                </td>
                <td className="px-4 py-5 whitespace-nowrap text-right">
                  <div className="text-sm font-black text-slate-900">${ (row.extended_price ?? 0).toFixed(2) }</div>
                </td>
                <td className="px-4 py-5 whitespace-nowrap">
                  <div className="flex flex-col items-center">
                    <div className="w-12 bg-slate-100 rounded-full h-1 relative overflow-hidden ring-1 ring-slate-200 mb-1">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${row.match_score > 0.9 ? 'bg-emerald-500' : 'bg-amber-400'}`} 
                        style={{ width: `${row.match_score * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-[9px] font-bold text-slate-500">{Math.round(row.match_score * 100)}%</span>
                  </div>
                </td>
                <td className="px-4 py-5 whitespace-nowrap text-center">
                  <button onClick={() => onDelete(idx)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                    <i className="fa-solid fa-trash-can"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;
