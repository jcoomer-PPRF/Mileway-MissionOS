import assert from 'node:assert/strict';import {readFile,readdir,access} from 'node:fs/promises';
async function js(dir){return(await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?js(dir+'/'+e.name):e.name.endsWith('.js')?readFile(dir+'/'+e.name,'utf8'):''))).join('\n');}
const staging=await js('dist-md02-staging');for(const marker of ['/api/md02/','MD02 hosted staging','isolated Supabase staging'])assert(staging.includes(marker));for(const marker of ['supabase.co','bgvhqsfpjanmqixtmdtl','access_token','refresh_token','service_role','sb_secret_'])assert(!staging.includes(marker),marker);
for(const dir of ['dist','dist-md01'])await assert.rejects(access(dir+'/md02-staging.html'));
const html=await readFile('dist-md02-staging/md02-staging.html','utf8');assert(html.includes('Content-Security-Policy')&&html.includes('connect-src'));console.log('Staging build isolated: correct entry point, same-origin API, no hosted credentials or Auth tokens in client.');
