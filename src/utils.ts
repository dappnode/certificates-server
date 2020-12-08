import fs from "fs";
import { ChildProcess } from "child_process";
import singaturePrefix from "./config";

function createIfNotExists(path: string) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path);
  }
}

function promisifyChildProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.addListener("error", reject);
    child.addListener("exit", (code) => {
      console.log(`Child process exited with code ${code}`);
      if (code === 0) {
        resolve();
      } else {
        reject("Child process exited with non-zero code");
      }
    });
  });
}

function prepareMessageFromPackage(packageEnsName: string, data: string): string {
  return (
    singaturePrefix +
    "\n" +
    packageEnsName +
    "\n" +
    data.length +
    "\n" +
    data
  );
}

export { createIfNotExists, promisifyChildProcess, prepareMessageFromPackage};
