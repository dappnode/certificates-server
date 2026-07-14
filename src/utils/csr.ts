import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { shell } from "./shell";

export interface CertificateSigningRequestDetails {
  commonName?: string;
  subjectAlternativeName?: string;
}

export interface CertificateSigningRequestValidationDetails extends CertificateSigningRequestDetails {
  expectedDomain: string;
  opensslError?: string;
}

export class InvalidCertificateSigningRequestError extends Error {
  constructor(
    message: string,
    public readonly details: CertificateSigningRequestValidationDetails
  ) {
    super(message);
  }
}

export function parseCertificateSigningRequest(
  opensslOutput: string
): CertificateSigningRequestDetails {
  const lines = opensslOutput.split("\n");
  const subjectLine = lines.find(line => line.startsWith("subject="));
  const commonName = subjectLine?.startsWith("subject=CN=")
    ? subjectLine.slice("subject=CN=".length)
    : undefined;

  const sanHeaderIndex = lines.findIndex(
    line => line.trim() === "X509v3 Subject Alternative Name:"
  );
  if (sanHeaderIndex === -1) return { commonName };

  const headerIndent = lines[sanHeaderIndex].search(/\S/);
  const sanLines: string[] = [];

  for (const line of lines.slice(sanHeaderIndex + 1)) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const indentation = line.search(/\S/);
    if (indentation <= headerIndent) break;
    sanLines.push(trimmedLine);
  }

  return {
    commonName,
    subjectAlternativeName: sanLines.join(" ") || undefined
  };
}

export function isCertificateSigningRequestForDomain(
  opensslOutput: string,
  expectedDomain: string
): boolean {
  const { commonName, subjectAlternativeName } =
    parseCertificateSigningRequest(opensslOutput);
  const expectedSubjectAlternativeName = `DNS:*.${expectedDomain}`;

  return (
    commonName?.toLowerCase() === expectedDomain.toLowerCase() &&
    subjectAlternativeName?.toLowerCase() ===
      expectedSubjectAlternativeName.toLowerCase()
  );
}

export async function assertValidCertificateSigningRequest(
  csr: Buffer,
  expectedDomain: string
): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cert-api-csr-"));
  const csrPath = path.join(tempDir, "request.csr");

  try {
    fs.writeFileSync(csrPath, csr, { mode: 0o600 });

    let output: string;
    try {
      output = await shell(
        "openssl",
        [
          "req",
          "-in",
          csrPath,
          "-noout",
          "-verify",
          "-subject",
          "-nameopt",
          "RFC2253",
          "-text"
        ],
        { timeout: 10_000 }
      );
    } catch (error) {
      throw new InvalidCertificateSigningRequestError("CSR invalid", {
        expectedDomain,
        opensslError: error instanceof Error ? error.message : String(error)
      });
    }

    const details = parseCertificateSigningRequest(output);
    if (!isCertificateSigningRequestForDomain(output, expectedDomain)) {
      throw new InvalidCertificateSigningRequestError("CSR domain invalid", {
        expectedDomain,
        ...details
      });
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
