import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { Job } from '../../models/types';

// =============================================================
// FIX #3: PDF Memory Leak Prevention
// =============================================================
const MAX_CANVAS_WIDTH = 1200;
const JPEG_QUALITY = 0.65;
const MAX_PHOTOS_PER_ENTRY = 5;
const MAX_TOTAL_PHOTOS = 60;

export interface ReportOptions {
    dateFrom?: string;
    dateTo?: string;
    onlyApproved?: boolean;
    resolveAuthor?: (id: string) => string;
    /** When true, also uploads the PDF to backend and registers in archived-reports */
    saveToServer?: boolean;
    /** Required when saveToServer=true */
    jobCode?: string;
    jobName?: string;
    entryCount?: number;
    reportTitle?: string;
}

/** Upload generated PDF blob to backend, register in archived-reports collection */
export const savePdfToServer = async (pdfBlob: Blob, job: Job, opts: ReportOptions): Promise<any | null> => {
    try {
        const token = localStorage.getItem('kostiq_token');
        if (!token) return null;

        const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api$/, '');
        const suffix = opts.onlyApproved ? '_zatwierdzone' : '_wszystkie';
        const period = opts.dateFrom ? `_${opts.dateFrom.replace(/-/g, '')}-${(opts.dateTo ?? '').replace(/-/g, '')}` : '';
        const filename = `Raport_${job.jobCode}${period}${suffix}_${format(new Date(), 'yyyyMMdd')}.pdf`;

        const formData = new FormData();
        formData.append('file', pdfBlob, filename);
        formData.append('jobId', job.id);
        formData.append('jobCode', job.jobCode || '');
        formData.append('jobName', job.name || '');
        formData.append('title', opts.reportTitle || `Raport ${job.jobCode}${period}${suffix}`);
        formData.append('dateFrom', opts.dateFrom || '');
        formData.append('dateTo', opts.dateTo || '');
        formData.append('onlyApproved', String(opts.onlyApproved ?? false));
        formData.append('entryCount', String(opts.entryCount ?? 0));

        const res = await fetch(`${baseUrl}/api/archived-reports/save-pdf`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData
        });

        if (!res.ok) {
            console.error('[PDF Save] Server error:', res.status);
            return null;
        }
        const record = await res.json();
        console.log('[PDF Save] Archived report saved:', record.id);
        return record;
    } catch (e) {
        console.error('[PDF Save] Failed:', e);
        return null;
    }
};

const getBase64ImageFromURL = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.setAttribute('crossOrigin', 'anonymous');
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = img.width > MAX_CANVAS_WIDTH ? MAX_CANVAS_WIDTH / img.width : 1;
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataURL = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
            canvas.width = 0;
            canvas.height = 0;
            resolve(dataURL);
        };
        img.onerror = (error) => reject(error);
        img.src = url;
    });
};

const TYPE_LABELS: Record<string, string> = {
    work_day: 'Dzień pracy',
    note: 'Notatka',
    issue: 'Problem',
    extra_work: 'Prace dodatkowe',
    milestone: 'Kamień milowy',
    site_log: 'Raport z budowy',
    dzienny: 'Raport dzienny',
    problem: 'Problem',
    zmiana_zakresu: 'Zmiana zakresu',
    'odbiór_częściowy': 'Odbiór częściowy',
};

