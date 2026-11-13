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

  function blobToPngDataUrl(blob, max = 1400) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        try {
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
      brandLogoPromise = fetch('/assets/pdf-brand/logo.png?v=20261001', { cache: 'force-cache' })
        .then((response) => {
          if (!response.ok) throw new Error('Logo do PDF não encontrada.');
          return response.blob();
        })
        .then((blob) => blobToPngDataUrl(blob, 320)) // a logo ocupa ~21 mm no PDF; 320 px basta para imprimir nítido
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
    // Registro da Base CIEPI (CI-0001): o PDF fala em C.I. / Certificado Interno.
    const isCi = /^\s*CI-/i.test(String(variant.ca || ''));
    const term = isCi ? 'C.I.' : 'C.A.';
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
          // Centraliza a parte visível da logo, considerando sua margem transparente.
          doc.addImage(brandLogoData, 'PNG', 10.365, 4.4, 20.8, 20.8, 'EPI_DOSSIER_BRAND');
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
      doc.text('PRONTUÁRIO TÉCNICO DO ' + term, pageW - margin, 13, { align: 'right' });
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
    doc.text(isCi ? 'CERTIFICADO INTERNO' : 'CERTIFICADO DE APROVAÇÃO', heroX, y + 8);

    setText(dark);
    doc.setFontSize(17);
    doc.text(isCi ? safe(variant.ca) : 'C.A. ' + safe(variant.ca), heroX, y + 16);

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
    fieldCard('Validade do ' + term, dateBR(variant.data_validade), margin + col + gap, col);
    y += 21;

    fieldCard('Situação', status, margin, col);
    fieldCard('Norma', variant.norma, margin + col + gap, col);
    y += 22;

    sectionTitle('Dados comerciais');

    // Preço e fornecedor lado a lado (o "Comparativo" saiu: a economia agora é por período).
    fieldCard('Preço', moneyBR(variant.preco), margin, col);
    fieldCard('Fornecedor', variant.fornecedor, margin + col + gap, col);
    y += 22;

    sectionTitle('Informações técnicas');

    textSection(isCi ? 'Descrição' : 'Descrição oficial', variant.descricao);
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

    const filename = (isCi ? 'Prontuario_' : 'Prontuario_CA_') + cleanFilename(variant.ca) + '_' + cleanFilename(epiName) + '.pdf';
    doc.save(filename);
  }

  // Termo de responsabilidade assinado no celular: declaração, biometria facial
  // e assinatura digital, no mesmo cabeçalho do prontuário.
  // jpeg=true para foto (arquivo leve); assinatura fica em PNG (traço nítido).
  async function signedImage(supabase, bucket, path, jpeg = false) {
    if (!path || !supabase) return null;
    try {
      const signed = await supabase.storage.from(bucket).createSignedUrl(path, 300);
      if (signed.error || !signed.data?.signedUrl) return null;
      const response = await fetch(signed.data.signedUrl);
      if (!response.ok) return null;
      let dataUrl = await blobToPngDataUrl(await response.blob());
      if (jpeg) dataUrl = await new Promise((ok) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); const k = Math.min(1, 900 / Math.max(i.naturalWidth, i.naturalHeight)); c.width = Math.round(i.naturalWidth * k); c.height = Math.round(i.naturalHeight * k); c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.82)); }; i.onerror = () => ok(dataUrl); i.src = dataUrl; });
      const size = await new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.onerror = () => ok([1, 1]); i.src = dataUrl; });
      return { dataUrl, w: size[0], h: size[1], fmt: jpeg ? 'JPEG' : 'PNG' };
    } catch (error) {
      console.warn('[EPI PDF TERMO IMAGE]', error);
      return null;
    }
  }

  async function downloadTermo(options = {}) {
    const termo = options.termo;
    const colaborador = options.colaborador || {};
    const supabase = options.supabase;
    const bucket = options.bucket || 'termos-epi';
    if (!termo) throw new Error('Termo não encontrado.');
    if (!window.jspdf?.jsPDF) throw new Error('Gerador de PDF não carregado.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageW = mm.pageW, pageH = mm.pageH, margin = mm.margin, contentW = pageW - margin * 2;
    const orange = [255, 102, 0], dark = [17, 17, 17], gray = [105, 105, 105], border = [224, 224, 224];
    const setText = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    const setFill = (rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    const setDraw = (rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);

    const [logo, selfie, assinatura] = await Promise.all([
      getBrandLogoDataUrl(),
      signedImage(supabase, bucket, termo.selfie_path, true),
      signedImage(supabase, bucket, termo.assinatura_path)
    ]);
    const assinadoEm = new Date(termo.assinado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const generatedAt = new Date().toLocaleString('pt-BR');

    function header() {
      setFill([250, 250, 250]); doc.rect(0, 0, pageW, pageH, 'F');
      setFill(dark); doc.rect(0, 0, pageW, 31, 'F');
      setFill(orange); doc.rect(0, 0, 4, 31, 'F');
      if (logo) { try { doc.addImage(logo, 'PNG', 10.365, 4.4, 20.8, 20.8, 'EPI_TERMO_BRAND'); } catch (_) {} }
      setText([255, 255, 255]); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('GESTÃO DE EPI', 36.8, 13);
      setText([175, 175, 175]); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text('CONTROLE OPERACIONAL', 36.8, 18);
      setText([210, 210, 210]); doc.setFontSize(7);
      doc.text('TERMO DE RESPONSABILIDADE DO EPI', pageW - margin, 13, { align: 'right' });
      doc.text('Gerado em ' + generatedAt, pageW - margin, 18, { align: 'right' });
    }

    header();
    let y = 42;
    setText(orange); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text('TERMO DE AUTORIZAÇÃO', margin, y);
    setText(dark); doc.setFontSize(16); doc.text(doc.splitTextToSize(safe(colaborador.nome, 'Colaborador'), contentW).slice(0, 2), margin, y + 8);
    y += 15;
    setText(gray); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    const ident = [colaborador.cpf ? 'CPF ' + String(colaborador.cpf).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : null,
      colaborador.matricula ? 'Matrícula ' + colaborador.matricula : null, colaborador.cargo, colaborador.setor].filter(Boolean).join('  •  ');
    if (ident) { doc.text(doc.splitTextToSize(ident, contentW), margin, y); y += 5; }
    doc.text('Assinado no celular em ' + assinadoEm, margin, y);
    y += 8;

    // Declaração: parágrafos e itens com marcador.
    const linhas = String(termo.texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const boxTop = y;
    y += 6;
    doc.setFontSize(9.5); setText([40, 40, 40]);
    const lineH = 4.6;
    const blocos = linhas.map((l) => {
      const item = l.startsWith('*');
      const texto = item ? l.replace(/^\*\s*/, '') : l;
      return { item, partes: doc.splitTextToSize(texto, contentW - (item ? 16 : 10)) };
    });
    const alturaTexto = blocos.reduce((h, b) => h + b.partes.length * lineH + 1.6, 0) + 4;
    setFill([255, 255, 255]); setDraw(border); doc.setLineWidth(0.3);
    doc.roundedRect(margin, boxTop, contentW, alturaTexto + 4, 3, 3, 'FD');
    for (const b of blocos) {
      if (b.item) { setFill(orange); doc.circle(margin + 7, y - 1.2, 0.8, 'F'); }
      doc.text(b.partes, margin + (b.item ? 10 : 5), y);
      y += b.partes.length * lineH + 1.6;
    }
    y = boxTop + alturaTexto + 12;

    // Biometria facial e assinatura lado a lado.
    const gap = 6, col = (contentW - gap) / 2, boxH = 62;
    if (y + boxH + 10 > pageH - 16) { doc.addPage(); header(); y = 42; }
    const caixa = (x, titulo, img, fundo) => {
      setText(gray); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text(titulo, x, y);
      setFill(fundo); setDraw(border); doc.roundedRect(x, y + 3, col, boxH, 3, 3, 'FD');
      if (!img) { setText([150, 150, 150]); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text('Não registrada', x + col / 2, y + 3 + boxH / 2, { align: 'center' }); return; }
      const pad = 3, maxW = col - pad * 2, maxH = boxH - pad * 2;
      const k = Math.min(maxW / img.w, maxH / img.h);
      const w = img.w * k, h = img.h * k;
      try { doc.addImage(img.dataUrl, img.fmt, x + (col - w) / 2, y + 3 + (boxH - h) / 2, w, h); } catch (e) { console.warn('[EPI PDF TERMO]', e); }
    };
    caixa(margin, 'BIOMETRIA FACIAL', selfie, [245, 245, 245]);
    caixa(margin + col + gap, 'ASSINATURA DIGITAL', assinatura, [255, 255, 255]);
    y += boxH + 10;
    setText(dark); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    doc.text(safe(colaborador.nome, ''), margin + col + gap + col / 2, y, { align: 'center' });

    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      setDraw([225, 225, 225]); doc.setLineWidth(0.25); doc.line(margin, pageH - 11, pageW - margin, pageH - 11);
      setText([120, 120, 120]); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
      doc.text('Gestão de EPI - Controle Operacional  •  Registro ' + String(termo.id || '').slice(0, 8), margin, pageH - 6);
      doc.text('Página ' + page + ' de ' + totalPages, pageW - margin, pageH - 6, { align: 'right' });
    }

    const dia = String(termo.assinado_em || '').slice(0, 10);
    doc.save('Termo_EPI_' + cleanFilename(colaborador.nome) + (dia ? '_' + dia : '') + '.pdf');
  }

  // Ordem de Serviço por função em folha A4 branca, no mesmo desenho da folha
  // que abre dentro do app (js/os-folha.js).
  async function downloadOrdemServico(options = {}) {
    const os = options.os;
    const colaborador = options.colaborador || {};
    if (!os) throw new Error('Ordem de serviço não encontrada.');
    if (!window.jspdf?.jsPDF) throw new Error('Gerador de PDF não carregado.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageW = mm.pageW, pageH = mm.pageH, margin = 14, contentW = pageW - margin * 2;
    const orange = [255, 102, 0], dark = [17, 17, 17], gray = [107, 114, 128], light = [156, 163, 175], border = [229, 231, 235], texto = [55, 65, 81];
    const setText = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    const setFill = (rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    const setDraw = (rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    // Cores do mapa de riscos (NR-5), iguais às da folha no app.
    const COR = { fisico: '#16a34a', quimico: '#dc2626', biologico: '#92400e', ergonomico: '#ca8a04', acidentes: '#2563eb', acidente: '#2563eb' };
    const corRisco = (g) => hex(COR[semAcento(g)] || '#6b7280');
    const logo = await getBrandLogoDataUrl();
    const dataBR = (iso) => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? d + '/' + m + '/' + y : ''; };
    const lineH = 4.3, topo = 34, base = pageH - 16;

    function header() {
      setFill(dark); doc.rect(0, 0, pageW, 22, 'F');
      setFill(orange); doc.rect(0, 0, 2.2, 22, 'F');
      if (logo) { try { doc.addImage(logo, 'PNG', margin - 1, 3.5, 15, 15, 'EPI_OS_BRAND'); } catch (_) {} }
      setText([255, 255, 255]); doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
      doc.text('GESTÃO DE ', margin + 17, 10.5);
      setText(orange); doc.text('EPI', margin + 17 + doc.getTextWidth('GESTÃO DE '), 10.5);
      setText([163, 163, 163]); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.text('CONTROLE OPERACIONAL', margin + 17, 15);
      setText([229, 229, 229]); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      doc.text('ORDEM DE SERVIÇO (O.S.) POR FUNÇÃO', pageW - margin, 10.5, { align: 'right' });
      setText([163, 163, 163]); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
      doc.text('Segurança do Trabalho  ·  NR-01', pageW - margin, 15, { align: 'right' });
    }
    let y = topo;
    const novaPagina = () => { doc.addPage(); header(); y = topo; };
    const espaco = (h) => { if (y + h > base) novaPagina(); };
    function titulo(numero, nome) {
      espaco(16);
      setFill(orange); doc.roundedRect(margin, y - 4, 5.6, 5.6, 1.2, 1.2, 'F');
      setText([255, 255, 255]); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text(String(numero), margin + 2.8, y - 0.1, { align: 'center' });
      setText(dark); doc.setFontSize(10.5); doc.text(nome, margin + 8.5, y);
      setDraw(border); doc.setLineWidth(0.3); doc.line(margin, y + 2.6, pageW - margin, y + 2.6);
      y += 8;
    }
    function paragrafo(t, tamanho = 9, cor = texto) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(tamanho); setText(cor);
      const lh = tamanho * 0.47;
      for (const parte of String(t || '').split(/\r?\n/)) {
        for (const l of doc.splitTextToSize(parte.trim(), contentW)) { espaco(lh); doc.text(l, margin, y); y += lh; }
      }
      y += 3;
    }

    header();
    // Título e selo de data/revisão
    setText(orange); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text('ORDEM DE SERVIÇO', margin, y);
    setText(dark); doc.setFontSize(19); doc.text(doc.splitTextToSize(safe(os.funcao, 'Função'), contentW - 50)[0], margin, y + 8);
    const seloW = 42, seloX = pageW - margin - seloW;
    setDraw(border); doc.setLineWidth(0.3); doc.roundedRect(seloX, y - 3.5, seloW, 13, 2, 2, 'S');
    doc.setFontSize(7.5);
    [['Data', dataBR(os.data_os) || '—'], ['Revisão', os.revisao ? 'Rev. ' + os.revisao : '—']].forEach(([r, v], i) => {
      setText(gray); doc.setFont('helvetica', 'normal'); doc.text(r, seloX + 4, y + 1.5 + i * 4.8);
      setText(dark); doc.setFont('helvetica', 'bold'); doc.text(v, seloX + seloW - 4, y + 1.5 + i * 4.8, { align: 'right' });
    });
    y += 15;

    // Identificação: Funcionário (largura toda), Função | Setor, Identificação
    const ident = [colaborador.matricula ? 'Matrícula ' + colaborador.matricula : '', colaborador.cpf ? 'CPF ' + String(colaborador.cpf).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : ''].filter(Boolean).join('  ·  ');
    const linhasId = [[['Funcionário', safe(colaborador.nome)]], [['Função', safe(os.funcao)], ['Setor', safe(os.setor)]]];
    if (ident) linhasId.push([['Identificação', ident]]);
    const rowH = 11;
    setDraw(border); doc.setLineWidth(0.3); doc.roundedRect(margin, y, contentW, rowH * linhasId.length, 2.5, 2.5, 'S');
    linhasId.forEach((linha, r) => {
      if (r) doc.line(margin, y + r * rowH, pageW - margin, y + r * rowH);
      const w = contentW / linha.length;
      linha.forEach(([rot, val], c) => {
        if (c) doc.line(margin + c * w, y + r * rowH, margin + c * w, y + (r + 1) * rowH);
        const x = margin + c * w + 4.5, cy = y + r * rowH + 4.4;
        setText(light); doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.text(rot.toUpperCase(), x, cy);
        setText(dark); doc.setFontSize(9.5); doc.text(doc.splitTextToSize(val, w - 9)[0], x, cy + 4.4);
      });
    });
    y += rowH * linhasId.length + 9;

    if (os.descricao) { titulo(1, 'Descrição da Função'); paragrafo(os.descricao); }

    titulo(2, 'Agentes Associados às Atividades');
    const agentes = os.agentes || [];
    if (!agentes.length) paragrafo('Não identificados.', 9, gray);
    agentes.forEach((g, i) => {
      const itens = (g.itens || []).length ? g.itens.join('  ·  ') : 'Não identificado';
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
      const linhas = doc.splitTextToSize(itens, contentW - 32);
      const h = Math.max(6.5, linhas.length * lineH + 2.2);
      espaco(h);
      const cor = corRisco(g.grupo);
      doc.setFontSize(7.2); doc.setFont('helvetica', 'bold');
      const pw = doc.getTextWidth(String(g.grupo || '')) + 6;
      setDraw(cor); doc.setLineWidth(0.35); doc.roundedRect(margin, y - 3.6, pw, 5, 2.5, 2.5, 'S');
      setText(cor); doc.text(String(g.grupo || ''), margin + 3, y - 0.2);
      setText((g.itens || []).length ? texto : light); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
      doc.text(linhas, margin + 30, y);
      y += h;
      if (i < agentes.length - 1) { setDraw([241, 242, 244]); doc.setLineWidth(0.25); doc.line(margin + 30, y - 3.4, pageW - margin, y - 3.4); }
    });
    y += 3;

    titulo(3, 'EPIs de Uso Obrigatório');
    const epis = (os.epis || []).map((e) => e.descricao);
    if (!epis.length) paragrafo('Não se aplica.', 9, gray);
    const colW = (contentW - 5) / 2, boxH = 7.5;
    for (let i = 0; i < epis.length; i += 2) {
      espaco(boxH + 2);
      [epis[i], epis[i + 1]].forEach((nome, c) => {
        if (!nome) return;
        const x = margin + c * (colW + 5);
        setDraw([238, 240, 242]); doc.setLineWidth(0.3); doc.roundedRect(x, y - 5, colW, boxH, 1.6, 1.6, 'S');
        setDraw(orange); doc.setLineWidth(0.45); doc.roundedRect(x + 3, y - 2.9, 3.4, 3.4, 0.6, 0.6, 'S');
        setText(dark); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6);
        doc.text(doc.splitTextToSize(nome, colW - 12)[0], x + 9, y - 0.3);
      });
      y += boxH + 1.8;
    }
    y += 3;

    if ((os.recomendacoes || []).length) {
      titulo(4, 'Recomendações');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
      for (const r of os.recomendacoes) {
        const linhas = doc.splitTextToSize(String(r).replace(/^[-•]\s*/, ''), contentW - 5);
        espaco(linhas.length * lineH);
        setFill(orange); doc.circle(margin + 1.3, y - 1.2, 0.75, 'F');
        setText(texto); doc.text(linhas, margin + 4.5, y);
        y += linhas.length * lineH + 0.9;
      }
      y += 2;
    }

    // Frase em destaque
    doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(8.8);
    const frase = doc.splitTextToSize('A pressa é a companheira inesperada dos acidentes, portanto faça tudo com tempo, para fazer bem e com segurança.', contentW - 12);
    const fH = frase.length * lineH + 5;
    espaco(fH + 4);
    setFill([255, 247, 237]); doc.rect(margin, y - 1, contentW, fH, 'F');
    setFill(orange); doc.rect(margin, y - 1, 1, fH, 'F');
    setText([154, 52, 18]); doc.text(frase, pageW / 2, y + 3.4, { align: 'center' });
    y += fH + 7;

    if (os.procedimentos) { titulo(5, 'Procedimentos em caso de acidentes'); paragrafo(os.procedimentos); }
    if (os.observacoes) { titulo(6, 'Observações'); paragrafo(os.observacoes, 7.8, gray); }

    // Assinaturas lado a lado, no pé da última página quando couber.
    const assH = 26;
    espaco(assH + 8);
    y = Math.max(y + 10, base - assH);
    const aW = (contentW - 14) / 2;
    [[colaborador.nome || 'Funcionário', 'Assinatura do Funcionário'], ['', 'Assinatura do Responsável']].forEach(([nome, rot], i) => {
      const x = margin + i * (aW + 14), cx = x + aW / 2;
      setDraw(gray); doc.setLineWidth(0.3); doc.line(x, y, x + aW, y);
      setText(dark); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); if (nome) doc.text(doc.splitTextToSize(nome, aW)[0], cx, y + 4.5, { align: 'center' });
      setText(gray); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text(rot, cx, y + 8.8, { align: 'center' });
      doc.text('Data: ____/____/______', cx, y + 15, { align: 'center' });
    });

    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      setDraw(border); doc.setLineWidth(0.25); doc.line(margin, pageH - 11, pageW - margin, pageH - 11);
      setText(light); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
      doc.text('Gestão de EPI  ·  Controle Operacional  ·  O.S. ' + safe(os.funcao, ''), margin, pageH - 6.5);
      doc.text('Página ' + page + ' de ' + totalPages, pageW - margin, pageH - 6.5, { align: 'right' });
    }
    doc.save('OS_' + cleanFilename(os.funcao) + '_' + cleanFilename(colaborador.nome || 'modelo') + '.pdf');
  }

  window.EPI_PDF = {
    downloadVariantDossier,
    downloadTermo,
    downloadOrdemServico
  };
})();
