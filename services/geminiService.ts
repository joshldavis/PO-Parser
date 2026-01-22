
import { GoogleGenAI, Type } from "@google/genai";
import { GeminiParsingResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const DOCUMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    documentType: {
      type: Type.STRING,
      description: "The type of document (Invoice, Sales Order, Purchase Order, Picking Sheet, etc.)",
    },
    orderNumber: {
      type: Type.STRING,
      description: "The order or invoice number specific to this document",
    },
    orderDate: {
      type: Type.STRING,
      description: "The date listed on this specific document",
    },
    customerName: {
      type: Type.STRING,
      description: "The name of the customer or 'Sold To' party",
    },
    vendorName: {
      type: Type.STRING,
      description: "The name of the vendor or issuing company",
    },
    customerPO: {
      type: Type.STRING,
      description: "The Customer PO number if available",
    },
    currency: {
      type: Type.STRING,
      description: "The currency (e.g., USD, EUR)",
    },
    lineItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          itemNumber: { type: Type.STRING },
          description: { type: Type.STRING },
          unit: { type: Type.STRING },
          quantityOrdered: { type: Type.NUMBER },
          quantityShipped: { type: Type.NUMBER },
          unitPrice: { type: Type.NUMBER },
          totalAmount: { type: Type.NUMBER },
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
      description: "A list of all distinct documents found in the provided file. For example, if page 1 is an Invoice and page 2 is a Purchase Order, these should be two separate entries in this array.",
      items: DOCUMENT_SCHEMA,
    }
  },
  required: ["documents"]
};

export async function parseDocument(fileBase64: string, mimeType: string): Promise<GeminiParsingResult> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            text: `This file contains one or more documents related to a purchase or sales process (e.g., Invoices, Sales Orders, Purchase Orders, Picking Sheets). 
            Please scan ALL pages of the file. 
            Identify each distinct document found. 
            For EACH document identified, extract all header information and all line items.
            Flatten the line items into the provided schema structure within the 'documents' array.`
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
    },
  });

  if (!response.text) {
    throw new Error("No response from Gemini API");
  }

  try {
    return JSON.parse(response.text.trim()) as GeminiParsingResult;
  } catch (e) {
    console.error("JSON Parse Error:", e, response.text);
    throw new Error("Failed to parse AI response into valid JSON");
  }
}
