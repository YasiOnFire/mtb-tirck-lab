import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(project,'artifacts/import-character/source/Realistic Male 3D Character Model Rig.Fbx');
if(!fs.existsSync(source))throw new Error('Extract the user-supplied Realistic+Male+3D+Character+Model.zip into artifacts/import-character/source first. Preserve all archive paths.');
execFileSync(process.env.PYTHON??'python',['scripts/models/prepare-textures.py'],{cwd:project,stdio:'inherit'});
execFileSync(process.execPath,['scripts/models/convert-character.mjs','--trim'],{cwd:project,stdio:'inherit'});
const target=path.join(project,'public/assets/rider/imported-rider.glb');
fs.copyFileSync(path.join(project,'artifacts/import-character/candidate-character-trimmed.glb'),target);
console.log(`Prepared ${target} (${fs.statSync(target).size} bytes). This copies a local trial asset; it does not publish it.`);
