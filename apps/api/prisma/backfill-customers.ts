/**
 * One-off: build the Customer table from existing orders.
 *   npx tsx prisma/backfill-customers.ts
 *
 * Bulk version — a few seconds, not hours.
 * Run this BEFORE anyone starts typing birthdays into fiches: it rebuilds the
 * Customer table from scratch each time. Once the live sync is in place you
 * never need it again.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// --- matched to your OrderStatus enum --------------------------------------
const REFUSED   = ['ANNULE'];
const DELIVERED = ['LIVRE', 'PAYE'];
const RETURNED  = ['RETOUR', 'RETOUR_DEPOT', 'RETOUR_RECU'];
const PENDING   = ['NOUVEAU', 'CONFIRMATION_EN_COURS'];
const IGNORED   = ['ARCHIVE'];   // original status is lost — left out of the rates
const CONFIRMED = [
  'CONFIRME', 'ECHANGE', 'A_PREPARER', 'EN_PREPARATION', 'IMPRIME', 'EMBALLE',
  'A_EXPEDIER', 'AU_DEPOT_LIVREUR', 'EN_COURS_DE_LIVRAISON', 'A_VERIFIER',
  ...DELIVERED, ...RETURNED,
];

const unknown = new Set<string>();

/**
 * digits only -> last 8 if longer.
 * The SQL below does exactly the same thing, so the two always agree.
 */
function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, '');
  if (!d) return null;
  const n = d.length > 8 ? d.slice(-8) : d;
  return n.length >= 6 ? n : null;
}

function medianGap(datesAsc: Date[]): number | null {
  if (datesAsc.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < datesAsc.length; i++) {
    const days = Math.round((datesAsc[i].getTime() - datesAsc[i - 1].getTime()) / 86_400_000);
    if (days > 0 && days < 400) gaps.push(days);
  }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
}

function tierOf(delivered: number, returnRate: number, recent: string[]): string {
  const last3 = recent.slice(-3);
  if (last3.some((s) => RETURNED.includes(s))) return 'WATCH';
  if (returnRate > 30) return 'WATCH';
  if (delivered >= 5) return 'GOLD';
  if (delivered >= 2) return 'SILVER';
  return 'NEW';
}

