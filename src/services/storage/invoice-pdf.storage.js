export const mockInvoicePdfStorage = {
    upload: async (key) => ({ url: `mock://invoice-pdfs/${key}` }),
};
