import * as XLSX from 'xlsx';

export interface ParsedConstruction {
    name: string;
    type: string;
    width: number;
    height: number;
    quantity: number;
}

const COLUMN_MAP: Record<string, keyof ParsedConstruction> = {
    'nazwa': 'name',
    'name': 'name',
    'typ': 'type',
    'type': 'type',
    'rodzaj': 'type',
    'szerokość': 'width',
    'szerokosc': 'width',
    'width': 'width',
    'szer': 'width',
    'wysokość': 'height',
    'wysokosc': 'height',
    'height': 'height',
    'wys': 'height',
    'ilość': 'quantity',
    'ilosc': 'quantity',
    'quantity': 'quantity',
    'szt': 'quantity',
    'qty': 'quantity',
    'il.': 'quantity',
};

function normalizeHeader(header: string): string {
    return header
        .toLowerCase()
        .trim()
        .replace(/[.\-_]/g, '')
        .replace(/\s+/g, ' ');
}

function mapHeaders(headers: string[]): Record<number, keyof ParsedConstruction> {
    const mapping: Record<number, keyof ParsedConstruction> = {};
    headers.forEach((h, i) => {
        const normalized = normalizeHeader(h);
        // Try exact match first
        if (COLUMN_MAP[normalized]) {
            mapping[i] = COLUMN_MAP[normalized];
            return;
        }
        // Try partial match
        for (const [key, field] of Object.entries(COLUMN_MAP)) {
            if (normalized.includes(key)) {
                mapping[i] = field;
                return;
            }
        }
    });
    return mapping;
}

export async function parseConstructionsFile(file: File): Promise<ParsedConstruction[]> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) {
        throw new Error('Plik jest pusty lub zawiera tylko nagłówki');
    }

    const headers = (rows[0] as string[]).map(String);
    const columnMapping = mapHeaders(headers);

    if (!Object.values(columnMapping).includes('name')) {
        throw new Error('Nie znaleziono kolumny z nazwą konstrukcji (Nazwa/Name)');
    }

    const results: ParsedConstruction[] = [];

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const item: Partial<ParsedConstruction> = {};
        for (const [colIdx, field] of Object.entries(columnMapping)) {
            const val = row[Number(colIdx)];
            if (val === undefined || val === null || val === '') continue;

            if (field === 'name' || field === 'type') {
                item[field] = String(val).trim();
            } else {
                item[field] = Number(val) || 0;
            }
        }

        if (!item.name) continue;

        results.push({
            name: item.name || '',
            type: item.type || 'custom',
            width: item.width || 0,
            height: item.height || 0,
            quantity: item.quantity || 1,
        });
    }

    return results;
}

export interface ParsedJobStructure {
    lp: string;
    type: string;
    width: number;
    height: number;
    quantity: number;
    priceNet: number;
    notes?: string;
}

export async function parseJobStructuresFile(file: File): Promise<Omit<ParsedJobStructure, 'id'>[]> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) {
        throw new Error('Plik jest pusty lub zawiera tylko nagłówki');
    }

    const headers = (rows[0] as string[]).map(String).map(h => h.toLowerCase().trim());
    
    let lpIdx = -1;
    let typeIdx = -1;
    let widthIdx = -1;
    let heightIdx = -1;
    let qtyIdx = -1;
    let priceIdx = -1;
    let notesIdx = -1;

    headers.forEach((h, idx) => {
        if (h === 'lp' || h === 'lp.' || h === 'l.p.') lpIdx = idx;
        else if (h.includes('typ') || h.includes('rodzaj') || h.includes('type') || h.includes('konstrukcja')) typeIdx = idx;
        else if (h.includes('szer') || h.includes('width') || h.includes('szerokość') || h.includes('szerokosc')) widthIdx = idx;
        else if (h.includes('wys') || h.includes('height') || h.includes('wysokość') || h.includes('wysokosc')) heightIdx = idx;
        else if (h.includes('szt') || h.includes('ilość') || h.includes('ilosc') || h.includes('qty') || h.includes('quantity') || h.includes('sztuki')) qtyIdx = idx;
        else if (h.includes('cena') || h.includes('netto') || h.includes('price')) priceIdx = idx;
        else if (h.includes('uwag') || h.includes('notes') || h.includes('comment')) notesIdx = idx;
    });

    if (typeIdx === -1) typeIdx = headers.findIndex(h => h.includes('nazwa') || h.includes('opis') || h.includes('model'));
    if (qtyIdx === -1) qtyIdx = headers.findIndex(h => h.includes('pcs') || h.includes('szt'));

    const results: Omit<ParsedJobStructure, 'id'>[] = [];

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const lpVal = lpIdx !== -1 && row[lpIdx] !== undefined ? String(row[lpIdx]).trim() : String(i);
        const typeVal = typeIdx !== -1 && row[typeIdx] !== undefined ? String(row[typeIdx]).trim() : '';
        const widthVal = widthIdx !== -1 && row[widthIdx] !== undefined ? Number(row[widthIdx]) || 0 : 0;
        const heightVal = heightIdx !== -1 && row[heightIdx] !== undefined ? Number(row[heightIdx]) || 0 : 0;
        const qtyVal = qtyIdx !== -1 && row[qtyIdx] !== undefined ? Number(row[qtyIdx]) || 1 : 1;
        const priceVal = priceIdx !== -1 && row[priceIdx] !== undefined ? Number(row[priceIdx]) || 0 : 0;
        const notesVal = notesIdx !== -1 && row[notesIdx] !== undefined ? String(row[notesIdx]).trim() : '';

        if (!typeVal) continue;

        results.push({
            lp: lpVal,
            type: typeVal,
            width: widthVal,
            height: heightVal,
            quantity: qtyVal,
            priceNet: priceVal,
            notes: notesVal
        });
    }

    return results;
}
