
import React from 'react';
import { OrderLineItem } from '../types';

interface DataTableProps {
  data: OrderLineItem[];
  onDelete: (id: string) => void;
}

const DataTable: React.FC<DataTableProps> = ({ data, onDelete }) => {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white border-2 border-dashed border-gray-300 rounded-xl shadow-sm">
        <div className="bg-gray-50 p-4 rounded-full mb-4">
          <i className="fa-solid fa-table-list text-4xl text-gray-400"></i>
        </div>
        <p className="text-gray-500 font-medium">No items parsed yet. Upload a document to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Doc Type</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Order #</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Item #</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty Ord</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit Price</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {data.map((item) => (
            <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  item.documentType === 'Invoice' ? 'bg-green-100 text-green-700' :
                  item.documentType === 'Sales Order' ? 'bg-blue-100 text-blue-700' :
                  item.documentType === 'Picking Sheet' ? 'bg-purple-100 text-purple-700' :
                  'bg-orange-100 text-orange-700'
                }`}>
                  {item.documentType}
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{item.orderNumber}</td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{item.orderDate}</td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 truncate max-w-[150px]" title={item.customerName}>
                {item.customerName}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-600">{item.itemNumber}</td>
              <td className="px-4 py-3 text-sm text-gray-500 truncate max-w-[200px]" title={item.description}>
                {item.description}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-500">
                {typeof item.quantityOrdered === 'number' ? item.quantityOrdered : 0}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-500">
                ${typeof item.unitPrice === 'number' ? item.unitPrice.toFixed(2) : '0.00'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                ${typeof item.totalAmount === 'number' ? item.totalAmount.toFixed(2) : '0.00'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-center">
                <button 
                  onClick={() => onDelete(item.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <i className="fa-solid fa-trash-can"></i>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;
