export const formatDate = (date: string | Date | undefined): string => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pl-PL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
};

export const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('pl-PL', {
        style: 'currency',
        currency: 'PLN'
    }).format(amount);
};
