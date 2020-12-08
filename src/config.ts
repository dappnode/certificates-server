import dotenv from "dotenv-defaults";
import path from "path";
dotenv.config();

const baseDir = process.env.BASE_DIR || "/etc/letsencrypt/";

export default {
  debug: ["1", "true"].includes(process.env.DEBUG),
  rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS || "3600000",
  rateLimitMax: process.env.RATE_LIMIT_MAX || "5",
  timeThreshold: process.env.DYNDNS_THRESHOLD || "600",
  renewalTimeThreshold: process.env.RENEWAL_TIME_TRESHOLD || "6500000",
  email: process.env.LETSENCRYPT_EMAIL,
  baseDir,
  credsPath: process.env.CREDS_LOCATION || path.join(baseDir, "creds.ini"),
  signaturePrefix: "\x1dDappnode Signed Message:"
};
