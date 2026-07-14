import { useState, useEffect, useCallback } from 'react';
import { catalogGetAll, catalogCreate, catalogUpdate, catalogDelete } from './catalogApi';

export interface SheetMetalItem {
    id: string;
    name: string;
    type: string;
    material: string;
    finishing: string;
    thickness: number;
    width: number;
    length: number;
    color: string;
    unitPrice: number;
    unit: string;
    category: string;
}

const COLLECTION = 'sheet-metal';

export function useSheetMetal() {
    const [items, setItems] = useState<SheetMetalItem[]>([]);
    const [loading, setLoading] = useState(true);

    const loadItems = useCallback(async () => {
        try {
            setLoading(true);
            const data = await catalogGetAll<SheetMetalItem>(COLLECTION);
            setItems(data);
        } catch (e) {
            console.error('Failed to load sheet metal items from API', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    const addItem = async (item: Omit<SheetMetalItem, 'id'>) => {
        const newItem = { ...item, id: crypto.randomUUID() };
        await catalogCreate(COLLECTION, newItem);
        await loadItems();
    };

    const updateItem = async (id: string, updates: Partial<SheetMetalItem>) => {
        await catalogUpdate(COLLECTION, id, updates);
        await loadItems();
    };

    const deleteItem = async (id: string) => {
        await catalogDelete(COLLECTION, id);
        await loadItems();
    };

    return {
        items,
        loading,
        addItem,
        updateItem,
        deleteItem
    };
}
