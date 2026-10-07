import {readFile,writeFile,mkdir} from 'node:fs/promises';
await mkdir('output',{recursive:true});
const [html,css,model,example,app]=await Promise.all(['index.html','styles.css','model.mjs','example.mjs','app.mjs'].map(path=>readFile(path,'utf8')));
const code=[model.replace(/^export /gm,''),example.replace(/^export /gm,''),app.replace(/^import .*;\n/gm,'')].join('\n').replace(/<\/script/gi,'<\\/script');
const standalone=html.replace('<link rel="stylesheet" href="./styles.css">',`<style>${css}</style>`).replace('<script type="module" src="./app.mjs"></script>',`<script type="module">${code}</script>`);
await writeFile('output/Scheda-Pokemon.html',standalone);
console.log('Created output/Scheda-Pokemon.html');
