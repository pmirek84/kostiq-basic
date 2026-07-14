import { useState, useEffect, useCallback } from 'react';
import type { Material } from '../models/types';
import { catalogGetAll, catalogCreate, catalogUpdate, catalogDelete } from './catalogApi';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

const COLLECTION = 'materials';

export function useMaterials() {
    const [materials, setMaterials] = useState<Material[]>([]);
    const [loading, setLoading] = useState(true);

    const refreshMaterials = useCallback(async () => {
        try {
            setLoading(true);
            const data = await catalogGetAll<Material>(COLLECTION);
            setMaterials(data);
        } catch (err) {
            console.error('Failed to load materials from API', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshMaterials();
    }, [refreshMaterials]);

    const addMaterial = async (material: Omit<Material, 'id' | 'createdAt' | 'updatedAt'>) => {
        try {
            const newMaterial: Material = {
                ...material,
                id: uuidv4(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await catalogCreate(COLLECTION, newMaterial);
            toast.success('Materiał został dodany');
            await refreshMaterials();
        } catch (error) {
            console.error('Failed to add material', error);
            // Error toast handled by CatalogApi/MongoAdapter
        }
    };

    const updateMaterial = async (id: string, updates: Partial<Material>) => {
        try {
            await catalogUpdate(COLLECTION, id, { ...updates, updatedAt: new Date().toISOString() });
            toast.success('Zmiany zostały zapisane');
            await refreshMaterials();
        } catch (error) {
            console.error('Failed to update material', error);
        }
    };

    const deleteMaterial = async (id: string) => {
        try {
            await catalogDelete(COLLECTION, id);
            toast.success('Materiał został zarchiwizowany');
            await refreshMaterials();
        } catch (error) {
            console.error('Failed to delete material', error);
        }
    };

    return {
        materials,
        loading,
        addMaterial,
        updateMaterial,
        deleteMaterial,
        refreshMaterials
    };
}
