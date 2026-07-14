import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Offer, Construction, Client } from '../models/types';

interface PdfCompanySettings {
    companyName?: string;
    address?: string;
    taxId?: string;
    defaultVatRate?: number;
}

export const generateOfferPdf = (offer: Offer, constructions: Construction[], client?: Client, settings?: PdfCompanySettings) => {
    const doc = new jsPDF();
    const companyName = settings?.companyName || 'KOSTIQ';
    const companyAddress = settings?.address || '';
    const companyTaxId = settings?.taxId || '';
    const vatRate = settings?.defaultVatRate || 23;
    const vatMultiplier = vatRate / 100;

    // Header — company info (top right)
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(companyName, 196, 12, { align: 'right' });
    if (companyAddress) doc.text(companyAddress, 196, 17, { align: 'right' });
    if (companyTaxId) doc.text(`NIP: ${companyTaxId}`, 196, 22, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(22);
    doc.text('OFERTA', 14, 20);

    doc.setFontSize(12);
    doc.text(`Numer: ${offer.number}`, 14, 30);
    doc.text(`Data: ${new Date(offer.createdAt).toLocaleDateString('pl-PL')}`, 14, 36);

    // Client Info
    doc.setFontSize(11);
    doc.text('Nabywca:', 14, 50);
    if (client) {
        doc.text(client.name, 14, 56);
        if (client.address && client.address.length > 0) {
            const address = client.address[0];
            doc.text(address.street, 14, 61);
            doc.text(`${address.zipCode} ${address.city}`, 14, 66);
        } else {
            doc.text('', 14, 61);
            doc.text('', 14, 66);
        }
    } else {
        doc.text('Klient Detaliczny', 14, 56);
    }

    // Installation Info
    doc.text('Miejsce montażu:', 120, 50);
    doc.text(offer.placeOfInstallation || 'Brak danych', 120, 56);

    let finalY = 80;

    // Constructions Table
    if (constructions.length > 0) {
        doc.setFontSize(14);
        doc.text('Zestawienie stolarki', 14, 75);

        const tableData = constructions.map(c => [
            c.number,
            c.name,
            c.type,
            `${c.widthMm} x ${c.heightMm}`,
            c.quantity,
            `${c.totalCost.toFixed(2)} PLN`
        ]);

        autoTable(doc, {
            startY: 80,
            head: [['Lp', 'Nazwa', 'Typ', 'Wymiar [mm]', 'Ilość', 'Wartość netto']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [30, 58, 138] }, // Primary color
        });

        let s = (doc as any).lastAutoTable.finalY || 180;
        finalY = s + 10;
    }

    // Cost Summary
    doc.setFontSize(14);
    doc.text('Podsumowanie kosztów', 14, finalY);

    const totalNet = offer.totalCost || offer.totalNet || 0;
    const vatAmount = totalNet * vatMultiplier;

    autoTable(doc, {
        startY: finalY + 5,
        body: [
            ['Materiały montażowe', `${offer.materialsCost.toFixed(2)} PLN`],
            ['Robocizna', `${(offer.installationLaborCost || 0).toFixed(2)} PLN`],
            ['Transport', `${((offer.constructionTransportCost || 0) + (offer.workerTransportCost || 0)).toFixed(2)} PLN`],
            ['RAZEM NETTO', `${totalNet.toFixed(2)} PLN`],
            [`Podatek VAT (${vatRate}%)`, `${vatAmount.toFixed(2)} PLN`],
            ['RAZEM BRUTTO', `${(totalNet + vatAmount).toFixed(2)} PLN`],
        ],
        theme: 'plain',
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 100 },
            1: { halign: 'right' }
        }
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Strona ${i} z ${pageCount}`, 196, 290, { align: 'right' });
        doc.text(`${companyName} | ${companyAddress} | NIP: ${companyTaxId}`, 14, 290);
    }

    doc.save(`Oferta_${offer.number}.pdf`);
};

const loadFont = async (url: string): Promise<string> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load font from ${url}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            // Remove "data:font/ttf;base64," prefix
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const getImageDimensions = (url: string): Promise<{ width: number, height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = (e) => reject(e);
        img.src = url;
    });
};

export const generateClientReportPdf = async (report: any, job: any) => {
    const doc = new jsPDF();

    try {
        // Load Roboto fonts from local public folder
        const fontRegular = await loadFont('/fonts/Roboto-Regular.ttf');
        const fontBold = await loadFont('/fonts/Roboto-Bold.ttf');

        doc.addFileToVFS('Roboto-Regular.ttf', fontRegular);
        doc.addFileToVFS('Roboto-Bold.ttf', fontBold);

        doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
        doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');

        doc.setFont('Roboto', 'normal');
    } catch (e) {
        console.error("Could not load custom fonts", e);
        // Fallback to basic font if loading fails, but warn user
        alert("Błąd ładowania polskiej czcionki. PDF może nie zawierać polskich znaków.");
        doc.setFont('helvetica');
    }

    const pageWidth = doc.internal.pageSize.width;

    // --- Header ---
    doc.setFillColor(30, 58, 138); // Blue header
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('Roboto', 'bold'); // Use Bold for title
    doc.text(report.title, 14, 25);

    doc.setFontSize(10);
    doc.setFont('Roboto', 'normal');
    // Ensure we use the custom font for everything that might have PL chars
    doc.text(`Okres: ${new Date(report.periodStart).toLocaleDateString('pl-PL')} - ${new Date(report.periodEnd).toLocaleDateString('pl-PL')}`, 14, 35);

    doc.text(`Klient: ${job.clientName || 'Nabywca'}`, pageWidth - 14, 25, { align: 'right' });
    doc.text(`Zlecenie: ${job.name} (${job.jobCode})`, pageWidth - 14, 35, { align: 'right' });

    let yPos = 50;

    // --- Summary Section ---
    doc.setTextColor(0, 0, 0);
    if (report.summary.intro || report.summary.issues || report.summary.nextSteps) {
        doc.setFontSize(14);
        doc.setFont('Roboto', 'bold');
        doc.text('Podsumowanie', 14, yPos);
        yPos += 8;

        doc.setFontSize(10);
        doc.setFont('Roboto', 'normal');

        if (report.summary.intro) {
            const introLines = doc.splitTextToSize(report.summary.intro, pageWidth - 28);
            doc.text(introLines, 14, yPos);
            yPos += introLines.length * 5 + 5;
        }

        if (report.summary.issues) {
            doc.setFont('Roboto', 'bold');
            doc.text('Problemy / Ryzyka:', 14, yPos);
            yPos += 5;
            doc.setFont('Roboto', 'normal');
            const issueLines = doc.splitTextToSize(report.summary.issues, pageWidth - 28);
            doc.text(issueLines, 14, yPos);
            yPos += issueLines.length * 5 + 5;
        }

        if (report.summary.nextSteps) {
            doc.setFont('Roboto', 'bold');
            doc.text('Planowane działania:', 14, yPos);
            yPos += 5;
            doc.setFont('Roboto', 'normal');
            const nextLines = doc.splitTextToSize(report.summary.nextSteps, pageWidth - 28);
            doc.text(nextLines, 14, yPos);
            yPos += nextLines.length * 5 + 10;
        }
    }

    // --- Entries ---
    doc.setFontSize(14);
    doc.setFont('Roboto', 'bold');
    doc.text('Dziennik prac', 14, yPos);
    yPos += 10;

    const entries = report.entries.filter((e: any) => e.include).sort((a: any, b: any) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime());

    for (const entry of entries) {
        // Page break check
        if (yPos > 250) {
            doc.addPage();
            yPos = 20;
        }

        // Date & Type badge simulation
        doc.setFillColor(240, 240, 240);
        doc.rect(14, yPos - 4, pageWidth - 28, 8, 'F');

        doc.setFontSize(10);
        doc.setFont('Roboto', 'bold');
        doc.setTextColor(30, 58, 138);
        const dateStr = new Date(entry.entryDate).toLocaleDateString('pl-PL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        doc.text(dateStr, 16, yPos + 1);

        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);

        let typeLabel = entry.entryType;
        switch (entry.entryType) {
            case 'work_day': typeLabel = 'DZIEŃ ROBOCZY'; break;
            case 'issue': typeLabel = 'PROBLEM'; break;
            case 'note': typeLabel = 'NOTATKA'; break;
            case 'material': typeLabel = 'MATERIAŁY'; break;
            default: typeLabel = entry.entryType.toUpperCase();
        }

        doc.text(typeLabel, pageWidth - 16, yPos + 1, { align: 'right' });

        yPos += 10;

        // Title
        if (entry.customTitle) {
            doc.setFontSize(11);
            doc.setFont('Roboto', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text(entry.customTitle, 14, yPos);
            yPos += 6;
        }

        // Text
        doc.setFontSize(10);
        doc.setFont('Roboto', 'normal');
        doc.setTextColor(50, 50, 50);
        const text = entry.customText || entry.originalText || '';
        const lines = doc.splitTextToSize(text, pageWidth - 28);
        doc.text(lines, 14, yPos);
        yPos += lines.length * 5 + 5;

        // Photos
        if (entry.photos && entry.photos.length > 0) {
            // Grid layout: 2 columns
            const columnCount = 2;
            const gap = 5;
            const availableWidth = pageWidth - 28;
            const photoWidth = (availableWidth - (gap * (columnCount - 1))) / columnCount;

            let col = 0;
            let rowHeight = 0;

            for (const photoUrl of entry.photos) {
                try {
                    const dimensions = await getImageDimensions(photoUrl);
                    const aspectRatio = dimensions.width / dimensions.height;
                    const photoHeight = photoWidth / aspectRatio;

                    // Check for page break based on this image's height
                    // If we are at col 0, we can just check.
                    // If we are at col > 0, we are bound to previous images in the row, but usually we align tops.
                    // If this image is huge, it might overflow.
                    // If this image is huge, it might overflow.

                    if (col === 0 && yPos + photoHeight > 280) {
                        doc.addPage();
                        yPos = 20;
                    } else if (col > 0 && yPos + photoHeight > 280) {
                        // Strict handling: If it forces page break, we might need to push the whole row? 
                        // Or just this image? This gets complex.
                        // Simple approach: Check if ANY image in the row fits? 
                        // Let's just check against current yPos. 
                        // If really tall, we might clip or need new page.
                        // For simplicity: If it doesn't fit, add page, reset row.
                        if (yPos + photoHeight > 280) {
                            doc.addPage();
                            yPos = 20;
                            col = 0; // Reset to first column on new page
                        }
                    }

                    const xPos = 14 + (col * (photoWidth + gap));

                    if (photoUrl) {
                        doc.addImage(photoUrl, 'JPEG', xPos, yPos, photoWidth, photoHeight, undefined, 'FAST');
                    }

                    // Update max row height
                    if (photoHeight > rowHeight) {
                        rowHeight = photoHeight;
                    }

                    col++;
                    if (col >= columnCount) {
                        col = 0;
                        yPos += rowHeight + gap;
                        rowHeight = 0;
                    }
                } catch (e) {
                    console.warn("Could not add image to PDF", e);
                }
            }
            // Add spacing after photos if we ended largely (incomplete row)
            if (col !== 0) {
                yPos += rowHeight + gap;
            }
            yPos += 5;
        }

        yPos += 5; // Spacing between entries
    }

    // --- Footer info ---
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Strona ${i} z ${pageCount}`, pageWidth - 14, 290, { align: 'right' });
        doc.text(`Wygenerowano: ${new Date().toLocaleString('pl-PL')}`, 14, 290);
    }

    // Save
    doc.save(`Raport_${report.title.replace(/\s/g, '_')}.pdf`);
};
