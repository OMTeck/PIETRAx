#!/usr/bin/env node
/**
 * Operator utility for PIETRAx admin accounts.
 *
 *  - create      --email e --password p [--name n] [--role OWNER] [--no-mfa-enforce]
 *  - reset-pwd   --email e --password p        (also revokes all sessions)
 *  - set-status  --email e --status ACTIVE|SUSPENDED
 *
 * This is the recovery path if the owner's 2FA device is lost: sign in with the
 * account password and use /api/auth/mfa/setup/* recovery codes, or (as a last
 * resort) rotate the password here and re-enroll MFA immediately after login.
 *
 * Run from the `server` directory:  node scripts/manage-users.mjs <command> ...
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function required(name) {
  const value = arg(name);
  if (value === undefined) {
    console.error(`Missing required argument --${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const cmd = process.argv[2];

  if (cmd === 'create') {
    const email = required('email').trim().toLowerCase();
    const password = required('password');
    const name = arg('name') ?? email.split('@')[0];
    const role = arg('role') ?? 'OWNER';
    if (role !== 'OWNER' && role !== 'ADMIN' && role !== 'CONTENT_EDITOR' && role !== 'SALES' && role !== 'VIEWER') {
      console.error(`Invalid role "${role}".`);
      process.exit(1);
    }

    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      console.error(`User ${email} already exists.`);
      process.exit(1);
    }

    const user = await prisma.adminUser.create({
      data: {
        email,
        passwordHash: await hash(password, ARGON2),
        name,
        role,
        status: 'ACTIVE',
      },
      select: { id: true, email: true, name: true, role: true },
    });
    console.log(`Created ${user.role} account ${user.email} (${user.id}).`);
    console.log('Enroll TOTP for this account immediately after first login (Security settings).');
  } else if (cmd === 'reset-pwd') {
    const email = required('email').trim().toLowerCase();
    const password = required('password');
    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user) {
      console.error(`User ${email} not found.`);
      process.exit(1);
    }
    await prisma.$transaction([
      prisma.adminUser.update({
        where: { id: user.id },
        data: { passwordHash: await hash(password, ARGON2) },
      }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
    console.log(`Password reset for ${email}; all sessions revoked. Sign in again, then re-enroll MFA.`);
  } else if (cmd === 'set-status') {
    const email = required('email').trim().toLowerCase();
    const status = required('status').toUpperCase();
    if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
      console.error(`Invalid status "${status}".`);
      process.exit(1);
    }
    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user) {
      console.error(`User ${email} not found.`);
      process.exit(1);
    }
    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: user.id }, data: { status } }),
      ...(status === 'SUSPENDED' ? [prisma.session.deleteMany({ where: { userId: user.id } })] : []),
    ]);
    console.log(`${email} -> ${status}.`);
  } else if (!cmd || cmd === '--help' || cmd === 'help' || cmd === '-h') {
    console.log(
      [
        'Usage: node scripts/manage-users.mjs <command> [options]',
        '',
        '  create       --email <e> --password <p> [--name <n>] [--role OWNER|ADMIN|CONTENT_EDITOR|SALES|VIEWER]',
        '  reset-pwd    --email <e> --password <p>',
        '  set-status   --email <e> --status ACTIVE|SUSPENDED',
        '',
      ].join('\n'),
    );
  } else {
    console.error(`Unknown command "${cmd}".`);
    console.error('Run without arguments for usage.');
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});