async function main() {
  const t0 = Date.now();
  console.log('Loading orders...');

  const orders = await prisma.order.findMany({
    select: {
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      shippingAddress: true,
      storeId: true,
      orderStatus: true,
      total: true,
      sourceCreatedAt: true,
      createdAt: true,
    },
    orderBy: { sourceCreatedAt: 'asc' },
  });
  console.log(`${orders.length} orders loaded.`);

  // ---- group by normalized phone ------------------------------------------
  const groups = new Map<string, typeof orders>();
  let skipped = 0;
  for (const o of orders) {
    const phone = normalizePhone(o.customerPhone);
    if (!phone) { skipped++; continue; }
    let g = groups.get(phone);
    if (!g) { g = []; groups.set(phone, g); }
    g.push(o);
  }
  console.log(`${groups.size} customers (${skipped} orders had no usable phone).`);

  // ---- build every row in memory ------------------------------------------
  const rows: any[] = [];
  let oneOff = 0, repeat = 0, withRhythm = 0;

  for (const [phone, list] of groups) {
    const latest = list[list.length - 1];
    const addr: any = latest.shippingAddress ?? {};
    const statuses = list.map((o) => o.orderStatus as string);

    for (const s of statuses) {
      if (![...REFUSED, ...PENDING, ...CONFIRMED, ...IGNORED].includes(s)) unknown.add(s);
    }

    const delivered = statuses.filter((s) => DELIVERED.includes(s)).length;
    const returned  = statuses.filter((s) => RETURNED.includes(s)).length;
    const refused   = statuses.filter((s) => REFUSED.includes(s)).length;
    const confirmed = statuses.filter((s) => CONFIRMED.includes(s)).length;
    const archived  = statuses.filter((s) => IGNORED.includes(s)).length;

    const totalOrders = list.length;
    const rateBase = totalOrders - archived;
    const finished = delivered + returned;
    const num = (v: any) => Number(v ?? 0);

    const lifetimeValue = list
      .filter((o) => DELIVERED.includes(o.orderStatus as string))
      .reduce((s, o) => s + num(o.total), 0);
    const totalOrdered = list.reduce((s, o) => s + num(o.total), 0);

    const dateOf = (o: any) => (o.sourceCreatedAt ?? o.createdAt) as Date;

    const dates = list.map(dateOf).filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());

    // only parcels actually received — a return is not consumption
    const deliveredDates = list
      .filter((o) => DELIVERED.includes(o.orderStatus as string))
      .map(dateOf).filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());

    const firstOrderAt = dates[0] ?? null;
    const lastOrderAt  = dates[dates.length - 1] ?? null;
    const lastDeliveredAt = deliveredDates[deliveredDates.length - 1] ?? null;
    const rhythmDays   = medianGap(deliveredDates);
    const nextDueAt = rhythmDays && lastDeliveredAt
      ? new Date(lastDeliveredAt.getTime() + rhythmDays * 86_400_000)
      : null;

    if (totalOrders > 1) repeat++; else oneOff++;
    if (rhythmDays) withRhythm++;

    rows.push({
      phone,
      displayPhone: latest.customerPhone ?? phone,
      name: latest.customerName ?? phone,
      email: latest.customerEmail ?? null,
      city: addr.city ?? addr.province ?? null,
      address: addr.address1 ?? addr.address ?? null,
      storeIds: [...new Set(list.map((o) => o.storeId).filter(Boolean))] as string[],
      totalOrders,
      confirmed,
      refused,
      delivered,
      returned,
      confirmationRate: rateBase ? Math.round((confirmed / rateBase) * 100) : 0,
      deliveryRate: finished ? Math.round((delivered / finished) * 100) : 0,
      returnRate:   finished ? Math.round((returned  / finished) * 100) : 0,
      lifetimeValue: lifetimeValue.toFixed(3),
      totalOrdered:  totalOrdered.toFixed(3),
      avgBasket: totalOrders ? (totalOrdered / totalOrders).toFixed(3) : '0',
      firstOrderAt,
      lastOrderAt,
      firstDeliveredAt: deliveredDates[0] ?? null,
      lastDeliveredAt,
      rhythmDays,
      nextDueAt,
      tier: tierOf(delivered, finished ? Math.round((returned / finished) * 100) : 0, statuses),
    });
  }

  // ---- wipe + bulk insert --------------------------------------------------
  console.log('Rebuilding the Customer table...');
  await prisma.customer.deleteMany({});          // also clears Order.customerId

  for (let i = 0; i < rows.length; i += 2000) {
    await prisma.customer.createMany({
      data: rows.slice(i, i + 2000),
      skipDuplicates: true,
    });
    console.log(`  inserted ${Math.min(i + 2000, rows.length)}/${rows.length}`);
  }

  // ---- link every order in ONE statement -----------------------------------
  console.log('Linking orders...');
  const linked = await prisma.$executeRawUnsafe(`
    UPDATE "Order" o
       SET "customerId" = c.id
      FROM "Customer" c
     WHERE c.phone = CASE
             WHEN LENGTH(REGEXP_REPLACE(COALESCE(o."customerPhone", ''), '\\D', '', 'g')) > 8
             THEN RIGHT(REGEXP_REPLACE(COALESCE(o."customerPhone", ''), '\\D', '', 'g'), 8)
             ELSE REGEXP_REPLACE(COALESCE(o."customerPhone", ''), '\\D', '', 'g')
           END
  `);

  console.log(`\nDone in ${Math.round((Date.now() - t0) / 1000)}s.`);
  console.log(`  ${rows.length} customers, ${linked} orders linked.`);
  console.log(`\n--- worth knowing ---`);
  console.log(`  ordered once only : ${oneOff} (${Math.round((oneOff / rows.length) * 100)}%)`);
  console.log(`  ordered 2+ times  : ${repeat} (${Math.round((repeat / rows.length) * 100)}%)`);
  console.log(`  with a measurable buying rhythm : ${withRhythm}`);

  if (unknown.size) {
    console.log('\n/!\\  Statuses I did not recognise — send me this line:');
    console.log('   ' + [...unknown].join(', '));
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());