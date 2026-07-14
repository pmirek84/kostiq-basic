export const getMonthDays = (month: number = new Date().getMonth(), year: number = new Date().getFullYear()) => {
    const days = [];

    // First day of target month
    const firstDay = new Date(year, month, 1);

    // Get day index (0-6, Mon-Sun)
    // JS getDay(): 0=Sun, 1=Mon. We want 0=Mon, 6=Sun
    let startDayIdx = firstDay.getDay() - 1;
    if (startDayIdx === -1) startDayIdx = 6;

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Add empty slots/padding for days before start of month
    for (let i = 0; i < startDayIdx; i++) {
        // Calculate previous month dates
        const prevDate = new Date(year, month, -startDayIdx + i + 1);
        const yearStr = prevDate.getFullYear();
        const monthStr = String(prevDate.getMonth() + 1).padStart(2, '0');
        const dayStr = String(prevDate.getDate()).padStart(2, '0');

        days.push({
            dateStr: `${yearStr}-${monthStr}-${dayStr}`,
            dayOfMonth: prevDate.getDate(),
            isCurrentMonth: false
        });
    }

    // Add days of month
    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, month, i);
        const yearStr = date.getFullYear();
        const monthStr = String(date.getMonth() + 1).padStart(2, '0');
        const dayStr = String(date.getDate()).padStart(2, '0');

        days.push({
            dateStr: `${yearStr}-${monthStr}-${dayStr}`,
            dayOfMonth: i,
            isCurrentMonth: true
        });
    }

    return days;
};
