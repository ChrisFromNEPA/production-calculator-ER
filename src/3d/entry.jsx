import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import { Bounds, Center, Grid, OrbitControls, useAnimations, useGLTF, useTexture } from '@react-three/drei';

class WebGLErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return <div className="cmg-3d-fallback" role="status">3D preview unavailable. The calculator and model metadata remain available.</div>;
    }
    return this.props.children;
  }
}

function LoadedModel({ entry, options, reducedMotion }) {
  const { scene, animations } = useGLTF(`models/${entry.file}`);
  const { actions } = useAnimations(animations, scene);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
  }, [invalidate, scene, animations]);
  useEffect(() => {
    scene.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => { material.wireframe = Boolean(options?.wireframe); });
    });
  }, [scene, options?.wireframe]);
  useEffect(() => {
    Object.values(actions).forEach((action) => action.stop());
    const name = options?.animation;
    const detail = { file: entry.file, clip: name || null, state: 'idle' };
    if (!name || reducedMotion || !actions[name]) {
      window.dispatchEvent(new CustomEvent('models:animation', { detail }));
      return undefined;
    }
    const action = actions[name];
    action.reset().fadeIn(0.18).play();
    window.dispatchEvent(new CustomEvent('models:animation', {
      detail: { file: entry.file, clip: name, state: 'playing' },
    }));
    return () => action.fadeOut(0.12).stop();
  }, [actions, entry.file, options?.animation, reducedMotion]);
  return <Center><primitive object={scene} dispose={null} /></Center>;
}

function StudioSkin({ scene, slot, style, url }) {
  const texture = useTexture(url);
  useEffect(() => {
    scene.traverse((node) => {
      if (!node.isMesh || !node.name?.startsWith(slot)) return;
      const match = node.name.match(/^(Torso|Legs)([1-4])$/);
      if (!match) return;
      node.visible = Number(match[2]) === Number(style);
      if (!node.visible) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => { material.map = texture; material.needsUpdate = true; });
    });
  }, [scene, slot, style, texture]);
  return null;
}

function OutfitScene({ outfit }) {
  const { scene } = useGLTF(`models/${outfit.bodyFile}`);
  return <Center>
    <primitive object={scene} dispose={null} />
    {outfit.torso?.file && <StudioSkin scene={scene} slot="Torso" style={outfit.torso.style} url={`models/skins/${outfit.faction}/${outfit.torso.file}`} />}
    {outfit.legs?.file && <StudioSkin scene={scene} slot="Legs" style={outfit.legs.style} url={`models/skins/${outfit.faction}/${outfit.legs.file}`} />}
  </Center>;
}

function SceneContents({ entry, options, mode, outfit }) {
  const controls = useRef();
  useEffect(() => { if (options?.resetToken) controls.current?.reset(); }, [options?.resetToken]);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 5, 4]} intensity={1.1} />
      <directionalLight position={[-4, -2, -3]} color="#88aaff" intensity={0.5} />
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} enablePan autoRotate={Boolean(options?.autoRotate) && !reducedMotion} />
      <Grid args={[6, 24]} position={[0, -1.2, 0]} visible={Boolean(options?.grid)} />
      <React.Suspense fallback={null}>
        <Bounds fit clip observe margin={1.2}>
          {mode === 'studio' && outfit ? <OutfitScene outfit={outfit} /> : entry?.file ? <LoadedModel entry={entry} options={options} reducedMotion={reducedMotion} /> : (
            <mesh>
              <boxGeometry args={[0.8, 0.8, 0.8]} />
              <meshStandardMaterial color="#ff2d95" wireframe />
            </mesh>
          )}
        </Bounds>
      </React.Suspense>
    </>
  );
}

function WorkbenchRoot({ mode, entry, options, outfit }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <WebGLErrorBoundary>
      <div className="cmg-3d-root" data-mode={mode} data-model={entry?.file || ''}>
        <Canvas
          frameloop="demand"
          dpr={[1, 1.75]}
          camera={{ fov: 42, near: 0.1, far: 5000, position: [2.2, 1.4, 2.8] }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))}
        >
          {ready && <SceneContents mode={mode} entry={entry} outfit={outfit} options={options} />}
        </Canvas>
        <div className="cmg-3d-status" role="status">
          {entry?.name || 'Select a model to inspect'}
        </div>
      </div>
    </WebGLErrorBoundary>
  );
}

let root = null;
let container = null;
let current = { mode: 'gallery', entry: null, options: {} };

function render() {
  if (!root) return;
  root.render(<WorkbenchRoot {...current} />);
}

function mount(target, options = {}) {
  if (!target) throw new Error('CMG3D.mount requires a container');
  if (root && container !== target) window.CMG3D.unmount();
  container = target;
  root ||= createRoot(target);
  current = { ...current, ...options };
  render();
  return window.CMG3D;
}

function unmount() {
  root?.unmount();
  root = null;
  container = null;
}

window.CMG3D = {
  mount,
  unmount,
  setMode(mode) { current = { ...current, mode }; render(); },
  loadModel(entry) { current = { ...current, entry }; render(); },
  setViewerOptions(options) { current = { ...current, options: { ...current.options, ...options } }; render(); },
  setOutfit(outfit) { current = { ...current, outfit }; render(); },
  exportCurrent() { return current.entry || null; },
};
