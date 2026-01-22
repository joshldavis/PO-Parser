
export enum DocumentType {
  INVOICE = 'Invoice',
  SALES_ORDER = 'Sales Order',
  PURCHASE_ORDER = 'Purchase Order',
  PICKING_SHEET = 'Picking Sheet',
  UNKNOWN = 'Unknown'
}

export interface OrderLineItem {
  id: string; // Internal unique ID
  sourceFile: string;
  documentType: DocumentType;
  orderNumber: string;
  orderDate: string;
  customerName: string;
  vendorName: string;
  itemNumber: string;
  description: string;
  unit: string;
  quantityOrdered: number;
  quantityShipped: number;
  unitPrice: number;
  totalAmount: number;
  currency: string;
  customerPO: string;
}

export interface DocumentData {
  documentType: DocumentType;
  orderNumber: string;
  orderDate: string;
  customerName: string;
  vendorName: string;
  customerPO: string;
  currency: string;
  lineItems: Array<{
    itemNumber: string;
    description: string;
    unit: string;
    quantityOrdered: number;
    quantityShipped: number;
    unitPrice: number;
    totalAmount: number;
  }>;
}

export interface GeminiParsingResult {
  documents: DocumentData[];
}
