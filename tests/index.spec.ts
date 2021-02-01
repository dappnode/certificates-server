import { expect } from "chai";
import csrgen from "csr-gen";
import del from "del";
import { ethers } from "ethers";
import fs from "fs";
import "mocha";
import path from "path";
import { agent, SuperAgentTest } from "supertest";
import { promisify } from "util";
import { app } from "../src/app";
import config from "../src/config";
import { prepareMessageFromPackage } from "../src/utils";

describe("app", () => {
  let request: SuperAgentTest;
  let wallet: ethers.Wallet;

  before(async () => {
    request = agent(app);
    wallet = ethers.Wallet.createRandom();

    console.log(
      "Generated random wallet with\nPublic key: " + wallet.publicKey
    );
    console.log("Private key: " + wallet.privateKey);
  });

  const createParameters = (
    wallet: ethers.Wallet,
    timestamp: number
  ): string[] => {
    const signingKey: ethers.utils.SigningKey = new ethers.utils.SigningKey(
      wallet.privateKey
    );
    const signDigest: any = signingKey.signDigest.bind(signingKey);
    const signer: string = "https-portal";
    const hash: string = ethers.utils.solidityKeccak256(
      ["string"],
      [prepareMessageFromPackage(signer, timestamp.toString())]
    );
    const signature: string = ethers.utils.joinSignature(signDigest(hash));
    return [
      `address=${wallet.address}`,
      `timestamp=${timestamp}`,
      `signer=${signer}`,
      `signature=${signature}`,
    ];
  };

  it("should fail with validation errors", async () => {
    const response = await request.post("/").send();
    expect(response.status).to.equal(400);
  });

  it("should fail with out of sync timestamp", async () => {
    const timestamp: number =
      Math.floor(Date.now() / 1000) + parseInt(config.timeThreshold) + 1;

    const parameters = createParameters(wallet, timestamp);
    const response = await request.post(`/?${parameters.join("&")}`).send();

    expect(response.status).to.equal(400);
  });

  it("should generate certificate", async () => {
    const timestamp: number = Math.floor(Date.now() / 1000);
    const parameters = createParameters(wallet, timestamp);

    const id = wallet.address.toLowerCase().substr(2).substring(0, 16);
    const domain: string = `${id}.dyndns.dappnode.io`;

    const certDir: string = path.resolve(__dirname, "certs");
    fs.mkdirSync(certDir, { recursive: true });

    await promisify(csrgen)(domain, {
      outputDir: certDir,
      read: true,
      company: "Example, Inc.",
      email: "joe@foobar.com",
    });

    const csrFile: string = path.join(__dirname, "certs", domain + ".csr");
    const response = await agent(app)
      .post(`/?${parameters.join("&")}`)
      .attach("csr", fs.createReadStream(csrFile));

    del.sync(certDir);
    expect(response.status).to.equal(200);
  }).timeout(0); // disable timeout as this is a long running process

  it("should return existing certificate", async () => {
    const id = wallet.address.substr(2).substring(0, 16).toLowerCase();
    const timestamp: number = Math.floor(Date.now() / 1000);
    const parameters = createParameters(wallet, timestamp);

    const response = await agent(app)
      .post(`/?${parameters.join("&")}`)
      .send();

    expect(response.status).to.equal(200);
    expect(response.headers["x-certificate-cache"]).to.equal(id);
  });
});
