
export enum DocumentType {
  INVOICE = 'Invoice',
  SALES_ORDER = 'Sales Order',
  PURCHASE_ORDER = 'Purchase Order',
  PICKING_SHEET = 'Picking Sheet',
  UNKNOWN = 'Unknown'
}

export interface POLineRow {
  // Raw document fields
  doc_id: string;
  doc_type: "INVOICE" | "SALES_ORDER" | "PURCHASE_ORDER" | "CREDIT_MEMO" | "UNKNOWN";
  customer_name: string;
  customer_po_number: string;
  doc_date: string;
  
  line_no: number;
  customer_item_no?: string;
  description_raw: string;
  quantity: number | null;
  uom_raw: string;
  unit_price: number | null;
  extended_price: number | null;

  // Canonical identity / ERP fields
  abh_item_id?: string;
  sage_item_no?: string;
  sage_uom?: string;

  // Normalized hardware spec
  manufacturer_abbr?: string;
  manufacturer_full?: string;
  finish_us_code?: string;
  finish_bhma_code?: string;
  category?: string;
  subcategory?: string;
  gordon_symbol?: string;
  electrified_device_type?: string;
  voltage?: string;
  fail_mode?: string;
  wiring_configuration?: string;
  hardware_set_template?: string;

  // Trust & audit
  match_score: number;        // 0..1
  match_method: string;       // e.g., "AI_Grounded", "Fuzzy", "Exact"
  rule_violations: string[];
  reference_version?: string;

  // UI/Routing Gating
  automation_lane: "AUTO" | "ASSIST" | "HUMAN";
  phase_target: 1 | 2 | 3;
  sage_import_ready: boolean;
  sage_blockers: string[];
  needs_review_reason?: string;

  // Extra context for exports
  bill_to_address_raw?: string;
  ship_to_address_raw?: string;
  mark_instructions?: string;

  // Legacy / analysis fields (restored)
  item_class?: "CUSTOM" | "CATALOG" | "UNKNOWN";
  edge_case_flag_1?: string;
  edge_case_flag_2?: string;
  edge_case_flag_3?: string;
  fields_requiring_review?: string; // semicolon separated
  routing_reason?: string;
  deterministic_rule_exists?: "Y" | "";
  confidence_score?: number; // 0..1 (optional; derived from match_score if not set)
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
    // Enhanced extraction fields
    manufacturer?: string;
    finish?: string;
    category?: string;
    voltage?: string;
    failMode?: string;
  }>;
}

export interface GeminiParsingResult {
  documents: DocumentData[];
}
