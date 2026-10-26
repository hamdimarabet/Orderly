/** npx tsx prisma/status-counts.ts  —  where are the 20,778 orders actually sitting? */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.order.groupBy({
    by: ['orderStatus'],
    _count: { _all: true },
    orderBy: { _count: { orderStatus: 'desc' } },
  });

  const total = rows.reduce((s, r) => s + r._count._all, 0);
  console.log(`\n${total} orders\n`);
  for (const r of rows) {
    const n = r._count._all;
    const pct = ((n / total) * 100).toFixed(1).padStart(5);
    console.log(`  ${String(r.orderStatus).padEnd(24)} ${String(n).padStart(7)}  ${pct}%`);
  }

  // how many customers have 2+ orders in each outcome group
  const delivered = await prisma.customer.count({ where: { delivered: { gte: 2 } } });
  const anyDelivered = await prisma.customer.count({ where: { delivered: { gte: 1 } } });
  const repeat = await prisma.customer.count({ where: { totalOrders: { gte: 2 } } });

  console.log(`\n  customers with 2+ orders        : ${repeat}`);
  console.log(`  customers with 1+ delivered     : ${anyDelivered}`);
  console.log(`  customers with 2+ delivered     : ${delivered}   <-- this is the rhythm pool\n`);
}

main().catch(console.error).finally(() => prisma.$disconnect());