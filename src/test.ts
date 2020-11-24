import { ethers } from "ethers";
import csrgen from "csr-gen";


async function testCert(): Promise<string> {

    const identity: any = ethers.Wallet.createRandom();
    const timestamp: number = Math.floor(Date.now() / 1000);
    const wallet: any = new ethers.Wallet(identity.privateKey);

    console.log("Generated random wallet with\nPublic key:" + wallet.publicKey);
    console.log("Private key: " + wallet.privateKey);
    
    
    
    const signingKey = new ethers.utils.SigningKey(identity.privateKey);
    const signDigest = signingKey.signDigest.bind(signingKey);
    const hash = ethers.utils.solidityKeccak256(
        ["string"],
        [timestamp.toString()]
    );
    const signature = ethers.utils.joinSignature(signDigest(hash));
    const parameters = [
        `address=${wallet.address}`,
        `timestamp=${timestamp}`,
        `sig=${signature}`
    ];

    const domain = `${wallet.address.toLowerCase().substr(2).substring(0, 16)}.dyndns.dappnode.io`;
    const url = `localhost:5000/?${parameters.join("&")}`;
    const keys = await csrgen(domain, {
        outputDir: __dirname,
        read: true,
        company: 'Example, Inc.',
        email: 'joe@foobar.com'
    });

    console.log(domain);
    console.log(url);
    console.log(keys);
    
    const res = await fetch(url, {
        method: 'POST',
        headers: {
        "Content-length": Buffer.byteLength(keys.csr, 'utf8').toString()
        },
           body: keys.csr
    });

    const status = res.status;
    if (status !== 200) {
        try {
            const bodyError: { message: string } = await res.json();
            throw Error(`${status}, ${bodyError.message}`);
        } catch (e) {
            throw Error(`${status}, ${res.statusText}`);
        }
    }
    
    return res.text();
}

console.log(testCert());