import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { encodeQR } from '../src/components/checkout/qr.js';
for(const text of ['https://dineflow.example/?tableSession=11111111-1111-1111-1111-111111111111','x'.repeat(120),'x'.repeat(175)]) {
  test(`QR scanner decodes ${text.length}-byte payload`,()=>{
    const {size,modules}=encodeQR(text);const scale=6,width=(size+8)*scale;
    const data=new Uint8ClampedArray(width*width*4).fill(255);
    for(let r=0;r<size;r++)for(let c=0;c<size;c++)if(modules[r][c])for(let y=0;y<scale;y++)for(let x=0;x<scale;x++){
      const offset=(((r+4)*scale+y)*width+(c+4)*scale+x)*4;data[offset]=data[offset+1]=data[offset+2]=0;
    }
    assert.equal(jsQR(data,width,width)?.data,text);
  });
}
