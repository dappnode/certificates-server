import { ethers } from "ethers";
import config from "../config";

export function prepareMessageFromPackage(
  packageEnsName: string,
  data: string
): string {
  return [config.signaturePrefix, packageEnsName, data.length, data].join("\n");
}

/**
 * Throws if provided DAppNode message signature is not valid
 */
export function assertValidSignedDappnodeMessage({
  address,
  signature,
  timestamp
}: {
  address: string;
  signature: string;
  timestamp: number;
}): void {
  const message = prepareMessageFromPackage(
    config.signerPackageEnsName,
    timestamp.toString()
  );
  const hash = ethers.utils.solidityKeccak256(["string"], [message]);
  const signingAddress = ethers.utils.recoverAddress(hash, signature);

  // validate signature
  if (signingAddress.toLowerCase() !== address.toLowerCase()) {
    throw Error("Invalid DAppNode signed message");
  }
}
