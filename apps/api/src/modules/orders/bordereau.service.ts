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

const STYLES = `
  @page { size: A4 portrait; margin: 10mm; }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: "Segoe UI", Tahoma, "Noto Sans Arabic", Arial, sans-serif;
    font-size: 14px;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .sheet { width: 100%; max-width: 190mm; margin: 0 auto; }
  .sheet + .sheet { page-break-before: always; margin-top: 10mm; }

  .box { border: 2px solid #000; border-radius: 8px; padding: 11px 14px; margin-bottom: 10px; }

  .top { display: table; width: 100%; table-layout: fixed; }
  .top > div { display: table-cell; vertical-align: middle; }
  .top-bc { width: 50%; }
  .top-bc img { max-height: 76px; max-width: 100%; width: auto; height: auto; display: block; }
  .top-city {
    width: 28%; text-align: center; font-size: 30px; font-weight: 700;
    line-height: 1.05; padding: 0 6px; overflow-wrap: anywhere; hyphens: auto;
  }
  .top-qr { width: 22%; text-align: right; }
  .top-qr img { width: 92px; height: 92px; display: inline-block; }

  .blf { text-align: center; font-size: 20px; font-weight: 700; letter-spacing: 0.3px; padding: 9px 10px; }

  .cols { display: table; width: 100%; table-layout: fixed; border-spacing: 7px 0; margin: 0 -7px 7px; }
  .cols > div { display: table-cell; width: 50%; vertical-align: top; }
  .stack .box { margin-bottom: 7px; }

  .kv { display: table; width: 100%; }
  .kv-row { display: table-row; }
  .kv-k { display: table-cell; font-weight: 700; white-space: nowrap; padding: 4px 12px 4px 0; vertical-align: top; width: 1%; font-size: 14px; }
  .kv-v { display: table-cell; padding: 4px 0; vertical-align: top; overflow-wrap: anywhere; font-size: 15px; }
  .phone { font-size: 21px; font-weight: 700; letter-spacing: 0.6px; }

  table.items { width: 100%; border-collapse: collapse; }
  table.items th {
    font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;
    text-align: left; padding: 0 8px 7px 0; border-bottom: 1.5px solid #000;
  }
  table.items td { padding: 9px 8px 9px 0; vertical-align: top; border-bottom: 1px solid #ddd; font-size: 15px; }
  table.items tr:last-child td { border-bottom: none; }
  .d { width: 64%; overflow-wrap: anywhere; }
  .q { width: 16%; text-align: center; font-size: 17px; font-weight: 700; }
  .m { width: 24%; text-align: right; font-weight: 700; font-size: 20px; white-space: nowrap; }
  .items-foot { border-top: 1.5px solid #000; }
  .items-foot td { padding-top: 6px; font-size: 13px; font-weight: 700; }

  .bottom { display: table; width: 100%; table-layout: fixed; }
  .bottom > div { display: table-cell; vertical-align: top; }
  .instr { width: 70%; padding-right: 8px; }
  .instr .line { border-bottom: 1px solid #999; padding: 6px 0 10px; min-height: 30px; overflow-wrap: anywhere; font-size: 15px; }
  .sign { width: 30%; text-align: center; font-size: 9px; }
  .sign img { width: 96px; height: 96px; display: inline-block; }

  .box-title { font-size: 14px; font-weight: 700; margin-bottom: 5px; }
  .exchange { background: #f0f0f0; }
  .exchange-items { font-size: 16px; font-weight: 700; overflow-wrap: anywhere; }

  /* ---------- en-tête transporteur ---------- */
  .carrier { display: table; width: 100%; table-layout: fixed; margin-bottom: 8px; }
  .carrier > div { display: table-cell; vertical-align: top; }
  .carrier-logo { width: 26%; font-size: 24px; font-weight: 800; letter-spacing: -0.3px; }
  .carrier-from { width: 50%; font-size: 12px; line-height: 1.45; }
  .carrier-from .k { font-weight: 700; display: inline-block; min-width: 76px; }
  .carrier-date { width: 24%; text-align: right; font-size: 13px; font-weight: 700; }

  /* ---------- code-barres bas ---------- */
  .bottom-bc { text-align: center; margin-top: 9px; }
  .bottom-bc img { max-height: 84px; max-width: 80%; width: auto; height: auto; display: inline-block; }

  .foot-note { margin-top: 8px; font-size: 10px; color: #555; text-align: center; }

  @media print {
    .box, table.items tr, .bottom { page-break-inside: avoid; }
  }
`;

@Injectable()
export class BordereauService {
  constructor(private prisma: PrismaService) {}

  /** Un seul bon de livraison. */
  async generateBordereau(orderId: string): Promise<Buffer> {
    const sheet = await this.renderSheet(orderId);
    return this.wrap([sheet], 'Bon de livraison');
  }

