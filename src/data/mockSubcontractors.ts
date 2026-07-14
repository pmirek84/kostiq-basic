import type { Subcontractor } from '../models/types';

export const mockSubcontractors: Subcontractor[] = [
    { id: 'sub1', type: 'subcontractor', name: 'Alu-System Sp. z o.o.', specialization: 'Fasady Aluminiowe', settlementType: 'm2', rate: 150, currency: 'PLN', isActive: true },
    { id: 'sub2', type: 'subcontractor', name: 'Dźwigi i Podnośniki - Marek', specialization: 'Usługi dźwigowe', settlementType: 'godzina', rate: 250, currency: 'PLN', isActive: true },
    { id: 'sub3', type: 'subcontractor', name: 'Zud-Bud', specialization: 'Obróbki blacharskie', settlementType: 'ryczałt', rate: 0, currency: 'PLN', isActive: true },
    { id: 'sub4', type: 'subcontractor', name: 'Szyby24', specialization: 'Szklenie', settlementType: 'm2', rate: 80, currency: 'PLN', isActive: true },
];
