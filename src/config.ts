import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: [".env", ".env.defaults"], quiet: true });

const baseDir = process.env.BASE_DIR || "/etc/letsencrypt/";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function getPositiveInteger(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (rawValue === undefined) return fallback;

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function isEnabled(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes(value?.toLowerCase() ?? "");
}

export default {
  debug: isEnabled(process.env.DEBUG),
  rateLimitWindowMs: getPositiveInteger("RATE_LIMIT_WINDOW_MS", HOUR * 1000),
  rateLimitMax: getPositiveInteger("RATE_LIMIT_MAX", 5),
  signedTimeThresholdSec: getPositiveInteger("DYNDNS_THRESHOLD", 10 * MINUTE),
  renewalTimeThresholdSec: getPositiveInteger(
    process.env.RENEWAL_TIME_THRESHOLD
      ? "RENEWAL_TIME_THRESHOLD"
      : "RENEWAL_TIME_TRESHOLD",
    75 * DAY
  ),
  email: process.env.LETSENCRYPT_EMAIL,
  baseDir,
  credsPath: process.env.CREDS_LOCATION || path.join(baseDir, "creds.ini"),
  certificateDomainSuffix:
    process.env.CERTIFICATE_DOMAIN_SUFFIX || "dyndns.dappnode.io",
  signaturePrefix: "\x1dDappnode Signed Message:",
  signerPackageEnsName: "https.dnp.dappnode.eth"
};
