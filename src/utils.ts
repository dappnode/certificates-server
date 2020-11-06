import fs from 'fs';
import {ChildProcess} from 'child_process';


function createIfNotExists(path: string) {
    if(!fs.existsSync(path)){
        fs.mkdirSync(path);
    }
  };

function promisifyChildProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) =>  {
      child.addListener("error", reject);
      child.addListener('exit', (code, signal) => {
        console.log("code: " + code);
        if (code === 0) {
          resolve();
        } else {
          reject();
        }});
  });
}
export {createIfNotExists, promisifyChildProcess};