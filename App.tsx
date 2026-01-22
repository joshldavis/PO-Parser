
import React, { useState, useCallback, useRef } from 'react';
import { OrderLineItem, GeminiParsingResult, DocumentType, DocumentData } from './types';
import { parseDocument } from './services/geminiService';
import DataTable from './components/DataTable';

const App: React.FC = () => {
  const [data, setData] = useState<OrderLineItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const newItems: OrderLineItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(Math.round(((i) / files.length) * 100));

      try {
        const base64 = await fileToBase64(file);
        const result: GeminiParsingResult = await parseDocument(base64, file.type);
        
        // Process each document found in the file (e.g., multiple pages)
        result.documents.forEach((doc: DocumentData) => {
          const flattenedItems: OrderLineItem[] = doc.lineItems.map((line, index) => {
            const qty = line.quantityOrdered || 0;
            const price = line.unitPrice || 0;
            const total = line.totalAmount || (qty * price);

            return {
              id: `${file.name}-${doc.orderNumber}-${doc.documentType}-${index}-${Date.now()}`,
              sourceFile: file.name,
              documentType: doc.documentType || DocumentType.UNKNOWN,
              orderNumber: doc.orderNumber || 'N/A',
              orderDate: doc.orderDate || 'N/A',
              customerName: doc.customerName || 'N/A',
              vendorName: doc.vendorName || 'N/A',
              customerPO: doc.customerPO || '',
              currency: doc.currency || 'USD',
              itemNumber: line.itemNumber || 'N/A',
              description: line.description || '',
              unit: line.unit || '',
              quantityOrdered: qty,
              quantityShipped: line.quantityShipped || 0,
              unitPrice: price,
              totalAmount: total,
            };
          });

          newItems.push(...flattenedItems);
        });

      } catch (error) {
        console.error(`Error parsing ${file.name}:`, error);
        alert(`Failed to parse ${file.name}. Please check the console for details.`);
      }
      
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setData(prev => [...newItems, ...prev]);
    setIsProcessing(false);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result?.toString().split(',')[1];
        if (base64String) resolve(base64String);
        else reject(new Error("Failed to convert file to base64"));
      };
      reader.onerror = error => reject(error);
    });
  };

  const exportToCSV = () => {
    if (data.length === 0) return;

    const headers = [
      "Document Type", "Order Number", "Order Date", "Customer", "Vendor", "Customer PO",
      "Item Number", "Description", "Unit", "Qty Ordered", "Qty Shipped", "Unit Price", "Total", "Currency", "Source File"
    ];

    const rows = data.map(item => [
      `"${item.documentType}"`,
      `"${item.orderNumber}"`,
      `"${item.orderDate}"`,
      `"${item.customerName}"`,
      `"${item.vendorName}"`,
      `"${item.customerPO}"`,
      `"${item.itemNumber}"`,
      `"${item.description.replace(/"/g, '""')}"`,
      `"${item.unit}"`,
      item.quantityOrdered,
      item.quantityShipped,
      item.unitPrice,
      item.totalAmount,
      `"${item.currency}"`,
      `"${item.sourceFile}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `orders_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deleteItem = (id: string) => {
    setData(prev => prev.filter(item => item.id !== id));
  };

  const clearAll = () => {
    if (confirm("Are you sure you want to clear all data?")) {
      setData([]);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <i className="fa-solid fa-file-invoice text-white text-xl"></i>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">OrderFlow <span className="text-blue-600">Parser</span></h1>
              <p className="text-xs text-gray-500">AI-Powered Order Data Extraction</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                isProcessing ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200'
              }`}
            >
              <i className="fa-solid fa-upload"></i>
              <span>Upload Docs</span>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
              multiple 
              accept="application/pdf,image/*"
            />
            
            <button 
              onClick={exportToCSV}
              disabled={data.length === 0 || isProcessing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <i className="fa-solid fa-download"></i>
              <span>Export CSV</span>
            </button>

            {data.length > 0 && (
              <button 
                onClick={clearAll}
                disabled={isProcessing}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                title="Clear All"
              >
                <i className="fa-solid fa-trash-can text-lg"></i>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <i className="fa-solid fa-list-check text-xl"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase">Total Items</p>
                <p className="text-2xl font-bold text-gray-900">{data.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-50 text-green-600 rounded-lg">
                <i className="fa-solid fa-dollar-sign text-xl"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase">Total Value</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${data.reduce((acc, curr) => acc + curr.totalAmount, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                <i className="fa-solid fa-file-contract text-xl"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase">Unique Orders</p>
                <p className="text-2xl font-bold text-gray-900">
                  {new Set(data.map(i => `${i.orderNumber}-${i.documentType}`)).size}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="mb-8 bg-blue-50 border border-blue-100 rounded-xl p-6 text-center animate-pulse">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
              <h3 className="text-lg font-semibold text-blue-900">Processing Documents...</h3>
              <p className="text-blue-700 text-sm">Gemini AI is scanning all pages for Invoices, Sales Orders, and more.</p>
              <div className="w-full max-w-md bg-blue-200 rounded-full h-2.5 mt-2">
                <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
              </div>
              <p className="text-xs text-blue-600 font-mono mt-1">{progress}% Complete</p>
            </div>
          </div>
        )}

        {/* Spreadsheet Component */}
        <DataTable data={data} onDelete={deleteItem} />

        {/* Info Box */}
        {data.length === 0 && !isProcessing && (
          <div className="mt-12 bg-white rounded-xl border border-gray-200 p-8 text-center max-w-2xl mx-auto">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Multi-Page Support</h2>
            <p className="text-gray-500 mb-6">
              Our AI is designed to process multi-page files. If a single PDF contains an Invoice, a Purchase Order, and a Picking Sheet on separate pages, it will extract data from each one and list them all below.
            </p>
            <div className="grid grid-cols-3 gap-4 text-left">
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                <div className="text-blue-600 mb-2"><i className="fa-solid fa-clone"></i></div>
                <h4 className="text-sm font-bold mb-1">Split Detection</h4>
                <p className="text-xs text-gray-500">Automatically detects where one document ends and another begins.</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                <div className="text-green-600 mb-2"><i className="fa-solid fa-layer-group"></i></div>
                <h4 className="text-sm font-bold mb-1">Flattened Data</h4>
                <p className="text-xs text-gray-500">Every line item from every document becomes its own row.</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                <div className="text-purple-600 mb-2"><i className="fa-solid fa-magnifying-glass-plus"></i></div>
                <h4 className="text-sm font-bold mb-1">Deep Scan</h4>
                <p className="text-xs text-gray-500">Analyzes header fields (PO#, Dates) for every page individually.</p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-400">
            Powered by Gemini 3 Flash & React • {new Date().getFullYear()} OrderFlow Parser
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
