import { registerHooks } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
// Optional in-process test loader for environments that prohibit child workers.
// Uses the installed TypeScript compiler, no esbuild subprocess or network.
const root = fileURLToPath(new URL('../', import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    let p = specifier.startsWith('@/') ? path.join(root,'src',specifier.slice(2))
      : specifier.startsWith('.') && context.parentURL?.startsWith('file:') ? path.resolve(path.dirname(fileURLToPath(context.parentURL)),specifier) : null;
    if(p) for(const candidate of [p,p+'.ts',p+'.tsx',path.join(p,'index.ts')]) {
      if(fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return { url:pathToFileURL(candidate).href,shortCircuit:true };
    }
    return next(specifier,context);
  },
  load(url,context,next) {
    if(url.startsWith('file:') && /\.tsx?$/.test(url) && !url.includes('/node_modules/')) {
      const source=fs.readFileSync(fileURLToPath(url),'utf8');
      const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}});
      return {format:'module',source:output.outputText,shortCircuit:true};
    }
    if(url.endsWith('/document-export.schema.json')) return {format:'module',source:'export default '+fs.readFileSync(fileURLToPath(url),'utf8'),shortCircuit:true};
    return next(url,context);
  },
});
