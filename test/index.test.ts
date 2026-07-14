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
import {
  getUserId,
  isCertificateSigningRequestForDomain,
  parseCertificateSigningRequest,
  prepareMessageFromPackage
} from "../src/utils";

const execFileAsync = promisify(execFile);

describe("app", () => {
  const certDir = path.resolve(__dirname, "certs");
  const originalBaseDir = config.baseDir;
  const originalDebug = config.debug;
  const integrationTest =
    process.env.RUN_INTEGRATION_TESTS === "true" ? it : it.skip;
  let request: ReturnType<typeof agent>;
  let wallet: ethers.Wallet;

  before(() => {
    fs.rmSync(certDir, { recursive: true, force: true });
    fs.mkdirSync(certDir, { recursive: true });
    config.baseDir = certDir;
    config.debug = true;
    request = agent(app);
    wallet = ethers.Wallet.createRandom();
  });

  after(() => {
    config.baseDir = originalBaseDir;
    config.debug = originalDebug;
    fs.rmSync(certDir, { recursive: true, force: true });
  });

  function createQueryString(
    timestamp: number,
    force?: string,
    signingWallet = wallet
  ): string {
    const signingKey = new ethers.SigningKey(signingWallet.privateKey);
    const signer = config.signerPackageEnsName;
    const hash = ethers.solidityPackedKeccak256(
      ["string"],
      [prepareMessageFromPackage(signer, timestamp.toString())]
    );
    const signature = signingKey.sign(hash).serialized;
    const params: RequestQueryOptions = {
      address: signingWallet.address,
      timestamp: timestamp.toString(),
      signature,
      force
    };
    return querystring.encode(params as unknown as Record<string, string>);
  }

  it("should fail with validation errors", async () => {
    const response = await request.post("/").send();
    assert.equal(response.status, 400);
  });

  it("should accept one CSR multipart part", async () => {
    const response = await request
      .post("/")
      .attach("csr", Buffer.from("not a real CSR"), "domain.csr");

    assert.equal(response.status, 400);
    assert.equal(response.text, "param 'address' required");
  });

  it("should reject multipart fields", async () => {
    const response = await request
      .post("/")
      .field("unexpected", "value")
      .attach("csr", Buffer.from("not a real CSR"), "domain.csr");

    assert.equal(response.status, 400);
    assert.equal(response.text, "Too many fields");
  });

  it("should reject oversized CSRs", async () => {
    const response = await request
      .post("/")
      .attach("csr", Buffer.alloc(10_001), "domain.csr");

    assert.equal(response.status, 400);
    assert.equal(response.text, "File too large");
  });

  it("should fail with out of sync timestamp", async () => {
    const timestamp =
      Math.floor(Date.now() / 1000) + config.signedTimeThresholdSec + 1;

    const queryString = createQueryString(timestamp);
    const response = await request.post(`/?${queryString}`).send();

    assert.equal(response.status, 400);
  });

  it("should support the caller's force=0/1 convention", async () => {
    const signingWallet = ethers.Wallet.createRandom();
    const id = getUserId(signingWallet.address);
    const certificateDir = path.join(certDir, id);
    const fullchainPath = path.join(certificateDir, "fullchain.pem");

    fs.mkdirSync(certificateDir, { recursive: true });
    fs.writeFileSync(fullchainPath, "cached certificate");

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const cachedResponse = await request
        .post(`/?${createQueryString(timestamp, "0", signingWallet)}`)
        .attach("csr", Buffer.from("not a real CSR"), "domain.csr");

      assert.equal(cachedResponse.status, 200);
      assert.equal(cachedResponse.text, "cached certificate");

      const forcedResponse = await request
        .post(`/?${createQueryString(timestamp, "1", signingWallet)}`)
        .attach("csr", Buffer.from("not a real CSR"), "domain.csr");

      assert.equal(forcedResponse.status, 400);
      assert.equal(forcedResponse.text, "CSR invalid");
      assert.equal(
        fs.readFileSync(fullchainPath, "utf8"),
        "cached certificate"
      );
    } finally {
      fs.rmSync(certificateDir, { recursive: true, force: true });
    }
  });

  it("should parse the authenticated domain from a CSR", () => {
    const domain = "69c0fa18f1bde619.dyndns.dappnode.io";
    const output = `Certificate Request:
        Requested Extensions:
            X509v3 Subject Alternative Name:
                DNS:*.${domain}
subject=CN=${domain}`;

    assert.deepEqual(parseCertificateSigningRequest(output), {
      commonName: domain,
      subjectAlternativeName: `DNS:*.${domain}`
    });
    assert.equal(isCertificateSigningRequestForDomain(output, domain), true);
    assert.equal(
      isCertificateSigningRequestForDomain(
        output.replace(`DNS:*.${domain}`, `DNS:*.other.${domain}`),
        domain
      ),
      false
    );
  });

  integrationTest("should generate certificate", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const queryString = createQueryString(timestamp);

    const id = getUserId(wallet.address);
    const domain = `${id}.${config.certificateDomainSuffix}`;

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
      "-addext",
      `subjectAltName=DNS:*.${domain}`,
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
