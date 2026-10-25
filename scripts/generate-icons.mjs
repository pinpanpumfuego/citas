import fs from 'node:fs/promises';
import sharp from 'sharp';
// Vector artwork, no fonts: reproducible on Windows and Linux.
const crown='<path d="M156 147l49 29 51-60 51 60 49-29-19 65H175z" fill="url(#gold)"/><path d="M179 229h154" stroke="url(#gold)" stroke-width="12" stroke-linecap="round"/>';
const monogram='<path d="M165 264h28v106h63v27h-91zM278 264h44c39 0 57 18 57 49s-20 49-58 49h-15v35h-28zm28 26v46h16c20 0 29-7 29-23s-9-23-29-23z" fill="url(#gold)"/>';
function svg(small=false,badge=false){return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0ba"/><stop offset=".5" stop-color="#e6b959"/><stop offset="1" stop-color="#bb7e2c"/></linearGradient><radialGradient id="bg"><stop stop-color="#3c111b"/><stop offset="1" stop-color="#140e10"/></radialGradient></defs>${badge?'':'<rect width="512" height="512" fill="url(#bg)"/>'}${small?`<g transform="translate(-77 -32) scale(1.3)">${crown}</g><path d="M132 356q124-90 248 0" fill="none" stroke="url(#gold)" stroke-width="27" stroke-linecap="round"/>`:crown+monogram}</svg>`;}
await fs.mkdir('public/icons',{recursive:true});await fs.writeFile('public/icon.svg',svg());await fs.writeFile('public/favicon.svg',svg(true));
for(const size of [192,512]){const png=await sharp(Buffer.from(svg())).resize(size,size).png().toBuffer();await fs.writeFile(`public/icon-${size}.png`,png);await fs.writeFile(`public/icons/icon-maskable-${size}.png`,png);}
await sharp(Buffer.from(svg())).resize(180,180).png().toFile('public/apple-touch-icon.png');
await sharp(Buffer.from(svg(true))).resize(16,16).png().toFile('public/favicon-16x16.png');
await sharp(Buffer.from(svg(true))).resize(32,32).png().toFile('public/favicon-32x32.png');
await sharp(Buffer.from(svg(true,true))).resize(96,96).threshold(1).png().toFile('public/icons/badge-96.png');
// ICO directory with PNG entries (16, 32, 48, 256 pixels).
const sizes=[16,32,48,256],images=await Promise.all(sizes.map(n=>sharp(Buffer.from(svg(true))).resize(n,n).png().toBuffer()));
const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
sizes.forEach((size,i)=>{const p=6+i*16;header[p]=size===256?0:size;header[p+1]=size===256?0:size;header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(images[i].length,p+8);header.writeUInt32LE(offset,p+12);offset+=images[i].length;});await fs.writeFile('public/favicon.ico',Buffer.concat([header,...images]));
console.log('Generated SVG, ICO, PWA, Apple and notification icons');
