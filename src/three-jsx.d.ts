/* eslint-disable @typescript-eslint/no-explicit-any */
import '@react-three/fiber';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Lights
      ambientLight: any;
      directionalLight: any;
      pointLight: any;
      spotLight: any;
      hemisphereLight: any;
      rectAreaLight: any;
      
      // Objects
      mesh: any;
      group: any;
      primitive: any;
      line: any;
      lineSegments: any;
      points: any;
      sprite: any;
      instancedMesh: any;
      skinnedMesh: any;
      bone: any;
      
      // Geometries
      boxGeometry: any;
      sphereGeometry: any;
      planeGeometry: any;
      cylinderGeometry: any;
      coneGeometry: any;
      torusGeometry: any;
      torusKnotGeometry: any;
      ringGeometry: any;
      circleGeometry: any;
      tubeGeometry: any;
      extrudeGeometry: any;
      shapeGeometry: any;
      bufferGeometry: any;
      
      // Materials
      meshBasicMaterial: any;
      meshStandardMaterial: any;
      meshPhongMaterial: any;
      meshLambertMaterial: any;
      meshToonMaterial: any;
      meshNormalMaterial: any;
      meshMatcapMaterial: any;
      meshDepthMaterial: any;
      meshDistanceMaterial: any;
      meshPhysicalMaterial: any;
      lineBasicMaterial: any;
      lineDashedMaterial: any;
      pointsMaterial: any;
      spriteMaterial: any;
      shaderMaterial: any;
      rawShaderMaterial: any;
      
      // Helpers
      axesHelper: any;
      boxHelper: any;
      gridHelper: any;
      polarGridHelper: any;
      arrowHelper: any;
      cameraHelper: any;
      directionalLightHelper: any;
      hemisphereLightHelper: any;
      pointLightHelper: any;
      spotLightHelper: any;
      skeletonHelper: any;
      
      // Cameras
      perspectiveCamera: any;
      orthographicCamera: any;
      
      // Controls (from drei)
      orbitControls: any;
      
      // Fog
      fog: any;
      fogExp2: any;
      
      // Misc
      color: any;
      scene: any;
    }
  }
}

export {};
