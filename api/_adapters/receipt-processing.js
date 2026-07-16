import { processReceipt } from '../_lib/receipt-enricher.js';
import { parseReceiptEmail } from '../_lib/receipt-parser.js';

export const receiptProcessingAdapter = {
  parse: parseReceiptEmail,
  enrich: processReceipt,
};
