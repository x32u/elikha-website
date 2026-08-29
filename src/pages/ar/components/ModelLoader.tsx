// @ts-nocheck
/// <reference path="../../../three-jsx.d.ts" />
import { useEffect, useState, useRef } from 'react';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { getCustomArModelBlob } from '../../../utils/activityArConfig';

interface ModelLoaderProps {
  url: string;
  fileType?: string;
  position?: [number, number, number];
  scale?: number;
  onLoad?: (model: THREE.Group) => void;
  onError?: (message: string) => void;
}

const DEFAULT_MODEL_COLOR = new THREE.Color(0xffffff);

const createWhiteModelMaterial = (sourceMaterial?: THREE.Material | null) => {
  const source: any = sourceMaterial || {};
  const opacity = typeof source.opacity === 'number' ? source.opacity : 1;

  return new THREE.MeshStandardMaterial({
    color: DEFAULT_MODEL_COLOR.clone(),
    roughness: typeof source.roughness === 'number' ? source.roughness : 0.62,
    metalness: typeof source.metalness === 'number' ? source.metalness : 0.04,
    transparent: Boolean(source.transparent) || opacity < 1,
    opacity,
    alphaTest: typeof source.alphaTest === 'number' ? source.alphaTest : 0,
    side: THREE.DoubleSide,
  });
};

const resolveModelUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  if (
    raw.startsWith('/') ||
    raw.startsWith('data:') ||
    raw.startsWith('idb://') ||
    raw.startsWith('blob:') ||
    /^https?:\/\//i.test(raw)
  ) {
    return raw;
  }

  if (raw.startsWith('models/')) {
    return `/${raw}`;
  }

  return `/models/${raw}`;
};

