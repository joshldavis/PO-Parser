import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GeminiParsingResult } from "../types";
import { ReferencePack } from "../referencePack.schema";

// Initialize with named parameter and direct process.env reference
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const DOCUMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    documentType: {
      type: Type.STRING,
      description: "Document type: e.g., 'Purchase Order', 'Sales Order', 'Invoice'.",
    },
    orderNumber: {
      type: Type.STRING,
      description: "The primary reference number (Order #, PO #, Invoice #).",
    },
    orderDate: {
      type: Type.STRING,
      description: "Date of issuance as written on the doc.",
    },
    customerName: {
      type: Type.STRING,
      description: "Full name of the customer or purchasing entity.",
    },
    vendorName: {
      type: Type.STRING,
      description: "Full name of the seller or issuing entity.",
    },
    customerPO: {
      type: Type.STRING,
      description: "Reference PO number provided by the customer.",
    },
    currency: {
      type: Type.STRING,
      description: "ISO currency code or symbol found.",
    },
    billToAddressRaw: { 
      type: Type.STRING, 
      description: "Complete Bill-To block text." 
    },
    shipToAddressRaw: { 
      type: Type.STRING, 
      description: "Complete Ship-To block text." 
    },
    markInstructions: { 
      type: Type.STRING, 
      description: "Special 'MARK FOR' or delivery instructions." 
    },
    lineItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          itemNumber: { type: Type.STRING, description: "Part Number or SKU." },
          description: { type: Type.STRING, description: "Full item description." },
          unit: { type: Type.STRING, description: "UOM (EA, FT, PC, etc.)." },
          quantityOrdered: { type: Type.NUMBER, description: "Total quantity ordered." },
          quantityShipped: { type: Type.NUMBER, description: "Total quantity shipped/supplied." },
          unitPrice: { type: Type.NUMBER, description: "Cost per single unit." },
          totalAmount: { type: Type.NUMBER, description: "Line extension total." },
          manufacturer: { type: Type.STRING, description: "Identified manufacturer from Ref Pack or text." },
          finish: { type: Type.STRING, description: "Identified finish code (e.g. US26D)." },
          category: { type: Type.STRING, description: "Identified hardware category." },
          voltage: { type: Type.STRING, description: "Voltage if electrified (e.g. 12V, 24V)." },
          failMode: { type: Type.STRING, description: "Fail Safe/Secure if applicable." },
        },
        required: ["itemNumber", "description"],
      },
    },
  },
  required: ["documentType", "orderNumber", "lineItems"],
};

const PARSER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    documents: {
      type: Type.ARRAY,
      description: "A list of distinct business documents extracted from the file.",
      items: DOCUMENT_SCHEMA,
    }
  },
  required: ["documents"]
};

/**
 * Helper to handle API resilience with exponential backoff
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRetryable = error?.status === 429 || error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED");
    if (isRetryable && retries > 0) {
      console.warn(`Rate limit hit. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function parseDocument(
  fileBase64: string, 
  mimeType: string, 
  ocrText?: string,
  refPack?: ReferencePack
): Promise<GeminiParsingResult> {
  
  let refContext = '';
  if (refPack) {
    refContext = `
    INDUSTRIAL KNOWLEDGE BASE (Reference Pack v${refPack.version}):
    - Known Manufacturers (Use these names/abbr): ${refPack.manufacturers.map(m => `${m.name} (${m.abbr})`).join(', ')}
    - Standard Finishes: ${refPack.finishes.map(f => f.us_code).join(', ')}
    - Hardware Categories: ${refPack.categories.map(c => c.category).join(', ')}
    
    INSTRUCTION: Use this context to cross-reference and NORMALIZE the extracted data. 
    If you see 'LCN' in a description, set manufacturer to 'LCN'. 
    If you see 'Satin Chrome' or '626', map finish to 'US26D'.
    `;
  }

  // Fix: Explicitly typing the response as GenerateContentResponse to fix property access errors on 'unknown' type.
  const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [
      {
        parts: [
          {
            text: `ACT AS A SENIOR ENTERPRISE DOCUMENT ANALYST.
            Goal: Extract all line items and normalize them for ERP import.
            
            Instructions:
            1. Extract header details: Entities, Addresses, PO/Order IDs.
            2. Extract ALL line items accurately.
            3. Populate normalization fields (manufacturer, finish, category) by matching text patterns against the provided reference knowledge.
            4. Merge multi-line descriptions into a single clean string.

            ${refContext}

            ${ocrText ? `OCR HINT:\n---\n${ocrText}\n---` : ''}

            Output must be valid JSON following the provided schema.`
          },
          {
            inlineData: {
              data: fileBase64,
              mimeType: mimeType,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: PARSER_SCHEMA,
      temperature: 0.1,
    },
  }));

  // Fix: Property 'text' is accessible after proper typing of GenerateContentResponse
  if (!response.text) {
    throw new Error("Empty response from AI engine");
  }

  try {
    // Fix: Access .text property directly to get response string as per Gemini API guidelines
    return JSON.parse(response.text.trim()) as GeminiParsingResult;
  } catch (e) {
    // Fix: Accessing .text for error reporting
    console.error("JSON Parsing failed", e, response.text);
    throw new Error("AI returned invalid JSON.");
  }
}
