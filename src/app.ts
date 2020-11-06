import express from 'express';
import fileUpload from 'express-fileupload';
import path from 'path';
import {exec, ChildProcess} from 'child_process';
import asyncHandler from 'express-async-handler';
import {createIfNotExists, promisifyChildProcess} from './utils';

// ENVIRONMENT
const BASE_DIR: string = process.env.BASE_DIR || '/etc/letsencrypt/'
const CREDS_LOCATION: string = process.env.CREDS_LOCATION || path.join(BASE_DIR, 'creds.ini');
const EMAIL_OPTION: string = process.env.LETSENCRYPT_EMAIL?'-m '+process.env.LETSENCRYPT_EMAIL:'--register-unsafely-without-email';


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


app.post('/sign/:id', asyncHandler(async (req, res, next) => {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send('No files were uploaded.');
    }

    const file: fileUpload.UploadedFile = req.files.csr;
    const id: string = req.params.id;
    const csr: string = id + '.csr';

    // verify CSR
    const csr_path: string = path.join(CSR_DIR, csr);
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
      return res.download(`/etc/letsencrypt/fullchain/${id}.pem`)
    }).catch(()=>{
      next(errmesg + errout);
    })

  }));

app.get('/renew/:id', asyncHandler(async (req, res, next) => {

    const id: string = req.params.id;

    const cmnd: string = `certbot --test-cert renew --cert-name ${id}`
    console.log(cmnd);
    const exec_handler: ChildProcess = exec(cmnd);
    let errout: string = '';
    let output: string = '';

    exec_handler.stdout.on('data', (data: string) => {
      console.log('stdout: ' + data);
      output += data;
    });
    exec_handler.stderr.on('data', (data: string) =>  {
      console.log('stderr: ' + data);
      errout += data;
    });

    promisifyChildProcess(exec_handler).then(()=> {
      return res.status(200).send("Certificate renewed!");
    }).catch(()=>{
      next(errmesg + errout);
    })
    // `certbot renew --cert-name ${id} --dry-run`
}));


app.get('/revoke/:id', asyncHandler(async (req, res, next) => {
  const id: string = req.params.id;

  const cmnd: string = `certbot revoke --test-cert --cert-name ${id} --delete-after-revoke`
  console.log(cmnd);
  const exec_handler: ChildProcess = exec(cmnd);
  let errout: string = '';
  let output: string = '';

  exec_handler.stdout.on('data', (data: string) => {
    console.log('stdout: ' + data);
    output += data;
  });
  exec_handler.stderr.on('data', (data: string) =>  {
    console.log('stderr: ' + data);
    errout += data;
  });

  promisifyChildProcess(exec_handler).then(()=> {
    return res.status(200).send("Certificate revoked!");
  }).catch(()=>{
    next(errmesg + errout);
  });
}));
export {app};


