// One-shot, deploy-time provisioning: creates the DB schema (no-op) and seeds
// the initial data ONLY when the database has no admin user yet.
// Runs from the server directory via: npm run db:ensure
import { spawnSync } from 'node:child_process';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';

async function main(): Promise<void> {
  const adminCount = await prisma.adminUser.count();

  if (adminCount > 0) {
    console.log(`[ensure-seed] ${adminCount} admin(s) already exist - skipping seed.`);
    await prisma.$disconnect();
    return;
  }

  if (config.isProduction) {
    const email = process.env.SEED_ADMIN_EMAIL?.trim();
    const password = process.env.SEED_ADMIN_PASSWORD ?? '';
    if (!email || password.length < 8) {
      console.error(
        '[ensure-seed] First production deploy requires SEED_ADMIN_EMAIL and a SEED_ADMIN_PASSWORD (>= 8 chars) to be set on the service. Set them in the host dashboard, then redeploy.',
      );
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  await prisma.$disconnect();
  console.log('[ensure-seed] No admin found - seeding initial data.');
  const result = spawnSync('npm', ['run', 'db:seed'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

main().catch((err) => {
  console.error('[ensure-seed] failed', err);
  process.exit(1);
});