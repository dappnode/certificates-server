import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import querystring from "node:querystring";
import { after, before, describe, it } from "node:test";
import { promisify } from "node:util";
import { ethers } from "ethers";
import { agent } from "supertest";
import { app, RequestQueryOptions } from "../src/app";
import config from "../src/config";
import { getUserId, prepareMessageFromPackage } from "../src/utils";

const execFileAsync = promisify(execFile);

describe("app", () => {
  const certDir = path.resolve(__dirname, "certs");
  const integrationTest =
    process.env.RUN_INTEGRATION_TESTS === "true" ? it : it.skip;
  let request: ReturnType<typeof agent>;
  let wallet: ethers.Wallet;

  before(() => {
    request = agent(app);
    wallet = ethers.Wallet.createRandom();
  });

  after(() => fs.rmSync(certDir, { recursive: true, force: true }));

  function createQueryString(timestamp: number): string {
    const signingKey = new ethers.SigningKey(wallet.privateKey);
    const signer = config.signerPackageEnsName;
    const hash = ethers.solidityPackedKeccak256(
      ["string"],
      [prepareMessageFromPackage(signer, timestamp.toString())]
    );
    const signature = signingKey.sign(hash).serialized;
    const params: RequestQueryOptions = {
      address: wallet.address,
      timestamp: timestamp.toString(),
      signature
    };
    return querystring.encode(params as unknown as Record<string, string>);
  }

  it("should fail with validation errors", async () => {
    const response = await request.post("/").send();
    assert.equal(response.status, 400);
  });

  it("should fail with out of sync timestamp", async () => {
    const timestamp =
      Math.floor(Date.now() / 1000) + config.signedTimeThresholdSec + 1;

    const queryString = createQueryString(timestamp);
    const response = await request.post(`/?${queryString}`).send();

    assert.equal(response.status, 400);
  });

  integrationTest("should generate certificate", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const queryString = createQueryString(timestamp);

    const id = getUserId(wallet.address);
    const domain = `${id}.dyndns.dappnode.io`;

    fs.mkdirSync(certDir, { recursive: true });

    const csrFile = path.join(__dirname, "certs", domain + ".csr");
    const keyFile = path.join(__dirname, "certs", domain + ".key");
    await execFileAsync("openssl", [
      "req",
      "-new",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-subj",
      `/CN=${domain}`,
      "-keyout",
      keyFile,
      "-out",
      csrFile
    ]);

    const response = await agent(app)
      .post(`/?${queryString}`)
      .attach("csr", fs.createReadStream(csrFile));

    assert.equal(response.status, 200);
  });

  integrationTest("should return existing certificate", async () => {
    const id = getUserId(wallet.address);
    const timestamp = Math.floor(Date.now() / 1000);
    const queryString = createQueryString(timestamp);

    const response = await agent(app).post(`/?${queryString}`).send();

    assert.equal(response.status, 200);
    assert.equal(response.headers["x-certificate-cache"], id);
  });
});
