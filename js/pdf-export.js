(() => {
  'use strict';

  const mm = {
    pageW: 210,
    pageH: 297,
    margin: 14
  };

  let brandLogoPromise = null;

  function safe(value, fallback = '—') {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function cleanFilename(value) {
    return String(value || 'arquivo')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_')
      .slice(0, 90) || 'arquivo';
  }

  function blobToPngDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        try {
          const max = 1400;
          const width = img.naturalWidth || 1;
          const height = img.naturalHeight || 1;
          const scale = Math.min(1, max / Math.max(width, height));

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));

          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const data = canvas.toDataURL('image/png');
          URL.revokeObjectURL(url);
          resolve(data);
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Não foi possível processar a imagem.'));
      };

      img.src = url;
    });
  }

  async function getBrandLogoDataUrl() {
    if (!brandLogoPromise) {
      const parts = Array.from({ length: 6 }, (_, index) =>
        fetch(`/assets/pdf-brand/logo.part${index}.txt`, { cache: 'force-cache' })
          .then((response) => {
            if (!response.ok) throw new Error(`Parte ${index} da logo não encontrada.`);
            return response.text();
          })
      );

      brandLogoPromise = Promise.all(parts)
        .then((chunks) => `data:image/png;base64,${chunks.join('')}`)
        .catch((error) => {
          console.warn('[EPI PDF BRAND]', error);
          return null;
        });
    }
    return brandLogoPromise;
  }

  async function getModelImage(variant, supabase) {
    if (!variant?.imagem_path || !supabase) return null;

    try {
      const signed = await supabase.storage
        .from('epi-imagens')
        .createSignedUrl(variant.imagem_path, 300);

      if (signed.error || !signed.data?.signedUrl) return null;

      const response = await fetch(signed.data.signedUrl);
      if (!response.ok) return null;

      const blob = await response.blob();
      return await blobToPngDataUrl(blob);
    } catch (error) {
      console.warn('[EPI PDF IMAGE]', error);
      return null;
    }
  }

  async function downloadVariantDossier(options = {}) {
    const variant = options.variant;
    const epi = options.epi || {};
    const supabase = options.supabase;
    const dateBR = options.dateBR || ((value) => safe(value));
    const moneyBR = options.moneyBR || ((value) => safe(value));

    if (!variant) throw new Error('C.A. não encontrado.');
    if (!window.jspdf?.jsPDF) throw new Error('Gerador de PDF não carregado.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pageW = mm.pageW;
    const pageH = mm.pageH;
    const margin = mm.margin;
    const contentW = pageW - margin * 2;

    const orange = [255, 102, 0];
    const dark = [17, 17, 17];
    const dark2 = [34, 34, 34];
    const gray = [105, 105, 105];
    const border = [224, 224, 224];
    const green = [42, 145, 98];
    const red = [196, 66, 66];

    const status = safe(variant.situacao, 'Sem situação');
    const statusUpper = status.toLocaleUpperCase('pt-BR');
    const statusColor = statusUpper.includes('VÁLID')
      ? green
      : (statusUpper.includes('VENC') || statusUpper.includes('CANCEL') || statusUpper.includes('SUSP')
        ? red
        : gray);

    const epiName = safe(epi.nome, 'EPI / Item');
    const epiCategory = safe(epi.categoria, 'Categoria não informada');
    const generatedAt = new Date().toLocaleString('pt-BR');
    const [imageData, brandLogoData] = await Promise.all([
      getModelImage(variant, supabase),
      getBrandLogoDataUrl()
    ]);

    const setText = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    const setFill = (rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    const setDraw = (rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);

    function drawPageBase(firstPage) {
      setFill([250, 250, 250]);
      doc.rect(0, 0, pageW, pageH, 'F');

      setFill(dark);
      doc.rect(0, 0, pageW, 31, 'F');

      setFill(orange);
      doc.rect(0, 0, 4, 31, 'F');

      let brandDrawn = false;
      if (brandLogoData) {
        try {
          doc.addImage(brandLogoData, 'PNG', 6.3, 4.4, 20.8, 20.8, 'EPI_DOSSIER_BRAND');
          brandDrawn = true;
        } catch (error) {
          console.warn('[EPI PDF BRAND DRAW]', error);
        }
      }

      if (!brandDrawn) {
        setDraw(orange);
        doc.setLineWidth(0.6);
        doc.roundedRect(margin, 7, 16, 16, 3, 3, 'S');

        setText(orange);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('EPI', margin + 8, 17, { align: 'center' });
      }

      const brandTextX = 36.8;

      setText([255, 255, 255]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('GESTÃO DE EPI', brandTextX, 13);

      setText([175, 175, 175]);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text('CONTROLE OPERACIONAL', brandTextX, 18);

      setText([210, 210, 210]);
      doc.setFontSize(7);
      doc.text('PRONTUÁRIO TÉCNICO DO C.A.', pageW - margin, 13, { align: 'right' });
      doc.text('Gerado em ' + generatedAt, pageW - margin, 18, { align: 'right' });

      if (firstPage) {
        setFill(orange);
        doc.rect(margin, 36, 2, 17, 'F');

        setText(dark);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(17);
        doc.text(epiName, margin + 5, 43.5);

        setText(gray);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(epiCategory, margin + 5, 49.5);

        setFill(statusColor);
        doc.roundedRect(pageW - margin - 30, 38, 30, 9, 4.5, 4.5, 'F');

        setText([255, 255, 255]);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.text(status.toUpperCase(), pageW - margin - 15, 43.8, { align: 'center' });
      }
    }

    let y = 58;
    drawPageBase(true);

    function addPage() {
      doc.addPage();
      drawPageBase(false);
      y = 38;
    }

    function ensureSpace(height) {
      if (y + height > pageH - 17) addPage();
    }

    function sectionTitle(title) {
      ensureSpace(10);

      setText(orange);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(String(title).toUpperCase(), margin, y + 4);

      setDraw([225, 225, 225]);
      doc.setLineWidth(0.3);
      doc.line(margin + 47, y + 2.8, pageW - margin, y + 2.8);

      y += 9;
    }

    function fieldCard(label, value, x, width, height = 17) {
      setFill([255, 255, 255]);
      setDraw(border);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, width, height, 2.4, 2.4, 'FD');

      setText([115, 115, 115]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.4);
      doc.text(String(label).toUpperCase(), x + 4, y + 5);

      setText(dark2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.3);

      const lines = doc.splitTextToSize(safe(value), width - 8).slice(0, 2);
      doc.text(lines, x + 4, y + 11, { lineHeightFactor: 1.15 });
    }

    function textSection(label, value) {
      const raw = safe(value, 'Não informado.');
      const textX = margin + 5;
      const textWidth = contentW - 10;
      const fontSize = 8.2;
      const lineHeight = (fontSize * 1.34) / doc.internal.scaleFactor;
      const textTop = 13;
      const bottomPadding = 5;
      const minHeight = 22;
      const pageBottom = pageH - 17;
      const freshPageY = 38;
      const fixedHeight = textTop + bottomPadding;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);

      const allLines = doc.splitTextToSize(raw, textWidth);
      const fullBoxHeight = Math.max(
        minHeight,
        fixedHeight + (allLines.length * lineHeight)
      );
      const freshPageCapacity = pageBottom - freshPageY;

      if (
        fullBoxHeight <= freshPageCapacity &&
        y + fullBoxHeight > pageBottom
      ) {
        addPage();
      }

      let offset = 0;
      let continuation = false;

      while (offset < allLines.length) {
        const availableHeight = pageBottom - y;
        const remainingLines = allLines.length - offset;
        const remainingHeight = Math.max(
          minHeight,
          fixedHeight + (remainingLines * lineHeight)
        );

        let linesInBox;

        if (remainingHeight <= availableHeight) {
          linesInBox = remainingLines;
        } else {
          const maxLines = Math.floor((availableHeight - fixedHeight) / lineHeight);

          if (maxLines < 1) {
            addPage();
            continuation = offset > 0;
            continue;
          }

          linesInBox = Math.min(remainingLines, maxLines);
        }

        const boxLines = allLines.slice(offset, offset + linesInBox);
        const height = Math.max(
          minHeight,
          fixedHeight + (boxLines.length * lineHeight)
        );

        setFill([255, 255, 255]);
        setDraw(border);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, y, contentW, height, 2.6, 2.6, 'FD');

        setText([105, 105, 105]);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);

        const sectionLabel = continuation
          ? String(label).toUpperCase() + ' - CONTINUAÇÃO'
          : String(label).toUpperCase();

        doc.text(sectionLabel, margin + 5, y + 6);

        setText([45, 45, 45]);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fontSize);

        boxLines.forEach((line, index) => {
          const globalIndex = offset + index;
          const isLastOverallLine = globalIndex === allLines.length - 1;
          const lineY = y + textTop + (index * lineHeight);

          if (!isLastOverallLine && /\s/.test(line) && String(line).trim().length > 18) {
            doc.text(String(line), textX, lineY, {
              align: 'justify',
              maxWidth: textWidth
            });
          } else {
            doc.text(String(line), textX, lineY);
          }
        });

        y += height + 4;
        offset += linesInBox;

        if (offset < allLines.length) {
          addPage();
          continuation = true;
        }
      }
    }

    ensureSpace(48);

    setFill([255, 255, 255]);
    setDraw(statusColor);
    doc.setLineWidth(0.45);
    doc.roundedRect(margin, y, contentW, 44, 3, 3, 'FD');

    setFill([247, 247, 247]);
    setDraw([225, 225, 225]);
    doc.roundedRect(margin + 4, y + 4, 42, 36, 2, 2, 'FD');

    if (imageData) {
      try {
        const props = doc.getImageProperties(imageData);
        const boxW = 36;
        const boxH = 30;
        const ratio = Math.min(boxW / props.width, boxH / props.height);
        const imageW = props.width * ratio;
        const imageH = props.height * ratio;
        const imageX = margin + 7 + (boxW - imageW) / 2;
        const imageY = y + 7 + (boxH - imageH) / 2;

        doc.addImage(imageData, 'PNG', imageX, imageY, imageW, imageH, undefined, 'FAST');
      } catch (error) {
        console.warn('[EPI PDF ADD IMAGE]', error);
      }
    } else {
      setText([160, 160, 160]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('SEM IMAGEM', margin + 25, y + 23, { align: 'center' });
    }

    const heroX = margin + 51;

    setText(orange);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('CERTIFICADO DE APROVAÇÃO', heroX, y + 8);

    setText(dark);
    doc.setFontSize(17);
    doc.text('C.A. ' + safe(variant.ca), heroX, y + 16);

    setText([95, 95, 95]);
    doc.setFontSize(6.5);
    doc.text('FABRICANTE', heroX, y + 23);

    setText(dark2);
    doc.setFontSize(9.5);
    const makerLines = doc.splitTextToSize(safe(variant.fabricante, 'Fabricante não informado'), contentW - 58);
    doc.text(makerLines.slice(0, 2), heroX, y + 29);

    setText([90, 90, 90]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const subtitle = [variant.marca, variant.referencia].filter(Boolean).join(' • ') || 'Marca / referência não informada';
    doc.text(doc.splitTextToSize(subtitle, contentW - 58).slice(0, 2), heroX, y + 38);

    y += 50;

    sectionTitle('Identificação e certificação');

    const gap = 4;
    const col = (contentW - gap) / 2;

    fieldCard('CNPJ', variant.cnpj, margin, col);
    fieldCard('Marca', variant.marca, margin + col + gap, col);
    y += 21;

    fieldCard('Referência / modelo', variant.referencia, margin, col);
    fieldCard('Validade do C.A.', dateBR(variant.data_validade), margin + col + gap, col);
    y += 21;

    fieldCard('Situação', status, margin, col);
    fieldCard('Norma', variant.norma, margin + col + gap, col);
    y += 22;

    sectionTitle('Dados comerciais');

    fieldCard('Preço', moneyBR(variant.preco), margin, col);
    fieldCard('Comparativo', variant.comparativo_status==='atual'?'Atual':(variant.comparativo_status==='passada'?'Passado':'—'), margin + col + gap, col);
    y += 21;

    fieldCard('Fornecedor', variant.fornecedor, margin, contentW);
    y += 22;

    sectionTitle('Informações técnicas');

    textSection('Descrição oficial', variant.descricao);
    textSection('Características / especificação interna', variant.caracteristicas);
    textSection('Observações', variant.observacao);

    const totalPages = doc.getNumberOfPages();

    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);

      setDraw([225, 225, 225]);
      doc.setLineWidth(0.25);
      doc.line(margin, pageH - 11, pageW - margin, pageH - 11);

      setText([120, 120, 120]);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text('Gestão de EPI - Controle Operacional', margin, pageH - 6);
      doc.text('Página ' + page + ' de ' + totalPages, pageW - margin, pageH - 6, { align: 'right' });
    }

    const filename = 'Prontuario_CA_' + cleanFilename(variant.ca) + '_' + cleanFilename(epiName) + '.pdf';
    doc.save(filename);
  }

  window.EPI_PDF = {
    downloadVariantDossier
  };
})();
