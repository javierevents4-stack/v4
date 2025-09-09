import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export const generatePDF = async (element: HTMLElement): Promise<string> => {
  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      onclone: (doc) => {
        // Prevent cross-origin images from tainting the canvas
        const imgs = Array.from(doc.querySelectorAll('img')) as HTMLImageElement[];
        imgs.forEach((img) => {
          const src = img.getAttribute('src') || '';
          const isRemote = /^https?:\/\//.test(src) && !src.startsWith(window.location.origin);
          if (isRemote) {
            img.setAttribute('src', '');
          }
        });
      }
    });

    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: [canvas.width, canvas.height]
    });

    pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);

    // Return the PDF as a data URL
    return pdf.output('dataurlstring');
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};
