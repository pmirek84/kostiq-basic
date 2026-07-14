import type { Material } from '../../models/types';
import { getAdapter } from './adapterFactory';

const materialRepo = getAdapter<Material>('materials');

export const materialsStorage = {
    async getAllMaterials(): Promise<Material[]> {
        return materialRepo.getAll();
    },

    async getMaterialsByCategory(category: string): Promise<Material[]> {
        return materialRepo.getByIndex('by-category', category);
    },

    async getMaterial(id: string): Promise<Material | undefined> {
        return materialRepo.getById(id);
    },

    async updateMaterial(id: string, updates: Partial<Material>): Promise<void> {
        return materialRepo.update(id, updates);
    },

    async saveMaterial(material: Material): Promise<string> {
        return materialRepo.save(material);
    },

    async deleteMaterial(id: string): Promise<void> {
        return materialRepo.delete(id);
    },

    // Helper to get a map for quick lookups
    async getMaterialMapById(): Promise<Record<string, Material>> {
        const all = await this.getAllMaterials();
        return all.reduce((acc, m) => {
            acc[m.id] = m;
            return acc;
        }, {} as Record<string, Material>);
    }
};
