import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as QRCode from 'qrcode';
import * as bwipjs from 'bwip-js';

/** Empêche qu'un nom ou un produit contenant & ou < casse la page. */
function esc(v: any): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class BordereauService {
  constructor(private prisma: PrismaService) {}

  /**
   * Bon de livraison au format Cosmos, généré par Orderly.
   *
   * Même structure que leur étiquette (code-barres, N° BLF, destinataire,
   * contenu du colis) pour que le dépôt s'y retrouve — mais rendu ici, donc
   * l'arabe s'affiche correctement et rien ne déborde des cadres.
   */
  async generateBordereau(orderId: string): Promise<Buffer> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        lineItems: true,
        store: { select: { name: true } },
      },
    });

    if (!order) throw new Error('Order not found');

    // --- code-barres Cosmos ------------------------------------------------
    const fulfillment = await this.prisma.fulfillment.findFirst({
      where: { orderId, carrier: 'COSMOS' },
      select: { deliveryPartnerRef: true, trackingNumber: true },
    });

    const barcodeValue = String(
      fulfillment?.deliveryPartnerRef ??
        fulfillment?.trackingNumber ??
        order.orderNumber.replace('#', ''),
    );

    let barcodeImg = '';
    try {
      const png = await bwipjs.toBuffer({
        bcid: 'code128',
        text: barcodeValue,
        scale: 3,
        height: 14,
        includetext: true,
        textxalign: 'center',
        textsize: 9,
      });
      barcodeImg = 'data:image/png;base64,' + png.toString('base64');
    } catch {
      barcodeImg = '';
    }

    const qrImg = await QRCode.toDataURL(
      JSON.stringify({
        orderId: order.id,
        orderNumber: order.orderNumber,
        storeId: order.storeId,
      }),
      { width: 220, margin: 0 },
    );

    const addr = (order.shippingAddress ?? {}) as any;
    const city = esc(addr.city ?? '—');

    const addressText = esc(
      [addr.address1, addr.address2].filter(Boolean).join(', ') || '—',
    );

    const date = new Date(order.sourceCreatedAt).toLocaleDateString('fr-FR');

    // --- lignes produit ----------------------------------------------------
    const rows = order.lineItems
      .map((li) => {
        const title = esc(li.title + (li.variantTitle ? ' — ' + li.variantTitle : ''));
        const amount = (Number(li.price) * li.quantity).toFixed(2);
        return `
          <tr>
            <td class="d" dir="auto">${title}</td>
            <td class="q">${li.quantity}</td>
            <td class="m">${amount}</td>
          </tr>`;
      })
      .join('');

    // --- échange -----------------------------------------------------------
    let exchangeHtml = '';
    if (order.internalNote) {
      try {
        const meta = JSON.parse(order.internalNote);
        if (meta.exchange?.itemsToRecover?.length) {
          const items = meta.exchange.itemsToRecover
            .map((i: any) =>
              esc(`${i.title}${i.variantTitle ? ' - ' + i.variantTitle : ''} ×${i.quantity}`),
            )
            .join(' · ');
          exchangeHtml = `
            <div class="box exchange">
              <div class="box-title">ÉCHANGE — PRODUIT À RÉCUPÉRER</div>
              <div class="exchange-items" dir="auto">${items}</div>
            </div>`;
        }
      } catch {}
    }

    const notes = order.notes ? esc(order.notes) : '—';

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Bon de livraison ${esc(barcodeValue)}</title>
<style>
  @page { size: A5 landscape; margin: 6mm; }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: "Segoe UI", Tahoma, "Noto Sans Arabic", Arial, sans-serif;
    font-size: 11px;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .sheet { width: 100%; max-width: 190mm; margin: 0 auto; }

  .box {
    border: 2px solid #000;
    border-radius: 7px;
    padding: 7px 10px;
    margin-bottom: 7px;
  }

  /* ---------- bandeau haut ---------- */
  .top { display: table; width: 100%; table-layout: fixed; }
  .top > div { display: table-cell; vertical-align: middle; }
  .top-bc  { width: 38%; }
  .top-bc img { width: 100%; max-height: 74px; object-fit: contain; display: block; }
  .top-city {
    width: 38%;
    text-align: center;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.05;
    padding: 0 6px;
    /* le nom de ville ne doit jamais sortir du cadre */
    overflow-wrap: anywhere;
    hyphens: auto;
  }
  .top-qr  { width: 24%; text-align: right; }
  .top-qr img { width: 74px; height: 74px; display: inline-block; }

  /* ---------- n° BLF ---------- */
  .blf {
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.3px;
    padding: 6px 10px;
  }

  /* ---------- deux colonnes ---------- */
  .cols { display: table; width: 100%; table-layout: fixed; border-spacing: 7px 0; margin: 0 -7px 7px; }
  .cols > div { display: table-cell; width: 50%; vertical-align: top; }

  .kv { display: table; width: 100%; }
  .kv-row { display: table-row; }
  .kv-k {
    display: table-cell;
    font-weight: 700;
    white-space: nowrap;
    padding: 2px 8px 2px 0;
    vertical-align: top;
    width: 1%;
  }
  .kv-v { display: table-cell; padding: 2px 0; vertical-align: top; overflow-wrap: anywhere; }
  .phone { font-size: 14px; font-weight: 700; letter-spacing: 0.4px; }

  /* ---------- contenu ---------- */
  table.items { width: 100%; border-collapse: collapse; }
  table.items th {
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: left;
    padding: 0 6px 5px 0;
    border-bottom: 1.5px solid #000;
  }
  table.items td { padding: 5px 6px 5px 0; vertical-align: top; border-bottom: 1px solid #ddd; }
  table.items tr:last-child td { border-bottom: none; }
  .d { width: 64%; overflow-wrap: anywhere; }
  .q { width: 16%; text-align: center; }
  .m { width: 20%; text-align: right; font-weight: 700; white-space: nowrap; }
  .items-foot { border-top: 1.5px solid #000; }
  .items-foot td { padding-top: 6px; font-size: 13px; font-weight: 700; }

  /* ---------- bas ---------- */
  .bottom { display: table; width: 100%; table-layout: fixed; }
  .bottom > div { display: table-cell; vertical-align: top; }
  .instr { width: 74%; padding-right: 8px; }
  .instr .line { border-bottom: 1px solid #999; padding: 4px 0 6px; min-height: 20px; overflow-wrap: anywhere; }
  .sign { width: 26%; text-align: center; font-size: 9px; }
  .sign .pad { height: 42px; border: 1px dashed #999; border-radius: 5px; margin-top: 3px; }

  .box-title { font-size: 11px; font-weight: 700; margin-bottom: 3px; }
  .exchange { background: #f0f0f0; }
  .exchange-items { font-size: 12px; font-weight: 700; overflow-wrap: anywhere; }

  .foot-note { margin-top: 5px; font-size: 8.5px; color: #555; text-align: center; }

  @media print {
    .box, table.items tr, .bottom { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="sheet">

  <div class="box">
    <div class="top">
      <div class="top-bc">
        ${barcodeImg ? `<img src="${barcodeImg}" alt="">` : `<div style="font-family:monospace;font-size:16px;font-weight:700">${esc(barcodeValue)}</div>`}
      </div>
      <div class="top-city" dir="auto">${city}</div>
      <div class="top-qr"><img src="${qrImg}" alt=""></div>
    </div>
  </div>

  <div class="box blf">BON DE LIVRAISON N° ${esc(barcodeValue)}</div>

  <div class="cols">
    <div>
      <div class="box" style="margin:0">
        <div class="kv">
          <div class="kv-row"><div class="kv-k">Date BLF :</div><div class="kv-v">${date}</div></div>
          <div class="kv-row"><div class="kv-k">Destination :</div><div class="kv-v" dir="auto"><b>${city}</b></div></div>
          <div class="kv-row"><div class="kv-k">Magasin :</div><div class="kv-v" dir="auto">${esc(order.store.name)}</div></div>
          <div class="kv-row"><div class="kv-k">Commande :</div><div class="kv-v">${esc(order.orderNumber)}</div></div>
        </div>
      </div>
    </div>
    <div>
      <div class="box" style="margin:0">
        <div class="kv">
          <div class="kv-row"><div class="kv-k">Destinataire :</div><div class="kv-v" dir="auto"><b>${esc(order.customerName ?? '—')}</b></div></div>
          <div class="kv-row"><div class="kv-k">Adresse :</div><div class="kv-v" dir="auto">${addressText}</div></div>
          <div class="kv-row"><div class="kv-k">Téléphone :</div><div class="kv-v phone">${esc(order.customerPhone ?? '—')}</div></div>
        </div>
      </div>
    </div>
  </div>

  ${exchangeHtml}

  <div class="box">
    <table class="items">
      <thead>
        <tr>
          <th>Désignation — contenu du colis</th>
          <th style="text-align:center">Quantité</th>
          <th style="text-align:right">Montant TTC</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="items-foot">
          <td colspan="2"><b>Montant à encaisser</b></td>
          <td class="m">${Number(order.total).toFixed(2)} ${esc(order.currency)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="bottom">
    <div class="instr">
      <div class="box" style="margin:0">
        <div class="box-title">Instructions diverses</div>
        <div class="line" dir="auto">${notes}</div>
      </div>
    </div>
    <div class="sign">
      <div class="box" style="margin:0">
        <div class="box-title" style="font-size:9px">Signature client</div>
        <div class="pad"></div>
      </div>
    </div>
  </div>

  <div class="foot-note">Généré le ${new Date().toLocaleString('fr-FR')}</div>

</div>
</body>
</html>`;

    return Buffer.from(html, 'utf-8');
  }
}