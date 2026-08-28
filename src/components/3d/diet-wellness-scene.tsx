"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useRef, useSyncExternalStore } from "react";
import { Group } from "three";
import {
  EMERALD,
  LIGHT,
  AVOCADO,
  BERRY,
  PURPLE_BERRY,
  WATER_BLUE,
  CREAM_WHITE,
  ORANGE_GOLD,
} from "./palette";

interface DietSceneProps {
  paused?: boolean;
}

function subscribeResize(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribeResize,
    () => (typeof window !== "undefined" ? window.innerWidth < 768 : false),
    () => true
  );
}

function FloatingNutrientElements({ paused }: { paused?: boolean }) {
  const groupRef = useRef<Group>(null);

  useFrame((state, delta) => {
    if (paused || !groupRef.current) return;
    const t = state.clock.getElapsedTime();

    groupRef.current.rotation.y += delta * 0.15;
    groupRef.current.position.y = Math.sin(t * 1.2) * 0.08;
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.9, 0.5, 0.45, 32]} />
        <meshStandardMaterial color={CREAM_WHITE} roughness={0.3} metalness={0.05} />
      </mesh>

      <mesh position={[0, -0.15, 0]}>
        <sphereGeometry args={[0.75, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        <meshStandardMaterial color={EMERALD} roughness={0.6} />
      </mesh>

      <mesh position={[-0.3, 0.1, 0.2]} rotation={[0.4, 0.2, 0.3]}>
        <torusGeometry args={[0.2, 0.08, 12, 24, Math.PI * 0.8]} />
        <meshStandardMaterial color={AVOCADO} roughness={0.4} />
      </mesh>

      <mesh position={[0.3, 0.15, 0.2]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color={BERRY} roughness={0.3} />
      </mesh>

      <mesh position={[0.4, 0.08, -0.1]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial color={PURPLE_BERRY} roughness={0.3} />
      </mesh>

      <mesh position={[0, 0.65, 0]}>
        <octahedronGeometry args={[0.12, 2]} />
        <meshStandardMaterial color={WATER_BLUE} transparent opacity={0.8} roughness={0.1} />
      </mesh>
    </group>
  );
}

function DietSceneLighting() {
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[4, 5, 4]} intensity={1.4} color={LIGHT.warm} />
      <directionalLight position={[-3, 2, -3]} intensity={0.5} color={LIGHT.orangeFill} />
      <pointLight position={[0, 1, 1]} intensity={0.8} color={ORANGE_GOLD} distance={4} />
    </>
  );
}

export default function DietWellnessScene({ paused = false }: DietSceneProps) {
  const isMobile = useIsMobile();

  return (
    <div className="relative aspect-square w-full max-w-sm mx-auto overflow-hidden rounded-3xl" aria-hidden>
      <Canvas
        camera={{ position: [0, 0.5, 3.2], fov: 45 }}
        dpr={isMobile ? 1 : [1, 1.75]}
        frameloop={paused ? "demand" : "always"}
        gl={{ antialias: true, powerPreference: "low-power" }}
      >
        <DietSceneLighting />
        <Suspense fallback={null}>
          <FloatingNutrientElements paused={paused} />
        </Suspense>
      </Canvas>
    </div>
  );
}