  /** Plusieurs bons, un par page — l'équivalent du PDF groupé de Cosmos. */
  async generateBordereaux(orderIds: string[]): Promise<Buffer> {
    const sheets: string[] = [];
    for (const id of orderIds) {
      try {
        sheets.push(await this.renderSheet(id));
      } catch {
        /* commande introuvable : on saute, le reste doit quand même s'imprimer */
      }
    }
    if (!sheets.length) sheets.push('<p style="padding:20px">Aucune commande à imprimer.</p>');
    return this.wrap(sheets, `${sheets.length} bons de livraison`);
  }

  // ---------------------------------------------------------------- privé

  private wrap(sheets: string[], title: string): Buffer {
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${STYLES}</style>
</head>
<body>
${sheets.join('\n')}
</body>
</html>`;
    return Buffer.from(html, 'utf-8');
  }

  /**
   * Bon de livraison au format Cosmos, généré par Orderly.
   *
   * Même structure que leur étiquette (code-barres, N° BLF, destinataire,
   * contenu du colis) pour que le dépôt s'y retrouve — mais rendu ici, donc
   * l'arabe s'affiche correctement et rien ne déborde des cadres.
   */
  private async renderSheet(orderId: string): Promise<string> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        lineItems: true,
        store: true,
      },
    });

    if (!order) throw new Error('Order not found');

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
        height: 16,
        includetext: true,
        textxalign: 'center',
        textsize: 10,
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

    // Tout ce qui est envoyé à Cosmos dans createShipment — rien de plus, rien de moins.
    const quantity = order.lineItems.reduce((n, li) => n + li.quantity, 0) || 1;
    const packageCount = 1;
    const externalBarcode = esc(order.orderNumber.replace('#', ''));
    const isExchange =
      order.orderStatus === 'ECHANGE' ||
      (order.tags ?? []).some(
        (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'echange',
      );
    const allowToOpen = true;
    const isFragile = false;
    const phone2 = (order as any).customerPhone2 ?? null;

    // Expéditeur = le magasin. Le dépôt (Ariana-1 etc.) est attribué par Cosmos
    // et n'est exposé par aucun de leurs endpoints, donc impossible à reproduire.
    const st: any = order.store ?? {};
    const fromName = esc(st.name ?? '—');
    const fromAddress = esc(st.address ?? st.addressLine ?? '');
    const fromPhone = esc(st.phone ?? st.phoneNumber ?? '');

    // Cosmos imprime le contenu en une seule ligne, comme on le leur envoie.
    const contentLine = esc(
      order.lineItems
        .map((li) => `${li.title}${li.variantTitle ? ' - ' + li.variantTitle : ''} x${li.quantity}`)
        .join(', ') || 'Commande',
    );

    return `
<div class="sheet">

  <div class="carrier">
    <div class="carrier-logo">COSMOS</div>
    <div class="carrier-from">
      <div><span class="k">Expéditeur :</span> <span dir="auto">${fromName}</span></div>
      ${fromAddress ? `<div><span class="k">Adresse :</span> <span dir="auto">${fromAddress}</span></div>` : ''}
      ${fromPhone ? `<div><span class="k">Téléphone :</span> ${fromPhone}</div>` : ''}
    </div>
    <div class="carrier-date">Date : ${date}</div>
  </div>

  <div class="box">
    <div class="top">
      <div class="top-bc">
        ${barcodeImg
          ? `<img src="${barcodeImg}" alt="">`
          : `<div style="font-family:monospace;font-size:22px;font-weight:700">${esc(barcodeValue)}</div>`}
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
          <div class="kv-row"><div class="kv-k">Nb colis :</div><div class="kv-v">${packageCount} · ${quantity} article${quantity > 1 ? 's' : ''}</div></div>
          <div class="kv-row"><div class="kv-k">Réf. externe :</div><div class="kv-v">${externalBarcode}</div></div>
          <div class="kv-row"><div class="kv-k">Ouverture :</div><div class="kv-v">${allowToOpen ? 'Autorisée' : 'Non autorisée'}${isFragile ? ' · <b>FRAGILE</b>' : ''}${isExchange ? ' · <b>ÉCHANGE</b>' : ''}</div></div>
        </div>
      </div>
    </div>
    <div>
      <div class="box" style="margin:0">
        <div class="kv">
          <div class="kv-row"><div class="kv-k">Destinataire :</div><div class="kv-v" dir="auto"><b>${esc(order.customerName ?? '—')}</b></div></div>
          <div class="kv-row"><div class="kv-k">Adresse :</div><div class="kv-v" dir="auto">${addressText}</div></div>
          <div class="kv-row"><div class="kv-k">Téléphone :</div><div class="kv-v phone">${esc(order.customerPhone ?? '—')}</div></div>
          ${phone2 ? `<div class="kv-row"><div class="kv-k">Téléphone 2 :</div><div class="kv-v phone">${esc(phone2)}</div></div>` : ''}
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
        <tr>
          <td class="d" dir="auto">${contentLine}</td>
          <td class="q">${quantity}</td>
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
        <img src="${qrImg}" alt="">
      </div>
    </div>
  </div>

  ${barcodeImg ? `<div class="bottom-bc"><img src="${barcodeImg}" alt=""></div>` : ''}

  <div class="foot-note">Généré le ${new Date().toLocaleString('fr-FR')}</div>

</div>`;
  }
}