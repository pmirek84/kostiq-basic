import type { Employee } from '../models/types';

export const mockEmployees: Employee[] = [
    { id: 'emp1', type: 'employee', firstName: 'Jan', lastName: 'Kowalski', role: 'foreman', hourlyRate: 80, currency: 'PLN', isActive: true },
    { id: 'emp2', type: 'employee', firstName: 'Piotr', lastName: 'Nowak', role: 'worker', hourlyRate: 60, currency: 'PLN', isActive: true },
    { id: 'emp3', type: 'employee', firstName: 'Adam', lastName: 'Wiśniewski', role: 'worker', hourlyRate: 45, currency: 'PLN', isActive: true },
    { id: 'emp4', type: 'employee', firstName: 'Krzysztof', lastName: 'Wójcik', role: 'foreman', hourlyRate: 70, currency: 'PLN', isActive: true },
    { id: 'emp5', type: 'employee', firstName: 'Michał', lastName: 'Lewandowski', role: 'Operator Dźwigu', hourlyRate: 120, currency: 'PLN', isActive: false },
];
