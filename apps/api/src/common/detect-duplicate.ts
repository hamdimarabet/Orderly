import { PrismaService } from '../prisma/prisma.service';

/** Fenetre de detection : deux commandes identiques a moins de 5 minutes. */
const WINDOW_MINUTES = 5;

function normalizePhone(raw?: string | null): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length > 8 ? digits.slice(-8) : digits;
}

/** Signature du panier : memes produits, memes quantites, ordre indifferent. */
function signature(
  items: { sku?: string | null; title?: string | null; quantity: number }[],
): string {
  return items
    .map((i) => `${String(i.sku ?? i.title ?? '').trim().toLowerCase()}x${i.quantity}`)
    .sort()
    .join('|');
}

/**
 * Renvoie le numero de la commande d'origine si celle-ci est un doublon,
 * sinon null. Meme magasin, meme telephone, meme panier, < 5 minutes.
 */
export async function isDuplicateOrder(
  prisma: PrismaService,
  params: {
    storeId: string;
    customerPhone?: string | null;
    createdAt: Date;
    lineItems: { sku?: string | null; title?: string | null; quantity: number }[];
  },
): Promise<string | null> {
  const phone = normalizePhone(params.customerPhone);
  if (phone.length < 6) return null;
  if (!params.lineItems.length) return null;

  const since = new Date(params.createdAt.getTime() - WINDOW_MINUTES * 60_000);

  const recent = await prisma.order.findMany({
    where: {
      storeId: params.storeId,
      sourceCreatedAt: { gte: since, lte: params.createdAt },
      orderStatus: { notIn: ['ANNULE', 'ARCHIVE', 'DUPLIQUE'] },
    },
    select: {
      orderNumber: true,
      customerPhone: true,
      lineItems: { select: { sku: true, title: true, quantity: true } },
    },
    orderBy: { sourceCreatedAt: 'asc' },
    take: 50,
  });

  const sig = signature(params.lineItems);

  for (const o of recent) {
    if (normalizePhone(o.customerPhone) !== phone) continue;
    if (signature(o.lineItems) !== sig) continue;
    return o.orderNumber;
  }

  return null;
}