import ExcelJS from 'exceljs';
import { Buffer } from 'buffer';

/**
 * Converts an ArrayBuffer or Buffer to a Base64 string using the polyfilled Buffer.
 */
export const arrayBufferToBase64 = (buffer: ArrayBuffer | Uint8Array | Buffer): string => {
  return Buffer.from(buffer as any).toString('base64');
};

export interface ExcelSheet {
  name: string;
  data: any[][];
  columns?: { width: number }[];
}

/**
 * Generates an Excel file as a Base64 string using exceljs.
 */
export const generateExcel = async (sheets: ExcelSheet[]): Promise<string> => {
  const workbook = new ExcelJS.Workbook();

  for (const s of sheets) {
    const worksheet = workbook.addWorksheet(s.name);
    worksheet.addRows(s.data);

    if (s.columns) {
      worksheet.columns = s.columns.map(col => ({ width: col.width }));
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return arrayBufferToBase64(buffer as Buffer);
};
