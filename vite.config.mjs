import { defineConfig, loadEnv, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export default defineConfig(({mode}) => {
  const env=loadEnv(mode,process.cwd(),'');
  // Secrets are server-only. Never spread the environment into Vite's define.
  for(const [key,value] of Object.entries(env)) if(process.env[key]===undefined)process.env[key]=value;
  const routes=new Set(['assistant','payment','recommendations','sales-insight','maya','maya-webhook']);
  return {
    plugins:[
      {name:'existing-jsx-files',enforce:'pre',async transform(code,id){if(/\/src\/.*\.js$/.test(id.replaceAll('\\','/')))return transformWithEsbuild(code,id,{loader:'jsx',jsx:'automatic'});}},
      react(),tailwindcss(),
      {name:'local-serverless-api',configureServer(server){server.middlewares.use(async(req,res,next)=>{
        if(!req.url?.startsWith('/api/'))return next();
        const name=req.url.split('?')[0].slice(5);
        if(!routes.has(name)){res.statusCode=404;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Endpoint not found.'}));return;}
        res.status=code=>{res.statusCode=code;return res;};
        res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
        try{
          let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>50000){res.status(413).json({error:'Request too large.'});return;}}
          req.body=body?JSON.parse(body):{};
          const {default:handler}=await import(pathToFileURL(resolve('api',`${name}.js`)).href);
          await handler(req,res);
        }catch(error){res.status(500).json({error:'The local API could not complete the request.'});console.error('[local-api]',error.message);}
      });}},
    ],
    define:{
      'process.env.REACT_APP_SUPABASE_URL':JSON.stringify(env.REACT_APP_SUPABASE_URL||''),
      'process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY':JSON.stringify(env.REACT_APP_SUPABASE_PUBLISHABLE_KEY||''),
      'process.env.REACT_APP_SUPABASE_ANON_KEY':JSON.stringify(env.REACT_APP_SUPABASE_ANON_KEY||''),
      'process.env.REACT_APP_API_URL':JSON.stringify(env.REACT_APP_API_URL||''),
    },
    optimizeDeps:{esbuildOptions:{loader:{'.js':'jsx'}}},
    build:{outDir:'dist'},server:{port:5173},
  };
});
