import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../artifacts/import-character');
const TRIM = process.argv.includes('--trim');
globalThis.window = { innerWidth:800, innerHeight:800 };
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result=result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result=`data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.(); }); }
};
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
const warnings=[];const nativeWarn=console.warn;console.warn=(...args)=>{warnings.push(args.map(String).join(' '));nativeWarn(...args);};
const fbx=fs.readFileSync(path.join(DIR,'source/Realistic Male 3D Character Model Rig.Fbx'));
const root=new FBXLoader().parse(fbx.buffer.slice(fbx.byteOffset,fbx.byteOffset+fbx.byteLength),'');
root.name='supplied-realistic-character';root.scale.setScalar(.01);root.animations=[];root.updateMatrixWorld(true);
const boneData=[];root.traverse(o=>{if(o.isBone)boneData.push({name:o.name,parent:o.parent?.name,position:o.getWorldPosition(new THREE.Vector3()).toArray(),quaternion:o.getWorldQuaternion(new THREE.Quaternion()).toArray()});});
fs.writeFileSync(path.join(DIR,'bind-joints-meters.json'),JSON.stringify({height:1.8006035425399205,forward:'+Z',up:'+Y',rootScale:.01,bones:boneData},null,2));
await MeshoptSimplifier.ready;
function trimExtremities(geometry, worldMatrix) {
  const source=geometry.toNonIndexed(), attrs=Object.entries(source.attributes), output=Object.fromEntries(attrs.map(([name])=>[name,[]]));
  const vertex=(i)=>Object.fromEntries(attrs.map(([name,a])=>[name,Array.from(a.array.slice(i*a.itemSize,(i+1)*a.itemSize))]));
  const interpolate=(a,b,t)=>{
    const result={};for(const [name] of attrs)if(name!=='skinIndex'&&name!=='skinWeight')result[name]=a[name].map((v,i)=>v+(b[name][i]-v)*t);
    const influences=new Map();for(const [v,f]of[[a,1-t],[b,t]])for(let i=0;i<4;i++)influences.set(v.skinIndex[i],(influences.get(v.skinIndex[i])??0)+v.skinWeight[i]*f);
    const sorted=[...influences].sort((x,y)=>y[1]-x[1]).slice(0,4);while(sorted.length<4)sorted.push([0,0]);const sum=sorted.reduce((s,v)=>s+v[1],0);
    result.skinIndex=sorted.map(v=>v[0]);result.skinWeight=sorted.map(v=>v[1]/sum);return result;
  };
  const position=v=>new THREE.Vector3(...v.position).applyMatrix4(worldMatrix);
  // Keep a short ankle cuff below the ankle joint (Y~.120m), so the existing
  // flat-pedal shoes can overlap it. Cutting at the top of the boot would leave
  // an 8cm gap above those low shoes. The original foot/toes/soles are removed.
  const planes=[v=>.625-position(v).x,v=>.625+position(v).x,v=>position(v).y-.115];
  for(let i=0;i<source.attributes.position.count;i+=3){
    let polygon=[vertex(i),vertex(i+1),vertex(i+2)];
    for(const plane of planes){const clipped=[];for(let j=0;j<polygon.length;j++){const a=polygon[j],b=polygon[(j+1)%polygon.length],da=plane(a),db=plane(b);if(da>=0)clipped.push(a);if((da>=0)!==(db>=0))clipped.push(interpolate(a,b,da/(da-db)));}polygon=clipped;}
    for(let j=1;j+1<polygon.length;j++)for(const v of[polygon[0],polygon[j],polygon[j+1]])for(const [name] of attrs)output[name].push(...v[name]);
  }
  const result=new THREE.BufferGeometry();for(const [name,a]of attrs)result.setAttribute(name,new THREE.BufferAttribute(new a.array.constructor(output[name]),a.itemSize,a.normalized));
  return mergeVertices(result,1e-5);
}
const summary=[];
root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const originalTriangles=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
  mesh.geometry.morphAttributes={};mesh.morphTargetDictionary={};mesh.morphTargetInfluences=[];
  let geometry=mergeVertices(mesh.geometry,1e-5);
  const beforeVertices=geometry.attributes.position.count;
  const normal=geometry.attributes.normal,uv=geometry.attributes.uv;
  const values=new Float32Array(beforeVertices*5);
  for(let i=0;i<beforeVertices;i++){values.set([normal.getX(i),normal.getY(i),normal.getZ(i),uv.getX(i),uv.getY(i)],i*5);}
  const [indices,error]=MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(geometry.index.array),geometry.attributes.position.array,3,values,5,[.1,.1,.1,1,1],null,50000*3,.015,['Regularize','Permissive']);
  const [remap,vertexCount]=MeshoptSimplifier.compactMesh(indices);
  const compact=new THREE.BufferGeometry();
  for(const [name,attribute] of Object.entries(geometry.attributes)){
    const array=new attribute.array.constructor(vertexCount*attribute.itemSize);
    for(let old=0;old<remap.length;old++){const next=remap[old];if(next>=vertexCount)continue;for(let c=0;c<attribute.itemSize;c++)array[next*attribute.itemSize+c]=attribute.array[old*attribute.itemSize+c];}
    compact.setAttribute(name,new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized));
  }
  compact.setIndex(new THREE.BufferAttribute(vertexCount<65536?new Uint16Array(indices):indices,1));
  compact.computeBoundingBox();compact.computeBoundingSphere();
  mesh.geometry=TRIM?trimExtremities(compact,mesh.matrixWorld):compact;mesh.normalizeSkinWeights();
  mesh.material=new THREE.MeshStandardMaterial({name:'Supplied_character_clothing',color:0xffffff,roughness:.86,metalness:0,side:THREE.DoubleSide});
  summary.push({mesh:mesh.name,originalTriangles,mergedVertices:beforeVertices,triangles:mesh.geometry.index.count/3,vertices:mesh.geometry.attributes.position.count,relativeSimplificationError:error,skinJoints:mesh.skeleton?.bones.length});
});
const raw=Buffer.from(await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:false,animations:[],trs:true}));
const jsonLength=raw.readUInt32LE(12),document=JSON.parse(raw.subarray(20,20+jsonLength).toString());
const binaryStart=20+jsonLength+8,oldBinary=raw.subarray(binaryStart);
const parts=[oldBinary];let byteLength=oldBinary.length;
document.images=[];document.textures=[];document.samplers=[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}];
for(const name of ['diffuse','normal']){
  const texture=fs.readFileSync(path.join(DIR,`${name}-2k.jpg`));
  const offset=byteLength;const padded=Buffer.alloc(Math.ceil(texture.length/4)*4);texture.copy(padded);parts.push(padded);byteLength+=padded.length;
  const view=document.bufferViews.push({buffer:0,byteOffset:offset,byteLength:texture.length})-1;
  document.images.push({bufferView:view,mimeType:'image/jpeg',name:`${name}-2k`});document.textures.push({sampler:0,source:document.images.length-1});
}
for(const material of document.materials){material.pbrMetallicRoughness.baseColorTexture={index:0};material.normalTexture={index:1,scale:.8};}
document.buffers[0].byteLength=byteLength;
document.asset.extras={source:'User-supplied Realistic+Male+3D+Character+Model.zip',sourceUrl:'https://www.cgtrader.com/free-3d-models/character/man/realistic-male-3d-character-model-casual-outfit',author:'BeastStyle-3D',modelId:7658841,license:'Royalty Free License (no AI)',licenseEvidence:'Primary CGTrader listing read on 2026-10-25; no separate license or author-credit document in the supplied archive',conversion:'Three FBXLoader, meshoptimizer attribute-aware simplification, retained weighted rig, 2K texture derivatives'};
const json=Buffer.from(JSON.stringify(document));const paddedJson=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(paddedJson);
const binary=Buffer.concat(parts);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+paddedJson.length+8+binary.length,8);header.writeUInt32LE(paddedJson.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binaryHeader=Buffer.alloc(8);binaryHeader.writeUInt32LE(binary.length,0);binaryHeader.writeUInt32LE(0x004e4942,4);
const output=Buffer.concat([header,paddedJson,binaryHeader,binary]);fs.writeFileSync(path.join(DIR,TRIM?'candidate-character-trimmed.glb':'candidate-character.glb'),output);
fs.writeFileSync(path.join(DIR,TRIM?'conversion-report-trimmed.json':'conversion-report.json'),JSON.stringify({outputBytes:output.length,meshes:summary,warnings,removed:['One morph target','Zero-duration T-pose animation',...(TRIM?['Hands/fingers beyond wrist plane ±.625m','Foot/toe/boot lower faces belowY.115m; ankle cuff retained']:[])],textures:'2 x JPEG 2048x2048; vertically flipped to preserve original FBX mapping'},null,2));
console.log(JSON.stringify({outputBytes:output.length,meshes:summary},null,2));
