import {mkdir,copyFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
const target = process.argv[2] || 'dist';
await rm(target,{recursive:true,force:true});
await mkdir(join(target,'.openai'),{recursive:true});
for (const file of ['index.html','styles.css','app.mjs','model.mjs','example.mjs']) await copyFile(file,join(target,file));
await copyFile('.openai/hosting.json',join(target,'.openai/hosting.json'));
console.log(`Built ${target}`);
