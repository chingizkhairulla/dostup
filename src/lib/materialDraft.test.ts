import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextMaterialOrder, localMaterialDateTime, scheduledMaterialDate } from './materialDraft.ts';
import { uploadMaterialObject, MaterialNetworkError, MAX_MATERIAL_PROXY_BYTES } from './materialUpload.ts';
import { materialResponseSize } from '../../supabase/functions/_shared/materialSize.ts';

test('new materials append within their parent and ignore deleted siblings', () => {
  const materials=[{parent_id:null,order_index:7},{parent_id:null,order_index:2},{parent_id:'folder',order_index:50},{parent_id:null,order_index:99,deleted_at:'2026-01-01'}];
  assert.equal(nextMaterialOrder(materials,null),8);
  assert.equal(nextMaterialOrder(materials,'folder'),51);
  assert.equal(nextMaterialOrder(materials,'empty'),0);
});
test('each file has an independent validated date and local edit value', () => {
  const local=localMaterialDateTime(new Date(2026,9,28,17,42));
  assert.equal(local,'2026-10-28T17:42');
  assert.equal(scheduledMaterialDate(true,local),new Date(local).toISOString());
  assert.equal(scheduledMaterialDate(false,''),null);
  assert.throws(()=>scheduledMaterialDate(true,''),/дату и время/);
  assert.throws(()=>scheduledMaterialDate(true,'invalid'),/дату и время/);
});
test('partial content size uses total bytes and never reports a one-byte sample as the whole file', () => {
  assert.equal(materialResponseSize(new Response('a',{status:206,headers:{'content-range':'bytes 0-0/4096','content-length':'1'}})),4096);
  assert.equal(materialResponseSize(new Response('a',{status:206,headers:{'content-length':'1'}})),null);
  assert.equal(materialResponseSize(new Response(null,{status:200,headers:{'content-length':'0'}})),0);
  assert.equal(materialResponseSize(new Response(null,{status:404,headers:{'content-length':'30'}})),null);
});
const endpoint='https://example.test/functions/v1/s3-presign-upload';
const path='s3://qa/product/object.txt';
const file=new File(['тест'],'test.txt',{type:'text/plain'});
const options={endpoint,publicKey:'public',credentials:{productId:'product',role:'creator',creatorToken:'session',creatorName:'qa'}};
const signed=()=>Response.json({uploadUrl:'https://bucket.s3.test/product/object.txt',storagePath:path});

test('successful direct upload keeps path and does not perform a relay',async()=>{
  let calls=0,progress=0;
  const result=await uploadMaterialObject(file,{...options,fetcher:async()=>{calls++;return signed();},putFile:async(url,body)=>{assert.equal(url,'https://bucket.s3.test/product/object.txt');assert.equal(body,file);},onProgress:p=>{progress=p;}});
  assert.equal(result,path);assert.equal(calls,1);assert.equal(progress,100);
});
test('a browser network/CORS failure retries through the authenticated server with the same object path',async()=>{
  const requests:RequestInit[]=[];
  const result=await uploadMaterialObject(file,{...options,fetcher:async(url,init)=>{assert.equal(url,endpoint);requests.push(init!);return requests.length===1?signed():Response.json({storagePath:path});},putFile:async()=>{throw new MaterialNetworkError('blocked');}});
  assert.equal(result,path);
  assert.equal(requests.length,2);
  const form=requests[1].body as FormData;
  assert.equal(form.get('storagePath'),path);
  assert.equal(form.get('creatorToken'),'session');
  assert.equal((form.get('file') as File).name,'test.txt');
  assert.equal(new Headers(requests[1].headers).has('Content-Type'),false);
});
test('server configuration errors do not become an internet error or a successful upload',async()=>{
  await assert.rejects(uploadMaterialObject(file,{...options,fetcher:async()=>Response.json({error:'Server misconfiguration'},{status:500}),putFile:async()=>{throw Error('must not upload');}}),/не настроено на сервере/);
});
test('storage rejection or cancellation is not blindly retried',async()=>{
  let calls=0;
  await assert.rejects(uploadMaterialObject(file,{...options,fetcher:async()=>{calls++;return signed();},putFile:async()=>{throw Error('Загрузка файла прервана');}}),/прервана/);
  assert.equal(calls,1);
});
test('files over the bounded relay size do not exhaust the server relay',async()=>{
  let calls=0;
  const large=new File([new Uint8Array(MAX_MATERIAL_PROXY_BYTES+1)],'large.bin');
  await assert.rejects(uploadMaterialObject(large,{...options,fetcher:async()=>{calls++;return signed();},putFile:async()=>{throw new MaterialNetworkError('blocked');}}),/CORS/);
  assert.equal(calls,1);
});
test('failed relay and malformed server paths stay errors',async()=>{
  let calls=0;
  await assert.rejects(uploadMaterialObject(file,{...options,fetcher:async()=>++calls===1?signed():Response.json({error:'Upload failed'},{status:500}),putFile:async()=>{throw new MaterialNetworkError('blocked');}}),/Upload failed/);
  await assert.rejects(uploadMaterialObject(file,{...options,fetcher:async()=>Response.json({uploadUrl:'https://test',storagePath:null})}),/путь/);
});

import { materialRelayKey } from '../../supabase/functions/_shared/materialUploadPolicy.ts';
test('relay rejects another product, teacher prefix and traversal paths', () => {
  assert.equal(materialRelayKey('s3://bucket/product/object.txt','product/'),'product/object.txt');
  assert.equal(materialRelayKey('s3://bucket/other/object.txt','product/'),null);
  assert.equal(materialRelayKey('s3://bucket/product/../other/object.txt','product/'),null);
  assert.equal(materialRelayKey('s3://bucket/teacher-2/product/object.txt','teacher-1/product/'),null);
  assert.equal(materialRelayKey('https://bucket/product/object.txt','product/'),null);
});
