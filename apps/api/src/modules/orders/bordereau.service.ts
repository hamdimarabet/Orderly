import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as QRCode from 'qrcode';

/** Anything coming from the store goes through this before it touches the HTML. */
function esc(v: any): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class BordereauService {
  constructor(private prisma: PrismaService) {}

  async generateBordereau(orderId: string): Promise<Buffer> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        lineItems: true,
        store: { select: { name: true } },
      },
    });

    if (!order) throw new Error('Order not found');

    const qrCodeBase64 = await QRCode.toDataURL(
      JSON.stringify({
        orderId: order.id,
        orderNumber: order.orderNumber,
        storeId: order.storeId,
      }),
      { width: 320, margin: 0, errorCorrectionLevel: 'M' },
    );

    const addr = (order.shippingAddress ?? {}) as any;

    // ---------------------------------------------------------------- échange
    let exchangeHtml = '';
    if (order.internalNote) {
      try {
        const meta = JSON.parse(order.internalNote);
        if (meta.exchange?.itemsToRecover?.length) {
          const items = meta.exchange.itemsToRecover
            .map((i: any) => esc(i.title + (i.variantTitle ? ' - ' + i.variantTitle : '') + ' x ' + i.quantity))
            .join(' &nbsp;/&nbsp; ');
          exchangeHtml = `
            <div class="alert">
              <div class="alert-title">ÉCHANGE — PRODUIT À RÉCUPÉRER</div>
              <div class="alert-body" dir="auto">${items}</div>
              <div class="alert-meta">
                Commande d'origine : ${esc(meta.exchange.originalOrderNumber ?? '—')}
                &nbsp;·&nbsp; Raison : ${esc(meta.exchange.reason ?? '—')}
              </div>
            </div>`;
        }
      } catch { /* note interne non JSON — on ignore */ }
    }

    // --------------------------------------------------------------- articles
    const rows = order.lineItems
      .map((li) => {
        const title = esc(li.title + (li.variantTitle ? ' — ' + li.variantTitle : ''));
        const price = (Number(li.price) * li.quantity).toFixed(3);
        return `
          <tr>
            <td class="p-name" dir="auto">${title}</td>
            <td class="p-qty">×&nbsp;${li.quantity}</td>
            <td class="p-price">${price}</td>
          </tr>`;
      })
      .join('');

    const totalItems = order.lineItems.reduce((s, li) => s + li.quantity, 0);

    // ---------------------------------------------------------------- adresse
    const addressLines = [addr.address1, addr.address2]
      .filter(Boolean)
      .map((l: string) => esc(l))
      .join('<br>');

    const cityLine = [addr.city, addr.province]
      .filter(Boolean)
      .map((l: string) => esc(l))
      .join(' · ');

    const notesHtml = order.notes
      ? `<div class="note"><span class="note-label">Note</span><span dir="auto">${esc(order.notes)}</span></div>`
      : '';

    const date = new Date(order.sourceCreatedAt).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });

    // ------------------------------------------------------------------- HTML
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bordereau ${esc(order.orderNumber)}</title>
<style>
  /* Tahoma and Segoe UI both carry Arabic glyphs on Windows — Arial alone
     prints Arabic customer names as empty squares. */
  @page { size: A4; margin: 10mm; }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: "Segoe UI", Tahoma, "Noto Sans Arabic", Arial, sans-serif;
    font-size: 12px;
    line-height: 1.4;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .sheet { width: 100%; max-width: 190mm; margin: 0 auto; }

  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; }

  /* ---------- en-tête ---------- */
  .head { border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
  .store { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
  .kind  { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #444; margin-top: 2px; }
  .num   { font-size: 24px; font-weight: 700; text-align: right; line-height: 1.1; }
  .date  { font-size: 12px; color: #444; text-align: right; margin-top: 2px; }

  /* ---------- destinataire ---------- */
  .block-label {
    font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px;
    color: #555; margin-bottom: 4px;
  }
  .recipient { border: 2px solid #000; padding: 10px 12px; }
  .r-name  { font-size: 19px; font-weight: 700; line-height: 1.2; }
  .r-phone { font-size: 20px; font-weight: 700; font-family: "Segoe UI", Tahoma, monospace; margin-top: 4px; letter-spacing: 0.5px; }
  .r-addr  { font-size: 13px; margin-top: 6px; }
  .r-city  { font-size: 14px; font-weight: 700; margin-top: 3px; text-transform: uppercase; }

  .qr { text-align: center; padding-left: 12px; }
  .qr img { width: 108px; height: 108px; display: block; }
  .qr-cap { font-size: 9px; color: #555; margin-top: 3px; }

  /* ---------- montant ---------- */
  .cod {
    border: 3px solid #000; margin: 12px 0;
    padding: 10px 14px;
  }
  .cod-label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
  .cod-sub   { font-size: 10px; color: #444; margin-top: 1px; }
  .cod-amt   { font-size: 32px; font-weight: 700; text-align: right; line-height: 1; white-space: nowrap; }

  /* ---------- articles ---------- */
  .items { border: 1px solid #999; margin-bottom: 10px; }
  .items-head {
    font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
    background: #eee; padding: 5px 10px; border-bottom: 1px solid #999; font-weight: 700;
  }
  .items td { padding: 6px 10px; border-bottom: 1px solid #ddd; font-size: 12px; }
  .items tr:last-child td { border-bottom: none; }
  .p-name  { width: 70%; }
  .p-qty   { width: 12%; text-align: center; color: #333; white-space: nowrap; }
  .p-price { width: 18%; text-align: right; font-weight: 700; white-space: nowrap; }

  /* ---------- échange ---------- */
  .alert { border: 3px solid #000; background: #eee; padding: 10px 12px; margin-bottom: 12px; }
  .alert-title { font-size: 13px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 4px; }
  .alert-body  { font-size: 13px; font-weight: 700; }
  .alert-meta  { font-size: 10px; color: #333; margin-top: 4px; }

  /* ---------- note ---------- */
  .note { border: 1px solid #999; padding: 8px 10px; margin-bottom: 10px; font-size: 12px; }
  .note-label {
    display: block; font-size: 10px; text-transform: uppercase;
    letter-spacing: 1px; color: #555; margin-bottom: 2px;
  }

  /* ---------- pied ---------- */
  .foot {
    border-top: 1px solid #999; padding-top: 6px; margin-top: 10px;
    font-size: 9px; color: #555;
  }
  .foot td { padding: 0; }
  .foot .r { text-align: right; }

  @media print {
    body { font-size: 12px; }
    .sheet { max-width: none; }
    tr, .recipient, .cod, .alert { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="sheet">

  <table class="head">
    <tr>
      <td>
        <div class="store" dir="auto">${esc(order.store.name)}</div>
        <div class="kind">Bordereau d'expédition</div>
      </td>
      <td>
        <div class="num">${esc(order.orderNumber)}</div>
        <div class="date">${date}</div>
      </td>
    </tr>
  </table>

  <table>
    <tr>
      <td style="width:72%">
        <div class="block-label">Livrer à</div>
        <div class="recipient">
          <div class="r-name" dir="auto">${esc(order.customerName ?? '—')}</div>
          <div class="r-phone">${esc(order.customerPhone ?? '—')}</div>
          ${addressLines ? `<div class="r-addr" dir="auto">${addressLines}</div>` : ''}
          ${cityLine ? `<div class="r-city" dir="auto">${cityLine}</div>` : ''}
        </div>
      </td>
      <td class="qr" style="width:28%">
        <img src="${qrCodeBase64}" alt="">
        <div class="qr-cap">Scanner pour mettre à jour</div>
      </td>
    </tr>
  </table>

  <table class="cod">
    <tr>
      <td>
        <div class="cod-label">Montant à encaisser</div>
        <div class="cod-sub">Paiement à la livraison · ${totalItems} article${totalItems > 1 ? 's' : ''}</div>
      </td>
      <td>
        <div class="cod-amt">${Number(order.total).toFixed(3)} ${esc(order.currency)}</div>
      </td>
    </tr>
  </table>

  ${exchangeHtml}

  <div class="items">
    <div class="items-head">Articles commandés</div>
    <table>${rows}</table>
  </div>

  ${notesHtml}

  <table class="foot">
    <tr>
      <td>Généré le ${new Date().toLocaleString('fr-FR')}</td>
      <td class="r">${esc(order.orderNumber)} · ${esc(order.store.name)}</td>
    </tr>
  </table>

</div>
</body>
</html>`;

    return Buffer.from(html, 'utf-8');
  }
}