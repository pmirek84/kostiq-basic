import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { Job, StageMaterialDemand, JobMaterialItem } from '../../models/types';

export const generateMaterialsReport = async (
    job: Job,
    bomData: StageMaterialDemand | null,
    logisticsList: JobMaterialItem[]
) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;

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
        console.error("Could not load custom fonts", e);
        doc.setFont('helvetica', 'normal');
    }

    // Header Background
    doc.setFillColor(33, 128, 141); // #21808D (Kostiq Teal)
    doc.rect(0, 0, pageWidth, 40, 'F');

    // Header Title
    doc.setTextColor(255, 255, 255);
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(16);
    doc.text('ZESTAWIENIE MATERIAŁÓW MONTAŻOWYCH', margin, 18);

    doc.setFont('Roboto', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(210, 240, 243);
    doc.text(`Zlecenie: ${job.jobCode}  ·  ${job.name}`, margin, 26);
    doc.text(`Data wydruku: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`, margin, 32);

    let y = 50;

    // SECTION 1: BOM (Calculated from standards/offers)
    if (bomData && bomData.items.length > 0) {
        doc.setTextColor(33, 128, 141);
        doc.setFont('Roboto', 'bold');
        doc.setFontSize(12);
        doc.text('1. Zapotrzebowanie BOM (Z oferty / standardów)', margin, y);
        y += 6;

        const bomHeaders = [['Lp.', 'Nazwa materiału', 'Ilość brutto', 'Jedn.', 'Wycena szacunkowa']];
        const bomRows = bomData.items.map((item, idx) => [
            String(idx + 1),
            item.materialName,
            item.totalQuantity.toFixed(2),
            item.unit,
            `${item.totalCost.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł`
        ]);

        autoTable(doc, {
            startY: y,
            head: bomHeaders,
            body: bomRows,
            theme: 'striped',
            styles: { font: 'Roboto' },
            headStyles: { fillColor: [40, 50, 60], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 8.5 },
            columnStyles: {
                0: { cellWidth: 10 },
                1: { fontStyle: 'bold' },
                2: { halign: 'right', fontStyle: 'bold' },
                3: { halign: 'center' },
                4: { halign: 'right' }
            },
            margin: { left: margin, right: margin }
        });

        y = (doc as any).lastAutoTable.finalY + 15;
    }

    // Check for page break before section 2
    if (y > pageHeight - 60) {
        doc.addPage();
        y = 20;
    }

    // SECTION 2: Logistics List (Realization checklist)
    if (logisticsList && logisticsList.length > 0) {
        doc.setTextColor(33, 128, 141);
        doc.setFont('Roboto', 'bold');
        doc.setFontSize(12);
        doc.text('2. Lista Logistyczna (Spakowanie / realizacja magazynowa)', margin, y);
        y += 6;

        const logHeaders = [['Lp.', 'Nazwa materiału / Realizacja', 'Ilość (szt)', 'Status', 'Podpis odbioru / uwagi']];
        
        const getStatusLabel = (status: string) => {
            switch (status) {
                case 'packed': return 'SPAKOWANE';
                case 'in_stock': return 'W MAGAZYNIE';
                default: return 'DO ZAMÓWIENIA';
            }
        };

        const logRows = logisticsList.map((item, idx) => [
            String(idx + 1),
            item.name,
            String(item.quantity),
            getStatusLabel(item.status),
            '[                                              ]' // Placeholder for signature/notes
        ]);

        autoTable(doc, {
            startY: y,
            head: logHeaders,
            body: logRows,
            theme: 'striped',
            styles: { font: 'Roboto' },
            headStyles: { fillColor: [33, 128, 141], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 8.5 },
            columnStyles: {
                0: { cellWidth: 10 },
                1: { fontStyle: 'bold' },
                2: { halign: 'right', fontStyle: 'bold', cellWidth: 20 },
                3: { halign: 'center', cellWidth: 35 },
                4: { halign: 'center' }
            },
            margin: { left: margin, right: margin }
        });

        y = (doc as any).lastAutoTable.finalY + 15;
    } else if (!bomData || bomData.items.length === 0) {
        // Empty state message
        doc.setTextColor(120, 120, 120);
        doc.setFont('Roboto', 'italic');
        doc.setFontSize(10);
        doc.text('Brak zdefiniowanych materiałów montażowych dla tego zlecenia.', margin, y);
    }

    // Add footer on all pages
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
            `Strona ${i} z ${pageCount}  |  System TiCo — Zestawienie Materiałów  |  ${job.jobCode}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
        );
    }

    // Trigger Download
    const filename = `Materialy_${job.jobCode}_${format(new Date(), 'yyyyMMdd')}.pdf`;
    doc.save(filename);
};
