import "mocha";
import { expect } from "chai";
import querystring from "querystring";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import rimraf from "rimraf";
import { agent, SuperAgentTest } from "supertest";
import { promisify } from "util";
import { app, RequestQueryOptions } from "../src/app";
import config from "../src/config";
import { getUserId, prepareMessageFromPackage } from "../src/utils";
// NPM package @types/csr-gen does not exist
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import csrgen from "csr-gen";

describe("app", () => {
  let request: SuperAgentTest;
  let wallet: ethers.HDNodeWallet;

  before("Create random identity", async () => {
    request = agent(app);
    wallet = ethers.Wallet.createRandom();

    console.log(
      "Generated random wallet with\nPublic key: " + wallet.publicKey
    );
    console.log("Private key: " + wallet.privateKey);
  });

  function createQueryString(timestamp: number): string {
    const signingKey: ethers.SigningKey = new ethers.SigningKey(
      wallet.privateKey
    );
    const signDigest = signingKey.sign.bind(signingKey);
    const signer = config.signerPackageEnsName;
    const hash = ethers.solidityPackedKeccak256(
      ["string"],
      [prepareMessageFromPackage(signer, timestamp.toString())]
    );
    const signature = ethers.Signature.from(signDigest(hash)).serialized;
    const params: RequestQueryOptions = {
      address: wallet.address,
      timestamp: timestamp.toString(),
      signature
    };
    return querystring.encode((params as unknown) as Record<string, string>);
  }

  it("should fail with validation errors", async () => {
    const response = await request.post("/").send();
    expect(response.status).to.equal(400);
  });

  it("should fail with out of sync timestamp", async () => {
    const timestamp =
      Math.floor(Date.now() / 1000) + config.signedTimeThresholdSec + 1;

    const queryString = createQueryString(timestamp);
    const response = await request.post(`/?${queryString}`).send();

    expect(response.status).to.equal(400);
  });

  it("should generate certificate", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const queryString = createQueryString(timestamp);

    const id = getUserId(wallet.address);
    const domain = `${id}.dyndns.dappnode.io`;

    const certDir = path.resolve(__dirname, "certs");
    fs.mkdirSync(certDir, { recursive: true });

    await promisify(csrgen)(domain, {
      outputDir: certDir,
      read: true,
      company: "Example, Inc.",
      email: "joe@foobar.com"
    });

    const csrFile = path.join(__dirname, "certs", domain + ".csr");
    const response = await agent(app)
      .post(`/?${queryString}`)
      .attach("csr", fs.createReadStream(csrFile));

    rimraf.sync(certDir);
    console.log({ body: response.body });
    expect(response.status).to.equal(200);
  }).timeout(0); // disable timeout as this is a long running process

  it("should return existing certificate", async () => {
    const id = getUserId(wallet.address);
    const timestamp = Math.floor(Date.now() / 1000);
    const queryString = createQueryString(timestamp);

    const response = await agent(app).post(`/?${queryString}`).send();

    expect(response.status).to.equal(200);
    expect(response.headers["x-certificate-cache"]).to.equal(id);
  });
});
