import * as THREE from 'three';
import type { SceneKind } from '../../types';
import { heightAt, ROCKS } from '../tricks/terrain';
import { disposeTree } from '../dispose';

function groundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(512, 512);
  let seed = 47122;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    const n = (seed / 4294967296 - .5) * 46;
    const x = (i / 4) % 512, y = Math.floor(i / 2048);
    const strata = Math.sin(x * .07 + Math.cos(y * .02) * 3) * 5 + Math.sin(y * .11) * 3;
    pixels.data[i] = 111 + n + strata;
    pixels.data[i + 1] = 92 + n + strata;
    pixels.data[i + 2] = 76 + n + strata;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  ctx.globalAlpha = .11;
  ctx.strokeStyle = '#2b211d';
  ctx.lineWidth = 3;
  for (const x of [160, 187, 310, 337]) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 14, 180, x - 8, 280, x, 512); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Studio {
  readonly root = new THREE.Group();
  private obstacle = new THREE.Group();
  private kind?: SceneKind;
  private wallMaterials: THREE.MeshStandardMaterial[] = [];
  private floor: THREE.Mesh;

  constructor() {
    const floorTexture = groundTexture(); floorTexture.repeat.set(90, 90);
    const floor = this.floor = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.MeshStandardMaterial({ color: 0x514850, map: floorTexture, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.19;
    floor.receiveShadow = true;
    this.root.add(floor, this.obstacle);
    const pebbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x5f554e, roughness: 1, flatShading: true }), 90);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 90; i++) {
      const x = Math.sin(i * 34.735) * 8;
      const z = (i % 2 ? 1 : -1) * (2.15 + Math.abs(Math.sin(i * 2.713)) * 3.5);
      const scale = .025 + Math.abs(Math.sin(i * 1.719)) * .09;
      dummy.position.set(x, -.17 + scale * .35, z);
      dummy.rotation.set(i * .4, i * 2.1, i * .21);
      dummy.scale.set(scale * 1.3, scale * .6, scale);
      dummy.updateMatrix(); pebbles.setMatrixAt(i, dummy.matrix);
    }
    pebbles.receiveShadow = true;
    this.root.add(pebbles);
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(70, 10, 48, 4), new THREE.MeshStandardMaterial({ color: 0x211e25, roughness: 1, side: THREE.DoubleSide }));
    const pos = backdrop.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      pos.setXYZ(i, x, y < 0 ? -.3 : 1.3 + Math.sin(x * .23) * .5 + Math.sin(x * .57) * .3, -15 - Math.cos(x * .2));
    }
    backdrop.geometry.computeVertexNormals();
    this.root.add(backdrop);
  }

  setScene(kind: SceneKind) {
    if (this.kind === kind) return;
    this.kind = kind;
    this.wallMaterials = [];
    this.floor.position.y = kind === 'gap' ? -.5 : -.19;
    disposeTree(this.obstacle);
    this.root.remove(this.obstacle);
    this.obstacle = new THREE.Group();
    this.root.add(this.obstacle);
    const dirt = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: .96, color: 0xc2aca0, vertexColors: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x19171e, roughness: .9 });
    const purple = new THREE.MeshStandardMaterial({ color: 0x5918df, roughness: .7 });
    const length = 16, width = kind === 'berm' ? 8 : 4.2;
    const nx = 320, nz = kind === 'berm' || kind === 'rocks' ? 64 : 12;
    const geometry = new THREE.PlaneGeometry(length, width, nx, nz);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i);
      const edge = THREE.MathUtils.smoothstep(Math.abs(z), width / 2 - .45, width / 2);
      const terrain = kind === 'rocks' ? 0 : heightAt(kind, x, z);
      position.setY(i, THREE.MathUtils.lerp(terrain, -.185, edge));
      const shade = THREE.MathUtils.lerp(1, .55, edge);
      colors.set([shade, shade, shade], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const surface = new THREE.Mesh(geometry, dirt);
    surface.receiveShadow = true;
    surface.castShadow = true;
    this.obstacle.add(surface);
    if (kind === 'rocks') {
      const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x66605b, roughness: 1, flatShading: true });
      for (const rock of ROCKS) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), rockMaterial);
        mesh.position.set(rock.x, 0, rock.z);
        mesh.scale.set(rock.radius, rock.height, rock.radius);
        mesh.receiveShadow = mesh.castShadow = true;
        this.obstacle.add(mesh);
      }
    }

    if (kind === 'wall') {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.1, .16), dark);
      this.wallMaterials.push(dark);
      wall.position.set(0, 1.05, 1.73);
      wall.castShadow = wall.receiveShadow = true;
      this.obstacle.add(wall);
      for (let i = 0; i < 12; i++) {
        const material = new THREE.MeshStandardMaterial({ color: 0x49404c });
        this.wallMaterials.push(material);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(.008, 2.08, .004), material);
        panel.position.set(-2.2 + .4 * i, 1.05, 1.647);
        this.obstacle.add(panel);
      }
      const line = new THREE.Mesh(new THREE.BoxGeometry(4.8, .035, .005), purple);
      line.position.set(0, 1.24, 1.64);
      this.wallMaterials.push(purple);
      this.obstacle.add(line);
    }
    if (kind === 'ledge') {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.6, .025, .025), purple);
      stripe.position.set(0, heightAt(kind, 0) + .013, .55);
      this.obstacle.add(stripe);
    }
  }

  update(cameraPosition: THREE.Vector3) {
    const behind = cameraPosition.z > 1.65;
    this.wallMaterials.forEach((material) => {
      const transparent = behind;
      if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
      material.opacity = behind ? .12 : 1;
      material.depthWrite = !behind;
    });
  }

  dispose() { disposeTree(this.root); }
}
