import { expect } from "chai";
import csrgen from "csr-gen";
import del from "del";
import { ethers } from "ethers";
import fs from "fs";
import "mocha";
import path from "path";
import { agent } from "supertest";
import { promisify } from "util";
import { app } from "../src/app";
import { createIfNotExists } from "../src/utils";

describe("app", () => {
  it("should generate certificate", async () => {
    const identity: ethers.Wallet = ethers.Wallet.createRandom();
    const timestamp: number = Math.floor(Date.now() / 1000);
    const wallet: ethers.Wallet = new ethers.Wallet(identity.privateKey);

    console.log("Generated random wallet with\nPublic key:" + wallet.publicKey);
    console.log("Private key: " + wallet.privateKey);

    const signingKey: ethers.utils.SigningKey = new ethers.utils.SigningKey(
      identity.privateKey
    );
    const signDigest: any = signingKey.signDigest.bind(signingKey);
    const hash: string = ethers.utils.solidityKeccak256(
      ["string"],
      [timestamp.toString()]
    );
    const signature: string = ethers.utils.joinSignature(signDigest(hash));
    const parameters = [
      `address=${wallet.address}`,
      `timestamp=${timestamp}`,
      `sig=${signature}`,
      "force=true",
    ];
    console.log("Parameters: " + parameters.join("&"));

    const domain: string = `${wallet.address
      .toLowerCase()
      .substr(2)
      .substring(0, 16)}.dyndns.dappnode.io`;

    console.log("Domain: " + domain);

    const certDir: string = path.resolve(__dirname, "certs");
    createIfNotExists(certDir);

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

    console.log(response.body);
    expect(response.status).to.equal(200);
  }).timeout(0); // disable timeout as this is a long running process
});
