/**
 * Storage seam for a future "persist/cache invoice PDFs" feature. Not called
 * anywhere yet — the download and email flows generate PDFs on demand and
 * discard the buffer after use. Exists so a later issue can implement a real
 * backend (S3/R2/Supabase) against an already-agreed shape.
 */
export interface InvoicePdfStorage {
  upload(key: string, pdf: Buffer): Promise<{ url: string }>;
}

export const mockInvoicePdfStorage: InvoicePdfStorage = {
  upload: async key => ({ url: `mock://invoice-pdfs/${key}` }),
};