export function ModelLoader({
  url,
  fileType,
  position = [0, 0, -2],
  scale = 1,
  onLoad,
  onError,
}: ModelLoaderProps) {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setError(false);
    setModel(null);
    const normalizedUrl = resolveModelUrl(url);
    const normalizedFileType = String(fileType || '')
      .trim()
      .toLowerCase();
    const lowerUrl = String(normalizedUrl || '').toLowerCase();
    const inferredFileType = lowerUrl.includes('.3ds')
      ? '3ds'
      : (lowerUrl.includes('.gltf') || lowerUrl.includes('.glb'))
        ? (lowerUrl.includes('.glb') ? 'glb' : 'gltf')
        : 'obj';
    const resolvedFileType = normalizedFileType || inferredFileType;
    const isThreeDS = resolvedFileType === '3ds';
    const isGltf = resolvedFileType === 'gltf' || resolvedFileType === 'glb';
    const loader = isGltf ? new GLTFLoader() : (isThreeDS ? new TDSLoader() : new OBJLoader());
    const isDataUrl = lowerUrl.startsWith('data:');
    const failModelLoad = (message: string, cause?: unknown) => {
      if (cancelled) return;
      if (cause) console.error(message, cause);
      setModel(null);
      setError(true);
      onError?.(message);
    };

    console.log(
      `ModelLoader: Starting to load model from: ${normalizedUrl} (${resolvedFileType}, attempt ${retryCount + 1})`
    );

    // Extract directory path for textures
    const slashIndex = normalizedUrl.lastIndexOf('/');
    const resourcePath = slashIndex >= 0 ? normalizedUrl.substring(0, slashIndex + 1) : '';
    if (!isDataUrl && !isGltf && 'setResourcePath' in loader) {
      (loader as TDSLoader).setResourcePath(resourcePath);
    }

    const loadModel = async () => {
      let resolvedUrl = normalizedUrl;

      if (normalizedUrl.startsWith('idb://')) {
        const blob = await getCustomArModelBlob(normalizedUrl);
        if (!blob) {
          failModelLoad('The saved 3D model file is no longer available on this device.');
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        resolvedUrl = objectUrl;
      }

      const requestBaseUrl =
        isDataUrl || resolvedUrl.startsWith('blob:')
          ? resolvedUrl
          : encodeURI(resolvedUrl);
      const requestUrl =
        retryCount === 0 || isDataUrl || resolvedUrl.startsWith('blob:')
          ? requestBaseUrl
          : `${requestBaseUrl}${requestBaseUrl.includes('?') ? '&' : '?'}retry=${retryCount}`;

      (loader as any).load(
        requestUrl,
        (loaded: any) => {
          if (cancelled) return;
          const object = isGltf ? loaded?.scene : loaded;
          if (!object) {
            failModelLoad('The 3D model file loaded without a usable scene.');
            return;
          }
          console.log('ModelLoader: model parsed, processing...');
          console.log('ModelLoader: Children count:', object.children.length);
          
          // Normalize model scale and center
          const box = new THREE.Box3().setFromObject(object);
          const size = box.getSize(new THREE.Vector3());
          console.log('ModelLoader: Bounding box size:', size);
          
          const maxDim = Math.max(size.x, size.y, size.z);
          const normalizedScale = maxDim > 0 ? 1 / maxDim : 1;

          object.scale.setScalar(normalizedScale * scale);

          // Center the model
          const center = box.getCenter(new THREE.Vector3());
          object.position.sub(center.multiplyScalar(normalizedScale * scale));

          // Count meshes
          let meshCount = 0;
          
          // Start every model as a white paintable surface, regardless of source colors/textures.
          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              meshCount++;
              if (!child.material) {
                child.material = createWhiteModelMaterial();
              } else if (Array.isArray(child.material)) {
                child.material = child.material.map((material) => createWhiteModelMaterial(material));
              } else {
                child.material = createWhiteModelMaterial(child.material);
              }

              // Shadows are disabled in AR mode to keep paint interaction responsive.
              child.castShadow = false;
              child.receiveShadow = false;
            }
          });

          if (meshCount === 0) {
            failModelLoad('The 3D model does not contain any renderable mesh.');
            return;
          }
          
          console.log('ModelLoader: Applied material to', meshCount, 'meshes');
          console.log('ModelLoader: Final scale:', object.scale.x);
          console.log('ModelLoader: Model loaded successfully!');

          setModel(object);
          setError(false);
          setRetryCount(0);
          onLoad?.(object);
        },
        (progress) => {
          if (progress.total > 0) {
            console.log(`ModelLoader: Loading ${(progress.loaded / progress.total) * 100}%`);
          }
        },
        (err) => {
          if (cancelled) return;
          console.error(`ModelLoader: Error loading model: ${requestUrl}`, err);
          if (retryCount < MAX_RETRIES) {
            console.warn(`ModelLoader: retrying load (${retryCount + 1}/${MAX_RETRIES})`);
            setRetryCount((prev) => prev + 1);
            return;
          }
          failModelLoad('The 3D model could not be downloaded or parsed after several attempts.', err);
        }
      );
    };

    void loadModel().catch((loadError) => {
      failModelLoad('The 3D model could not be prepared for AR.', loadError);
    });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url, fileType, scale, onLoad, onError, retryCount]);

  // Do not replace a failed graded model with a plausible fake object. The
  // parent AR screen displays a blocking, user-visible error instead.
  if (error) {
    return null;
  }

  if (!model) {
    // Loading state - show a small sphere
    return (
      <mesh position={position}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshBasicMaterial color="#888888" wireframe />
      </mesh>
    );
  }

  return (
    <primitive object={model} position={position} />
  );
}

/**
 * Fallback placeholder when no model is available
 */
export function PlaceholderModel({
  position = [0, 0, -2],
  onLoad,
}: {
  position?: [number, number, number];
  onLoad?: (model: THREE.Group) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (groupRef.current && onLoad) {
      onLoad(groupRef.current);
    }
  }, [onLoad]);

  return (
    <group ref={groupRef} position={position}>
      <mesh>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#ffffff" roughness={0.62} metalness={0.04} />
      </mesh>
    </group>
  );
}
