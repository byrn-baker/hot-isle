import * as THREE from 'three';

export const COOL_AIR_COLOR = '#289dff';
export const HOT_AIR_COLOR = '#ff384b';

/** A filled, outlined arrow pointing along local +Z, readable from either camera. */
export function createFlowArrow(color: THREE.ColorRepresentation, length = 0.8, width = 0.34) {
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.22, -length / 2);
  shape.lineTo(width * 0.22, -length / 2);
  shape.lineTo(width * 0.22, length * 0.06);
  shape.lineTo(width / 2, length * 0.06);
  shape.lineTo(0, length / 2);
  shape.lineTo(-width / 2, length * 0.06);
  shape.lineTo(-width * 0.22, length * 0.06);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);
  const group = new THREE.Group();
  const outline = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#07121f', side: THREE.DoubleSide, toneMapped: false }));
  outline.scale.set(1.3, 1, 1.14);
  const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false }));
  fill.position.y = 0.008;
  // Markers must never enlarge an equipment's mouse-selection target.
  outline.userData.presentationOnly = fill.userData.presentationOnly = true;
  group.add(outline, fill);
  return { group, fill };
}
