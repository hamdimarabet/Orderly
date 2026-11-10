import { PrismaService } from '../prisma/prisma.service';

export const LOYAL_TAG = 'Client fidèle';

/** Fidele = au moins 2 commandes LIVREES, espacees d'au moins 6 heures. */
export const LOYAL_MIN_DELIVERED = 2;
export const LOYAL_MIN_GAP_MS = 6 * 60 * 60 * 1000;

const DELIVERED: string[] = ['LIVRE', 'PAYE'];

/** Meme normalisation que la table Customer : les 8 derniers chiffres. */
export function normalizeLoyalPhone(raw?: string | null): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length > 8 ? digits.slice(-8) : digits;
}

type LoyalRow = {
  id: string;
  tags: string[];
  orderStatus: string;
  sourceCreatedAt: Date;
};

export function isLoyal(rows: LoyalRow[]): boolean {
  const delivered = rows
    .filter((o) => DELIVERED.includes(String(o.orderStatus)))
    .map((o) => new Date(o.sourceCreatedAt).getTime())
    .sort((a, b) => a - b);

  if (delivered.length < LOYAL_MIN_DELIVERED) return false;
  return delivered[delivered.length - 1] - delivered[0] >= LOYAL_MIN_GAP_MS;
}

/**
 * Recalcule le tag « Client fidele » pour un seul numero.
 * Appele a chaque commande entrante, Shopify comme Converty.
 */
export async function syncLoyalTagForPhone(
  prisma: PrismaService,
  rawPhone?: string | null,
): Promise<{ tagged: number; untagged: number }> {
  const phone = normalizeLoyalPhone(rawPhone);
  if (phone.length < 6) return { tagged: 0, untagged: 0 };

  // Seulement les commandes de ce client, pas toute la base
  const rows = await prisma.$queryRawUnsafe<LoyalRow[]>(
    `SELECT id, tags, "orderStatus"::text AS "orderStatus", "sourceCreatedAt"
       FROM "Order"
      WHERE RIGHT(REGEXP_REPLACE(COALESCE("customerPhone", ''), '\\D', '', 'g'), 8) = $1`,
    phone,
  );

  if (!rows.length) return { tagged: 0, untagged: 0 };

  const loyal = isLoyal(rows);
  let tagged = 0;
  let untagged = 0;

  for (const o of rows) {
    const has = (o.tags ?? []).includes(LOYAL_TAG);
    if (loyal && !has) {
      await prisma.order.update({
        where: { id: o.id },
        data: { tags: { set: [...(o.tags ?? []), LOYAL_TAG] } },
      });
      tagged++;
    } else if (!loyal && has) {
      await prisma.order.update({
        where: { id: o.id },
        data: { tags: { set: (o.tags ?? []).filter((t) => t !== LOYAL_TAG) } },
      });
      untagged++;
    }
  }

  return { tagged, untagged };
}