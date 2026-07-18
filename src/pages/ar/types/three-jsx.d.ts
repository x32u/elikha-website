import '@react-three/fiber';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      primitive: any;
      mesh: any;
      boxGeometry: any;
      meshStandardMaterial: any;
      meshBasicMaterial: any;
      ambientLight: any;
      hemisphereLight: any;
      directionalLight: any;
      pointLight: any;
      group: any;
      sphereGeometry: any;
      cylinderGeometry: any;
    }
  }
}

export {};
