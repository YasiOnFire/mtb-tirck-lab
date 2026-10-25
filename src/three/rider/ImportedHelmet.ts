import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Optional local trial of the user-supplied half-shell helmet.
 * Its GLB is pre-fitted to the existing head group: +X forward, +Y up.
 * It includes its own padding, chin strap, buckle and rivets; it does not
 * include goggles, a visor peak or a protective full-face chin guard.
 */
export class ImportedHelmet {
  readonly root: THREE.Group;
  readonly bounds: THREE.Box3;

  static async load(): Promise<ImportedHelmet> {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/helmet/imported-helmet.glb`);
    return new ImportedHelmet(gltf.scene);
  }

  constructor(scene: THREE.Group) {
    this.root = scene;
    scene.name = 'imported-dirt-jump-helmet';
    scene.userData.helmetType = 'half-shell';
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.bounds = new THREE.Box3().setFromObject(scene);
  }
}
