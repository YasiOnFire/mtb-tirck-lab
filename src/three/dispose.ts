import { BufferGeometry, Material, Object3D, Texture } from 'three';

export function disposeTree(root: Object3D) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    const mesh = object as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => materials.add(m));
  });
  for (const m of materials) {
    Object.values(m).forEach((value: unknown) => { if (value instanceof Texture) textures.add(value); });
    m.dispose();
  }
  textures.forEach((t) => t.dispose());
  geometries.forEach((g) => g.dispose());
}
