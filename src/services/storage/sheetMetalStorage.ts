import type { SheetMetalItem } from '../../hooks/useSheetMetal';
import { getAdapter } from './adapterFactory';

const STORAGE_KEY = 'sheet-metal'; // matches /api/sheet-metal endpoint in server.js
const repo = getAdapter<SheetMetalItem>(STORAGE_KEY);

const initialItems: SheetMetalItem[] = [
    {
        id: '1',
        name: 'Parapet zewnętrzny stalowy',
        type: 'Parapet',
        material: 'Stal ocynkowana',
        finishing: 'Lakier PVD',
        thickness: 0.7,
        width: 200,
        length: 1000,
        color: 'RAL 9016',
        unitPrice: 35.00,
        unit: 'mb',
        category: 'Parapety'
    },
    {
        id: '2',
        name: 'Parapet zewnętrzny aluminiowy',
        type: 'Parapet',
        material: 'Aluminium',
        finishing: 'Lakier proszkowy',
        thickness: 1.0,
        width: 200,
        length: 1000,
        color: 'RAL 9016',
        unitPrice: 50.00,
        unit: 'mb',
        category: 'Parapety'
    },
    {
        id: '3',
        name: 'Listwa maskująca',
        type: 'Listwa',
        material: 'Aluminium',
        finishing: 'Lakier proszkowy',
        thickness: 1.2,
        width: 30,
        length: 2000,
        color: 'RAL 9016',
        unitPrice: 45.00,
        unit: 'mb',
        category: 'Listwy'
    }
];

export const sheetMetalStorage = {
    async getAll(): Promise<SheetMetalItem[]> {
        let items = await repo.getAll();
        if (items.length === 0) {
            // Seed if empty
            for (const item of initialItems) {
                await repo.save(item);
            }
            items = initialItems;
        }
        return items;
    },

    async getById(id: string): Promise<SheetMetalItem | undefined> {
        return repo.getById(id);
    },

    async getMapById(): Promise<Record<string, SheetMetalItem>> {
        const all = await this.getAll();
        return all.reduce((acc, item) => {
            acc[item.id] = item;
            return acc;
        }, {} as Record<string, SheetMetalItem>);
    }
};
