import { ChildProcess, exec } from "child_process";
import express, { NextFunction, Request, Response } from "express";
import asyncHandler from "express-async-handler";
import rateLimit from "express-rate-limit";
import { query, validationResult } from "express-validator";
import fs from "fs";
import morgan from "morgan";
import multer from "multer";
import path from "path";
import config from "./config";
import { RequestQueryOptions } from "./types";
import { promisifyChildProcess, prepareMessageFromPackage } from "./utils";
import { ethers } from "ethers";

const timeThreshold: number = parseInt(config.timeThreshold, 10);
const renewalTimeThreshold: number = parseInt(config.renewalTimeThreshold, 10);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(
  rateLimit({
    windowMs: parseInt(config.rateLimitWindowMs),
    max: config.debug ? 0 : parseInt(config.rateLimitMax),
  })
);

app.use(morgan("tiny"));
app.post(
  "/",
  [
    upload.single("csr"),
    query("address")
      .exists()
      .matches("^0x[a-zA-Z0-9]+$")
      .withMessage("Invalid address format"),
      query("timestamp")
      .exists()
      .matches("^\\d+$")
      .withMessage("Invalid timestamp"),
    query("signer")
      .exists()
      .isString()
      .withMessage("Invalid signer"),
    query("signature")
      .exists()
      .matches("^0x[a-zA-Z0-9]+$")
      .withMessage("Invalid signature format"),
    query("force").optional({ nullable: false }).isBoolean().toBoolean(),
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      address,
      timestamp,
      signer,
      signature,
      force = false
    }: RequestQueryOptions = req.query as any;

    const timestampNumber = parseInt(timestamp, 10);
    const epoch: number = Math.floor(new Date().getTime() / 1000);

    if (timeThreshold >= timestampNumber) {
      console.log(
        `Warning: Threshold ${timeThreshold} is bigger than timestamp`
      );
    }
    const hash: string = ethers.utils.solidityKeccak256(
      ["string"],
      [prepareMessageFromPackage(signer, timestamp.toString())]
    );
    const signAddress = ethers.utils.recoverAddress(hash, signature);

    // validate signature
    if (signAddress.toLowerCase() !== address.toLowerCase()) {
      return res.status(400).json({ error: "Invalid address, signer or signature" });
    }

    // check if provided timestamp is in sync with us
    const validTimestamp: boolean =
      epoch <= timestampNumber + timeThreshold &&
      epoch >= timestampNumber - timeThreshold;

    if (!validTimestamp) {
      return res.status(400).json({ error: "Timestamp out of sync" });
    }

    const id: string = address.toLowerCase().substr(2).substring(0, 16);
    const csr: string = id + ".csr";

    const certBaseDir = path.join(config.baseDir, id);
    fs.mkdirSync(certBaseDir, {recursive: true});
    const csrPath: string = path.join(certBaseDir, csr);
    if (fs.existsSync(csrPath)) {
      const csrTimestamp = fs.statSync(csrPath).ctime.getTime() / 1000;
      const shouldRenew = epoch - csrTimestamp > renewalTimeThreshold || force;

      const fcPath = `${certBaseDir}/fullchain.pem`;
      if (!shouldRenew && fs.existsSync(fcPath)) {
        return res.sendFile(fcPath, {
          headers: {
            "Content-Type": "application/x-pem-file",
            "X-Certificate-Cache": id,
          },
        });
      } else {
        fs.rmdirSync(certBaseDir, { recursive: true });
        fs.mkdirSync(certBaseDir, {recursive: true});
      }
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ error: "Missing Certificate Signing Request (CSR)" });
    }

    fs.writeFileSync(csrPath, req.file.buffer);

    const options = [
      config.debug ? "--test-cert" : "",
      config.email ? `-m ${config.email}` : "--register-unsafely-without-email",
      `--dns-rfc2136 --dns-rfc2136-credentials "${config.credsPath}"`,
      `--cert-name ${id}`,
      `--key-path "${certBaseDir}/privkey.pem"`,
      `--chain-path "${certBaseDir}/chain.pem"`,
      `--fullchain-path "${certBaseDir}/fullchain.pem"`,
      `--cert-path "${certBaseDir}/cert.pem"`,
      `--csr "${csrPath}"`,
    ];

    const flags = options.join(" ");
    const command: string = `certbot certonly --noninteractive --agree-tos --force-renewal ${flags}`;
    console.log(command);

    const child: ChildProcess = exec(command);
    child.stdout.on("data", (data: string) => console.log(data));
    child.stderr.on("data", (data: string) => console.log(data));

    promisifyChildProcess(child)
      .then(() => {
        return res.sendFile(`${certBaseDir}/fullchain.pem`, {
          headers: {
            "Content-Type": "application/x-pem-file",
          },
        });
      })
      .catch((err) => {
        console.log(err);
        next(err);
      });
  })
);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  return res.status(500).json({
    error: err,
  });
});

app.use((req: Request, res: Response, next: NextFunction) => {
  return res.status(404).json({
    error: "Not Found",
  });
});

export { app };
