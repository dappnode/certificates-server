import express from 'express';
import fileUpload from 'express-fileupload';
import path from 'path';
import {exec, ChildProcess} from 'child_process';
import asyncHandler from 'express-async-handler';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import EthCrypto from 'eth-crypto';

import {createIfNotExists, promisifyChildProcess} from './utils';

// ENVIRONMENT
const BASE_DIR: string = process.env.BASE_DIR || '/etc/letsencrypt/'
const CREDS_LOCATION: string = process.env.CREDS_LOCATION || path.join(BASE_DIR, 'creds.ini');
const EMAIL_OPTION: string = process.env.LETSENCRYPT_EMAIL?'-m ' + process.env.LETSENCRYPT_EMAIL:'--register-unsafely-without-email';
const time_threshold:number = parseInt(process.env.DYNDNS_THRESHOLD || "600");
const RENEWAL_TIME_THRESHOLD: number = parseInt(process.env.RENEWAL_TIME_TRESHOLD || "6500000")


// BUILDING DIRS
const CSR_DIR: string = path.join(BASE_DIR, 'csr'); createIfNotExists(CSR_DIR);
const CERT_DIR: string = path.join(BASE_DIR, 'cert'); createIfNotExists(CERT_DIR);
const CHAIN_DIR: string = path.join(BASE_DIR, 'chain'); createIfNotExists(CHAIN_DIR);
const FULLCHAIN_DIR: string = path.join(BASE_DIR, 'fullchain'); createIfNotExists(FULLCHAIN_DIR);

const errmesg: string = "An error has ocurred. If necessary, contact dAppNode team with following log: ";
const app = express();

app.use(fileUpload({
    limits: {fileSize: 100 * 1024},
    abortOnLimit: true
  }));


app.use(rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5 
  }));


app.post('/', asyncHandler(async (req, res, next) => {
  
  const address: string = req.query.address as string;
  const timestamp: number = parseInt(req.query.timestamp as string, 10);
  const sig: string = req.query.sig as string;
  let signAddress: string = "0x0";
  const epoch: number = Math.floor(new Date().getTime() / 1000);
  let forceUpdate: string = "no";
  if ("force" in req.query) {
    forceUpdate = req.query.force as string;
  }

  if (time_threshold >= timestamp) console.log(`Warning: Threshold ${time_threshold} is bigger than timestamp.`);

  if (!timestamp && !sig && !address) {
    res.status(200).send(JSON.stringify({ message: "DAppNode Cert" }));
    return;
  }

  if (!timestamp || !sig || !address) {
    res.status(400).send(JSON.stringify({ message: "Missing parameter(s)" }));
    return;
  }

  try {
    signAddress = EthCrypto.recover(sig, EthCrypto.hash.keccak256(timestamp.toString()));
  } catch (err) {
    res.status(400).send(JSON.stringify({ message: "Signing error: " + err.message }));
    return;
  }

  // Check if provided timestamp is in sync with us.
  const validTimestamp: boolean = epoch <= timestamp + time_threshold && epoch >= timestamp - time_threshold;

  if (signAddress.toLowerCase() !== address.toLowerCase()) {
    res.status(400).send(JSON.stringify({ message: "Invalid address or signature." }));
    return;
  } else if (!validTimestamp) {
    res.status(400).send(JSON.stringify({message: "Timestamp out of sync. Is your server syncronized?"}));
    return;
  }

  if (!req.files || Object.keys(req.files).length === 0) {
    res.status(400).send('No files were uploaded.')
    return;
  }

  const file: fileUpload.UploadedFile = req.files.csr;
  //const id: string = req.params.id;
  const id: string = address.toLowerCase().substr(2).substring(0, 16);
  const csr: string = id + '.csr';

  // verify CSR
  const csr_path: string = path.join(CSR_DIR, csr);
  if(fs.existsSync(csr_path))
  {
    if(epoch - fs.statSync(csr_path).ctime.getDate()/1000 < RENEWAL_TIME_THRESHOLD && forceUpdate != "yes") {
      return res.download(`${FULLCHAIN_DIR}/${id}.pem`)
    }
    else {
      fs.rmSync(csr_path);
      if(fs.existsSync(`${CHAIN_DIR}/${id}.pem`)) {
        fs.rmSync(`${CHAIN_DIR}/${id}.pem`);
        fs.rmSync(`${FULLCHAIN_DIR}/${id}.pem`);
        fs.rmSync(`${CHAIN_DIR}/${id}.pem`);
      }
    }
  }

  await file.mv(csr_path);

  const cmnd: string = `certbot certonly --test-cert --dns-rfc2136 --dns-rfc2136-credentials ${CREDS_LOCATION} --noninteractive ${EMAIL_OPTION} --agree-tos --cert-name ${id} --chain-path ${CHAIN_DIR}/${id}.pem --fullchain-path ${FULLCHAIN_DIR}/${id}.pem --cert-path ${CERT_DIR}/${id}.pem --csr ${csr_path}`
  console.log(cmnd);
  const exec_handler: ChildProcess = exec(cmnd);    //
  let output: string = '';
  let errout: string = '';
  exec_handler.stdout.on('data', (data: string) => {
    console.log('stdout: ' + data);
    output += data;
  });
  exec_handler.stderr.on('data', (data: string) =>  {
    console.log('stderr: ' + data);
    errout += data;
  });

  promisifyChildProcess(exec_handler).then(()=> {
    return res.download(`${FULLCHAIN_DIR}/${id}.pem`)
  }).catch(()=>{
    next(errmesg + errout);
  })

}));

export {app};


