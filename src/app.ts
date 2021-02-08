import os from "os";
import fs from "fs";
import path from "path";
import rimraf from "rimraf";
import express, { ErrorRequestHandler, Request, Response } from "express";
import asyncHandler from "express-async-handler";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import multer from "multer";
import config from "./config";
import {
  shell,
  HttpError,
  BadRequestError,
  isHex,
  assertValidSignedDappnodeMessage
} from "./utils";

const maxCsrSize = 10e3; // 10 KB;
const renewalTimeThresholdMs = config.renewalTimeThresholdSec * 1000;

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  // Prevent an attacker from filling the memory with a large file
  limits: { fields: 1, fileSize: maxCsrSize, files: 1, parts: 1 }
});

app.use(
  rateLimit({
    windowMs: parseInt(config.rateLimitWindowMs),
    max: config.debug ? 0 : config.rateLimitMax
  })
);

export interface RequestQueryOptions {
  address: string;
  timestamp: string;
  signature: string;
  force?: boolean;
}

app.use(morgan("tiny"));
app.post(
  "/",
  upload.single("csr"),
  asyncHandler(async (req, res) => {
    const query = (req.query as unknown) as RequestQueryOptions;
    const { address, signature } = query;
    const timestamp = parseInt(query.timestamp, 10); // In seconds
    const force = Boolean(query.force);

    const nowMs = Date.now();
    const nowSec = nowMs / 1000;

    if (!address) throw new BadRequestError("param 'address' required");
    if (!signature) throw new BadRequestError("param 'signature' required");
    if (!timestamp) throw new BadRequestError("param 'timestamp' invalid");

    if (!isHex(address)) throw new BadRequestError("param 'address' invalid");
    if (!isHex(signature))
      throw new BadRequestError("param 'signature' invalid");

    // Validate timestamp is in threshold `timeThreshold`
    if (Math.abs(nowSec - timestamp) > config.signedTimeThresholdSec)
      throw new BadRequestError("timestamp out of bounds");

    // Throws if the recovered address !== `address`
    assertValidSignedDappnodeMessage({ address, signature, timestamp });

    const userId = address.toLowerCase().substr(2).substring(0, 16);
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

    const csrLastRenewedMs =
      fs.existsSync(fullchainPath) &&
      fs.statSync(fullchainPath).ctime.getTime();
    const isStillValid =
      csrLastRenewedMs && nowMs - csrLastRenewedMs < renewalTimeThresholdMs;

    if (isStillValid && !force) {
      return res.sendFile(fullchainPath, {
        headers: {
          "Content-Type": "application/x-pem-file",
          "X-Certificate-Cache": userId
        }
      });
    }

    rimraf.sync(certBaseDir);
    fs.mkdirSync(certBaseDir, { recursive: true });

    // Must attach Certificate Signing Request as "csr" formData
    if (!req.file)
      throw new BadRequestError("Missing Certificate Signing Request (CSR)");
    if (req.file.buffer.length > maxCsrSize)
      throw new BadRequestError("CSR to big");

    fs.writeFileSync(csrPath, req.file.buffer);

    const command = [
      "certbot",
      "certonly",
      "--noninteractive",
      "--agree-tos",
      "--force-renewal",
      config.debug ? "--test-cert" : undefined,
      config.email ? `-m ${config.email}` : "--register-unsafely-without-email",
      "--dns-rfc2136",
      `--dns-rfc2136-credentials "${config.credsPath}"`,
      `--cert-name ${userId}`,
      `--chain-path "${chainPath}"`,
      `--fullchain-path "${fullchainPath}"`,
      `--cert-path "${certPath}"`,
      `--csr "${csrPath}"`,
      `--work-dir "${workDir}"`,
      `--logs-dir "${path.join(workDir, "logs")}"`,
      `--config-dir "${path.join(workDir, "config")}"`
    ].filter((part): part is string => Boolean(part));

    await shell(command).catch(e => {
      e.message = `Error running certbot: ${e.message}`;
      console.error(e);
      throw e;
    });

    res.sendFile(fullchainPath, {
      headers: {
        "Content-Type": "application/x-pem-file"
      }
    });
  })
);

app.use((_req: Request, res: Response) => {
  res.status(404).send("Not Found");
});

// Default error handler
app.use(function (err, _req, res, next) {
  console.log(err);

  if (res.headersSent) {
    return next(err);
  } else {
    const code = err instanceof HttpError ? err.code : 500;
    res.status(code).send(err.message);
  }
} as ErrorRequestHandler);

export { app };
