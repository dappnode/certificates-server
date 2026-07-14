import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express, { ErrorRequestHandler, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import multer from "multer";
import config from "./config";
import {
  shell,
  HttpError,
  BadRequestError,
  getUserId,
  isHex,
  assertValidSignedDappnodeMessage
} from "./utils";

const maxCsrSize = 10_000; // 10 KB
const renewalTimeThresholdMs = config.renewalTimeThresholdSec * 1000;

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  // Prevent an attacker from filling the memory with a large file
  limits: { fields: 1, fileSize: maxCsrSize, files: 1, parts: 1 }
});

app.use(
  rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    skip: () => config.debug
  })
);

export interface RequestQueryOptions {
  address?: string;
  timestamp?: string;
  signature?: string;
  force?: string;
}

app.use(morgan("tiny"));
app.post("/", upload.single("csr"), async (req, res) => {
  const query = req.query as unknown as RequestQueryOptions;
  const { address, signature } = query;
  const timestamp = Number(query.timestamp); // In seconds
  const force = query.force === "true";

  const nowMs = Date.now();
  const nowSec = nowMs / 1000;

  if (!address) throw new BadRequestError("param 'address' required");
  if (!signature) throw new BadRequestError("param 'signature' required");
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0)
    throw new BadRequestError("param 'timestamp' invalid");

  if (!isHex(address)) throw new BadRequestError("param 'address' invalid");
  if (!isHex(signature)) throw new BadRequestError("param 'signature' invalid");

  // Validate timestamp is in threshold `timeThreshold`
  if (Math.abs(nowSec - timestamp) > config.signedTimeThresholdSec)
    throw new BadRequestError("timestamp out of bounds");

  // Throws if the recovered address !== `address`
  try {
    assertValidSignedDappnodeMessage({ address, signature, timestamp });
  } catch {
    throw new BadRequestError("param 'signature' invalid");
  }

  const userId = getUserId(address);
  const workDir = path.join(os.tmpdir(), `certbot-${userId}`);

  if (fs.existsSync(path.join(workDir, ".certbot.lock"))) {
    throw Error(`Certbot instance already running for ${userId}`);
  }

  const csrFilename = userId + ".csr";
  const certBaseDir = path.join(config.baseDir, userId);
  const csrPath = path.join(certBaseDir, csrFilename);
  const fullchainPath = path.join(certBaseDir, "fullchain.pem");
  const chainPath = path.join(certBaseDir, "chain.pem");
  const certPath = path.join(certBaseDir, "cert.pem");

  const certificateLastRenewedMs = fs.existsSync(fullchainPath)
    ? fs.statSync(fullchainPath).mtimeMs
    : undefined;
  const isStillValid =
    certificateLastRenewedMs !== undefined &&
    nowMs - certificateLastRenewedMs < renewalTimeThresholdMs;

  if (isStillValid && !force) {
    return res.sendFile(fullchainPath, {
      headers: {
        "Content-Type": "application/x-pem-file",
        "X-Certificate-Cache": userId
      }
    });
  }

  // Must attach Certificate Signing Request as "csr" formData
  if (!req.file)
    throw new BadRequestError("Missing Certificate Signing Request (CSR)");
  if (req.file.buffer.length > maxCsrSize)
    throw new BadRequestError("CSR too big");

  fs.rmSync(certBaseDir, { recursive: true, force: true });
  fs.mkdirSync(certBaseDir, { recursive: true });

  fs.writeFileSync(csrPath, req.file.buffer);

  const args = [
    "certonly",
    "--noninteractive",
    "--agree-tos",
    "--force-renewal",
    ...(config.debug ? ["--test-cert"] : []),
    ...(config.email
      ? ["-m", config.email]
      : ["--register-unsafely-without-email"]),
    "--dns-rfc2136",
    "--dns-rfc2136-credentials",
    config.credsPath,
    "--cert-name",
    userId,
    "--chain-path",
    chainPath,
    "--fullchain-path",
    fullchainPath,
    "--cert-path",
    certPath,
    "--csr",
    csrPath,
    "--work-dir",
    workDir,
    "--logs-dir",
    path.join(workDir, "logs"),
    "--config-dir",
    path.join(workDir, "config")
  ];

  await shell("certbot", args).catch(error => {
    error.message = `Error running certbot: ${error.message}`;
    console.error(error);
    throw error;
  });

  res.sendFile(fullchainPath, {
    headers: {
      "Content-Type": "application/x-pem-file"
    }
  });
});

app.use((_req: Request, res: Response) => {
  res.status(404).send("Not Found");
});

// Default error handler
app.use(function (err, _req, res, next) {
  if (res.headersSent) {
    console.error(err);
    return next(err);
  }

  let code = 500;
  if (err instanceof HttpError) code = err.code;
  else if (err instanceof multer.MulterError) code = 400;

  if (code >= 500) console.error(err);
  res.status(code).send(err.message);
} as ErrorRequestHandler);

export { app };
