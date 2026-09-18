import { authenticator } from 'otplib';
import QRCode from 'qrcode';

authenticator.options = { window: 1 };

export const MFA_ISSUER = 'PIETRAx Admin';

export function generateTOTPSecret(): string {
  return authenticator.generateSecret();
}

export function keyUriFor(secret: string, account: string): string {
  return authenticator.keyuri(account, MFA_ISSUER, secret);
}

export async function qrDataUrlFor(secret: string, account: string): Promise<string> {
  return QRCode.toDataURL(keyUriFor(secret, account), { margin: 1, width: 320 });
}

export function verifyTOTP(token: string, secret: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}