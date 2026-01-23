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
  billToAddressRaw?: string;
  shipToAddressRaw?: string;
  markInstructions?: string;
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
export type AutomationLane = "AUTO" | "ASSIST" | "HUMAN";
export type ItemClass = "CATALOG" | "CONFIGURED" | "CUSTOM" | "UNKNOWN";

export type EdgeCaseCode =
  | "" | "SPECIAL_LAYOUT" | "CREDIT_MEMO" | "RGA" | "CUSTOM_LENGTH"
  | "ZERO_DOLLAR" | "THIRD_PARTY_SHIP" | "WIRING_SPEC" | "CUSTOMER_PICKUP" | "OTHER";

export interface POLineRow {
  // doc-level (repeated per row)
  doc_id: string;                 // filename stem or orderNumber
  doc_type: "INVOICE" | "SALES_ORDER" | "PURCHASE_ORDER" | "CREDIT_MEMO" | "UNKNOWN";
  customer_name: string;
  customer_po_number: string;
  doc_date: string;
  ship_to_address_raw: string;
  bill_to_address_raw: string;
  mark_instructions: string;

  // line-level
  line_no: number;
  item_no: string;                // ABH item #
  customer_item_no: string;
  customer_item_desc_raw: string;
  qty: number | null;
  uom: string;
  unit_price: number | null;
  extended_price: number | null;

  // classification + routing
  item_class: ItemClass;
  edge_case_flag_1: EdgeCaseCode;
  edge_case_flag_2: EdgeCaseCode;
  edge_case_flag_3: EdgeCaseCode;
  confidence_score: number;        // 0..1 extraction confidence only
  fields_requiring_review: string; // semicolon list
  routing_reason: string;
  automation_lane: AutomationLane;
  phase_target: 1 | 2 | 3;

  // mapping hooks
  abh_item_no_candidate: string;
  abh_item_no_final: string;
}