export const generateConstructionReport = async (job: Job, entries: any[], options: ReportOptions = {}) => {
    const { dateFrom, dateTo, onlyApproved, resolveAuthor } = options;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    // Load Roboto font to support Polish diacritics
    try {
        const loadFont = async (url: string): Promise<string> => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load font from ${url}`);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        };
        const fontRegular = await loadFont('/fonts/Roboto-Regular.ttf');
        const fontBold = await loadFont('/fonts/Roboto-Bold.ttf');
        doc.addFileToVFS('Roboto-Regular.ttf', fontRegular);
        doc.addFileToVFS('Roboto-Bold.ttf', fontBold);
        doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
        doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
        doc.setFont('Roboto', 'normal');
    } catch (e) {
        console.error("Could not load custom fonts in construction report", e);
        doc.setFont('helvetica', 'normal');
    }

    // ── Header ─────────────────────────────────────────────────
    doc.setFillColor(33, 128, 141);
    doc.rect(0, 0, pageWidth, 50, 'F');
    doc.setTextColor(255, 255, 255);

    doc.setFontSize(22);
    doc.setFont('Roboto', 'bold');
    doc.text('RAPORT Z BUDOWY', margin, 22);

    doc.setFontSize(10);
    doc.setFont('Roboto', 'normal');
    doc.text(`Zlecenie: ${job.jobCode} - ${job.name}`, margin, 33);

    if (dateFrom && dateTo) {
        doc.text(`Okres: ${dateFrom} — ${dateTo}`, margin, 41);
    }
    doc.text(`Wygenerowano: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`, pageWidth - margin, 41, { align: 'right' });
    doc.text(`Wygenerowano: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`, pageWidth - margin, 33, { align: 'right' });

    y = 65;

    // ── Report scope badge ──────────────────────────────────────
    if (onlyApproved) {
        doc.setFillColor(220, 252, 231);
        doc.setDrawColor(134, 239, 172);
        doc.roundedRect(margin, y, pageWidth - 2 * margin, 10, 2, 2, 'FD');
        doc.setTextColor(22, 101, 52);
        doc.setFontSize(9);
        doc.setFont('Roboto', 'bold');
        doc.text('✓  Raport zawiera wyłącznie wpisy zatwierdzone do raportu przez administratora.', margin + 4, y + 6.5);
        y += 16;
    }

    // ── Job info table ──────────────────────────────────────────
    doc.setTextColor(33, 128, 141);
    doc.setFontSize(13);
    doc.setFont('Roboto', 'bold');
    doc.text('Informacje o projekcie', margin, y);
    y += 6;

    autoTable(doc, {
        startY: y,
        margin: { left: margin },
        styles: { font: 'Roboto' },
        body: [
            ['Klient:', job.clientName || '—'],
            ['Lokalizacja:', job.location || '—'],
            ['Kierownik:', job.projectManager || '—'],
            ['Status:', job.status?.toUpperCase() || '—'],
            ['Wpisów w raporcie:', String(entries.length)],
        ],
        theme: 'plain',
        bodyStyles: { fontSize: 9.5, cellPadding: 2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } }
    });

    y = (doc as any).lastAutoTable.finalY + 15;

    // ── Photo total warning ─────────────────────────────────────
    const totalPhotosCount = entries.reduce((sum, e) => sum + (e.photos?.length ?? 0), 0);
    if (totalPhotosCount > MAX_TOTAL_PHOTOS) {
        doc.setFontSize(9);
        doc.setTextColor(200, 100, 0);
        doc.setFont('Roboto', 'italic');
        doc.text(
            `⚠ Raport zawiera ${totalPhotosCount} zdjęć. Wyświetlono maks. ${MAX_TOTAL_PHOTOS} (${MAX_PHOTOS_PER_ENTRY}/wpis).`,
            margin, y, { maxWidth: pageWidth - 2 * margin }
        );
        y += 12;
        doc.setTextColor(0, 0, 0);
    }

    // ── Entries section header ──────────────────────────────────
    doc.setTextColor(33, 128, 141);
    doc.setFontSize(13);
    doc.setFont('Roboto', 'bold');
    doc.text('Dziennik prac i zdarzeń', margin, y);
    y += 10;

    let totalPhotosRendered = 0;

    for (const entry of entries) {
        if (y > 250) { doc.addPage(); y = 20; }

        const dateStr = (() => {
            try { return format(new Date(entry.date), 'dd MMMM yyyy', { locale: pl }); }
            catch { return entry.date ?? ''; }
        })();

        // ── Entry outer box ─────────────────────────────────────
        // Approved badge stripe
        if (entry.isApprovedForReport) {
            doc.setFillColor(220, 252, 231);
            doc.rect(margin, y, 3, 8, 'F');
        }

        doc.setFillColor(248, 249, 252);
        doc.setDrawColor(220, 220, 230);
        doc.rect(margin, y, pageWidth - 2 * margin, 10, 'FD');

        doc.setTextColor(50, 50, 60);
        doc.setFontSize(10);
        doc.setFont('Roboto', 'bold');
        const typeLabel = TYPE_LABELS[entry.type] ?? entry.type ?? '';
        doc.text(`${dateStr}  ·  ${typeLabel}`, margin + 5, y + 6.5);

        // Source tag (Teren / Biuro)
        const sourceTag = entry.source === 'pwa' ? ' [Teren]' : ' [Biuro]';
        doc.setFontSize(7);
        doc.setFont('Roboto', 'italic');
        doc.setTextColor(130, 130, 160);
        doc.text(sourceTag, pageWidth - margin - 5, y + 6.5, { align: 'right' });

        y += 13;

        // Author + approved indicator
        const authorName = resolveAuthor ? resolveAuthor(entry.authorId) : (entry.authorId ?? '—');
        doc.setFontSize(8.5);
        doc.setFont('Roboto', 'italic');
        doc.setTextColor(110, 110, 130);
        let metaLine = `Autor: ${authorName}`;
        if (entry.isApprovedForReport) {
            doc.setTextColor(22, 101, 52);
            metaLine += '   ✓ Zatwierdzony do raportu';
        }
        doc.text(metaLine, margin + 5, y);
        y += 7;

        // Entry title (if present)
        if (entry.title) {
            doc.setFontSize(10);
            doc.setFont('Roboto', 'bold');
            doc.setTextColor(40, 40, 60);
            doc.text(entry.title, margin + 5, y);
            y += 6;
        }

        // Weather / workers
        if (entry.details?.weather || entry.details?.workers) {
            doc.setFontSize(8.5);
            doc.setFont('Roboto', 'italic');
            doc.setTextColor(100, 120, 140);
            const info: string[] = [];
            if (entry.details.weather) info.push(`Pogoda: ${entry.details.weather}`);
            if (entry.details.workers) info.push(`Pracowników: ${entry.details.workers}`);
            doc.text(info.join('   |   '), margin + 5, y);
            y += 7;
        }

        // Description text
        doc.setFontSize(10);
        doc.setFont('Roboto', 'normal');
        doc.setTextColor(30, 30, 30);
        const splitText = doc.splitTextToSize(entry.text || '', pageWidth - 2 * margin - 10);
        doc.text(splitText, margin + 5, y);
        y += (splitText.length * 5) + 6;

        // Photos
        const photos: string[] = entry.photos ?? [];
        if (photos.length > 0 && totalPhotosRendered < MAX_TOTAL_PHOTOS) {
            const photoHeight = 42;
            const photoWidth = 52;
            const gap = 5;
            let currentX = margin + 5;

            if (y + photoHeight > 270) { doc.addPage(); y = 20; }

            const photosForEntry = photos.slice(0, MAX_PHOTOS_PER_ENTRY);
            const globalSlotsLeft = MAX_TOTAL_PHOTOS - totalPhotosRendered;
            const photosToRender = photosForEntry.slice(0, globalSlotsLeft);
            const skippedCount = photos.length - photosToRender.length;

            const baseUploadUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').split('/api')[0];

            for (const photoUrl of photosToRender) {
                try {
                    const fullUrl = photoUrl.startsWith('data:image') || photoUrl.startsWith('http')
                        ? photoUrl
                        : `${baseUploadUrl}${photoUrl}`;

                    const base64 = await getBase64ImageFromURL(fullUrl);
                    doc.addImage(base64, 'JPEG', currentX, y, photoWidth, photoHeight);
                    totalPhotosRendered++;

                    currentX += photoWidth + gap;
                    if (currentX + photoWidth > pageWidth - margin) {
                        currentX = margin + 5;
                        y += photoHeight + gap;
                        if (y + photoHeight > 270) { doc.addPage(); y = 20; currentX = margin + 5; }
                    }
                } catch (e) {
                    console.error('[PDF] Failed to add image:', e);
                }
            }

            if (currentX > margin + 5) { y += photoHeight + 10; }

            if (skippedCount > 0) {
                doc.setFontSize(8);
                doc.setTextColor(150, 80, 0);
                doc.setFont('Roboto', 'italic');
                doc.text(`(+${skippedCount} zdjęć pominiętych)`, margin + 5, y);
                y += 6;
            }
        } else {
            y += 5;
        }

        y += 8;
    }

    // ── Footer on all pages ─────────────────────────────────────
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
            `Strona ${i} z ${pageCount}  |  KOSTIQ — Dziennik Budowy  |  ${job.jobCode}`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 10,
            { align: 'center' }
        );
    }

    const suffix = onlyApproved ? '_zatwierdzone' : '_wszystkie';
    const period = dateFrom ? `_${dateFrom.replace(/-/g, '')}-${(dateTo ?? '').replace(/-/g, '')}` : '';
    const filename = `Raport_${job.jobCode}${period}${suffix}_${format(new Date(), 'yyyyMMdd')}.pdf`;

    // Always trigger browser download
    doc.save(filename);

    // Optionally also save to server
    if (options.saveToServer) {
        const blob = doc.output('blob');
        const record = await savePdfToServer(blob, job, {
            ...options,
            entryCount: options.entryCount ?? entries.length,
            reportTitle: `Raport ${job.jobCode}${period}${suffix}`,
        });
        return record;
    }
    return null;
};
