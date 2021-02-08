import dotenv from "dotenv-defaults";
import path from "path";
dotenv.config();

const baseDir = process.env.BASE_DIR || "/etc/letsencrypt/";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export default {
  debug: Boolean(process.env.DEBUG),
  rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS || "3600000",
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || "5"),
  signedTimeThresholdSec: process.env.DYNDNS_THRESHOLD
    ? parseInt(process.env.DYNDNS_THRESHOLD)
    : 10 * MINUTE,
  renewalTimeThresholdSec: process.env.RENEWAL_TIME_TRESHOLD
    ? parseInt(process.env.RENEWAL_TIME_TRESHOLD)
    : 75 * DAY,
  email: process.env.LETSENCRYPT_EMAIL,
  baseDir,
  credsPath: process.env.CREDS_LOCATION || path.join(baseDir, "creds.ini"),
  signaturePrefix: "\x1dDappnode Signed Message:",
  signerPackageEnsName: "https-portal.dnp.dappnode.eth"
};
