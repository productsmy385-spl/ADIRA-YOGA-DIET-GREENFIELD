"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import { Group, MathUtils, Mesh } from "three";
import { EMERALD, FOREST, JADE, LIGHT, CHAMPAGNE } from "./palette";

/**
 * 3D Interactive Hero Canvas for Adira Wellness.
 *
 * Rendered behind dynamic import with `ssr: false` in `src/app/(landing)/hero-3d-scene.tsx`.
 *
 * Features:
 * - Meditating yoga figure with slow, natural breathing rhythm
 * - Glowing chakra points along the subtle spinal axis
 * - Mouse parallax interaction: responds smoothly to cursor movements
 * - Ambient floating wellness particles and light rays
 */

interface HeroSceneProps {
  paused?: boolean;
}

// Pure deterministic pseudo-random helper to avoid calling impure Math.random during render
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function FloatingBotanicalParticles({ paused }: { paused?: boolean }) {
  const count = 28;
  const meshRef = useRef<Group>(null);

  // Generate deterministic floating positions without impure Math.random
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const rand1 = pseudoRandom(i * 1.1 + 1);
      const rand2 = pseudoRandom(i * 2.3 + 2);
      const rand3 = pseudoRandom(i * 3.7 + 3);
      const rand4 = pseudoRandom(i * 4.9 + 4);
      const rand5 = pseudoRandom(i * 5.3 + 5);

      const radius = 1.2 + rand1 * 2.2;
      const angle = (i / count) * Math.PI * 2 + rand2 * 0.5;
      const x = Math.cos(angle) * radius;
      const y = (rand3 - 0.5) * 2.8;
      const z = Math.sin(angle) * radius - 0.5;
      const scale = 0.03 + rand4 * 0.05;
      const speed = 0.2 + rand5 * 0.3;
      temp.push({ x, y, z, scale, speed, initialY: y });
    }
    return temp;
  }, [count]);

  useFrame((state, delta) => {
    if (paused || !meshRef.current) return;
    const time = state.clock.getElapsedTime();
    meshRef.current.children.forEach((child, i) => {
      const p = particles[i];
      if (p && child) {
        child.position.y = p.initialY + Math.sin(time * p.speed + i) * 0.15;
        child.rotation.x += delta * 0.1 * p.speed;
        child.rotation.y += delta * 0.2 * p.speed;
      }
    });
  });

  return (
    <group ref={meshRef}>
      {particles.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]} scale={[p.scale, p.scale * 1.5, p.scale]}>
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? JADE : i % 3 === 1 ? EMERALD : CHAMPAGNE}
            roughness={0.4}
            metalness={0.1}
            transparent
            opacity={0.7}
          />
        </mesh>
      ))}
    </group>
  );
}

function GlowingChakraPoints() {
  const chakras = useMemo(
    () => [
      { y: 0.1, color: 0xe05638 }, // Root (Muladhara)
      { y: 0.35, color: 0xe58e38 }, // Sacral (Svadhisthana)
      { y: 0.6, color: 0xebc934 }, // Solar Plexus (Manipura)
      { y: 0.85, color: 0x3cb067 }, // Heart (Anahata)
      { y: 1.1, color: 0x389ce0 }, // Throat (Vishuddha)
      { y: 1.35, color: 0x5b4ce0 }, // Third Eye (Ajna)
      { y: 1.6, color: 0x9b4ce0 }, // Crown (Sahasrara)
    ],
    []
  );

  return (
    <group position={[0, 0, 0.05]}>
      {chakras.map((c, i) => (
        <mesh key={i} position={[0, c.y, 0]}>
          <sphereGeometry args={[0.032, 16, 16]} />
          <meshBasicMaterial color={c.color} transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function MeditatingYogaSubject({ paused }: { paused?: boolean }) {
  const group = useRef<Group>(null);
  const headRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (paused || !group.current) return;
    const t = state.clock.getElapsedTime();

    // Natural 4-second breathing cycle (subtle scale change)
    const breath = Math.sin(t * 1.5) * 0.02;
    group.current.position.y = breath;

    // Mouse Parallax Interaction: lerp rotation to pointer
    const targetX = state.pointer.y * 0.12;
    const targetY = state.pointer.x * 0.22;

    group.current.rotation.x = MathUtils.lerp(group.current.rotation.x, targetX, 0.05);
    group.current.rotation.y = MathUtils.lerp(group.current.rotation.y, targetY, 0.05);
  });

  return (
    <group ref={group} position={[0, -0.65, 0]}>
      {/* Head */}
      <mesh ref={headRef} position={[0, 1.65, 0]}>
        <sphereGeometry args={[0.22, 32, 32]} />
        <meshStandardMaterial color={JADE} roughness={0.4} metalness={0.15} />
      </mesh>

      {/* Torso & Shoulders */}
      <mesh position={[0, 0.95, 0]}>
        <capsuleGeometry args={[0.26, 0.65, 8, 24]} />
        <meshStandardMaterial color={EMERALD} roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Cross-legged Seated Base (Torus) */}
      <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.65, 0.18, 16, 48]} />
        <meshStandardMaterial color={FOREST} roughness={0.6} />
      </mesh>

      {/* Resting Arms / Hands in Mudra */}
      <mesh position={[-0.42, 0.55, 0.15]} rotation={[0.4, 0.3, -0.6]}>
        <capsuleGeometry args={[0.08, 0.45, 8, 16]} />
        <meshStandardMaterial color={EMERALD} roughness={0.5} />
      </mesh>
      <mesh position={[0.42, 0.55, 0.15]} rotation={[0.4, -0.3, 0.6]}>
        <capsuleGeometry args={[0.08, 0.45, 8, 16]} />
        <meshStandardMaterial color={EMERALD} roughness={0.5} />
      </mesh>

      {/* Glowing Chakra Energy Points */}
      <GlowingChakraPoints />
    </group>
  );
}

function HeroSceneLighting() {
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 6, 3]} intensity={1.3} color={LIGHT.key} />
      <directionalLight position={[-4, 3, -3]} intensity={0.4} color={LIGHT.fill} />
      <pointLight position={[0, 0.5, 1]} intensity={0.6} color={JADE} distance={3} />
    </>
  );
}

export default function HeroWellnessScene({ paused = false }: HeroSceneProps) {
  return (
    <div className="relative aspect-square w-full max-w-lg mx-auto overflow-hidden rounded-3xl" aria-hidden>
      <Canvas
        camera={{ position: [0, 0.4, 3.4], fov: 45 }}
        dpr={[1, 1.75]}
        frameloop={paused ? "demand" : "always"}
        gl={{ antialias: true, powerPreference: "low-power" }}
      >
        <HeroSceneLighting />
        <Suspense fallback={null}>
          <MeditatingYogaSubject paused={paused} />
          <FloatingBotanicalParticles paused={paused} />
        </Suspense>
      </Canvas>
    </div>
  );
}
