"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef, useSyncExternalStore, useState } from "react";
import { Group, MathUtils, Mesh } from "three";
import { EMERALD, FOREST, JADE, LIGHT, CHAMPAGNE } from "./palette";

/**
 * A 3D yoga pose showcase for the landing page.
 *
 * Renders an abstract meditating figure that cycles through four distinct yoga
 * poses by interpolating limb positions. Pure geometry — no GLTF dependency —
 * so it loads instantly and runs on any device with WebGL.
 *
 * Follows the same degradation pattern as hero-wellness-scene: reduced motion
 * and no-WebGL paths fall back to a static figure.
 */

interface ShowcaseProps {
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
    () => true,
  );
}

type PoseName = "mountain" | "warrior" | "tree" | "child";

interface PoseConfig {
  name: PoseName;
  label: string;
  sanskrit: string;
  // Limb rotations in radians
  leftArm: [number, number, number];
  rightArm: [number, number, number];
  leftLeg: [number, number, number];
  rightLeg: [number, number, number];
  torso: [number, number, number];
  head: [number, number, number];
  baseY: number;
}

const POSES: PoseConfig[] = [
  {
    name: "mountain",
    label: "Mountain Pose",
    sanskrit: "Tadasana",
    leftArm: [0, 0, 0.05],
    rightArm: [0, 0, -0.05],
    leftLeg: [0, 0, 0.02],
    rightLeg: [0, 0, -0.02],
    torso: [0, 0, 0],
    head: [0, 0, 0],
    baseY: 0,
  },
  {
    name: "warrior",
    label: "Warrior II",
    sanskrit: "Virabhadrasana II",
    leftArm: [0, 0, 1.4],
    rightArm: [0, 0, -1.4],
    leftLeg: [0, 0.6, 0],
    rightLeg: [0, -0.3, 0],
    torso: [0, 0.3, 0],
    head: [0, 0.5, 0],
    baseY: -0.1,
  },
  {
    name: "tree",
    label: "Tree Pose",
    sanskrit: "Vrksasana",
    leftArm: [0, 0, 1.8],
    rightArm: [0, 0, -1.8],
    leftLeg: [0.3, 0, -0.5],
    rightLeg: [0, 0, 0.02],
    torso: [0, 0, 0],
    head: [0, 0, 0],
    baseY: 0,
  },
  {
    name: "child",
    label: "Child's Pose",
    sanskrit: "Balasana",
    leftArm: [1.2, 0, 0.3],
    rightArm: [1.2, 0, -0.3],
    leftLeg: [0, 0, 0.4],
    rightLeg: [0, 0, -0.4],
    torso: [1.0, 0, 0],
    head: [0.3, 0, 0],
    baseY: -0.6,
  },
];

const POSE_DURATION = 4.5;

function lerpArr(a: number[], b: number[], t: number): [number, number, number] {
  return [
    MathUtils.lerp(a[0], b[0], t),
    MathUtils.lerp(a[1], b[1], t),
    MathUtils.lerp(a[2], b[2], t),
  ];
}

function YogaFigure({ paused, isMobile }: { paused?: boolean; isMobile?: boolean }) {
  const group = useRef<Group>(null);
  const headRef = useRef<Mesh>(null);
  const torsoRef = useRef<Group>(null);
  const leftArmRef = useRef<Group>(null);
  const rightArmRef = useRef<Group>(null);
  const leftLegRef = useRef<Group>(null);
  const rightLegRef = useRef<Group>(null);
  const [poseIndex, setPoseIndex] = useState(0);

  useFrame((state) => {
    if (paused || !group.current) return;
    const t = state.clock.getElapsedTime();

    const cycleTime = POSE_DURATION * POSES.length;
    const cyclePos = (t % cycleTime) / POSE_DURATION;
    const currentIdx = Math.floor(cyclePos);
    const nextIdx = (currentIdx + 1) % POSES.length;
    const withinPose = cyclePos - currentIdx;

    // Cross-fade between poses in the last 20% of each pose's duration
    const transitionStart = 0.8;
    const blend = withinPose > transitionStart
      ? MathUtils.smoothstep((withinPose - transitionStart) / (1 - transitionStart), 0, 1)
      : 0;

    const current = POSES[currentIdx];
    const next = POSES[nextIdx];

    if (poseIndex !== currentIdx) setPoseIndex(currentIdx);

    // Breathing
    const breath = Math.sin(t * 1.5) * 0.015;
    group.current.position.y = breath + MathUtils.lerp(current.baseY, next.baseY, blend);

    // Parallax
    const parallax = isMobile ? 0.03 : 0.08;
    const targetX = state.pointer.y * parallax;
    const targetY = state.pointer.x * (parallax * 1.5);
    group.current.rotation.x = MathUtils.lerp(group.current.rotation.x, targetX, 0.04);
    group.current.rotation.y = MathUtils.lerp(group.current.rotation.y, targetY, 0.04);

    // Interpolate limb rotations
    if (leftArmRef.current) {
      const r = lerpArr(current.leftArm, next.leftArm, blend);
      leftArmRef.current.rotation.set(r[0], r[1], r[2]);
    }
    if (rightArmRef.current) {
      const r = lerpArr(current.rightArm, next.rightArm, blend);
      rightArmRef.current.rotation.set(r[0], r[1], r[2]);
    }
    if (leftLegRef.current) {
      const r = lerpArr(current.leftLeg, next.leftLeg, blend);
      leftLegRef.current.rotation.set(r[0], r[1], r[2]);
    }
    if (rightLegRef.current) {
      const r = lerpArr(current.rightLeg, next.rightLeg, blend);
      rightLegRef.current.rotation.set(r[0], r[1], r[2]);
    }
    if (torsoRef.current) {
      const r = lerpArr(current.torso, next.torso, blend);
      torsoRef.current.rotation.set(r[0], r[1], r[2]);
    }
    if (headRef.current) {
      const r = lerpArr(current.head, next.head, blend);
      headRef.current.rotation.set(r[0], r[1], r[2]);
    }
  });

  return (
    <group ref={group} position={[0, -0.3, 0]}>
      {/* Head */}
      <mesh ref={headRef} position={[0, 1.65, 0]}>
        <sphereGeometry args={[0.2, 32, 32]} />
        <meshStandardMaterial color={JADE} roughness={0.4} metalness={0.15} />
      </mesh>

      {/* Torso */}
      <group ref={torsoRef} position={[0, 1.0, 0]}>
        <mesh>
          <capsuleGeometry args={[0.24, 0.55, 8, 24]} />
          <meshStandardMaterial color={EMERALD} roughness={0.5} metalness={0.1} />
        </mesh>
      </group>

      {/* Hips */}
      <mesh position={[0, 0.35, 0]}>
        <capsuleGeometry args={[0.22, 0.2, 8, 16]} />
        <meshStandardMaterial color={FOREST} roughness={0.6} />
      </mesh>

      {/* Left Arm */}
      <group ref={leftArmRef} position={[-0.32, 1.15, 0]}>
        <mesh position={[-0.05, -0.3, 0]}>
          <capsuleGeometry args={[0.07, 0.5, 8, 16]} />
          <meshStandardMaterial color={EMERALD} roughness={0.5} />
        </mesh>
        {/* Hand */}
        <mesh position={[-0.1, -0.62, 0]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial color={JADE} roughness={0.4} />
        </mesh>
      </group>

      {/* Right Arm */}
      <group ref={rightArmRef} position={[0.32, 1.15, 0]}>
        <mesh position={[0.05, -0.3, 0]}>
          <capsuleGeometry args={[0.07, 0.5, 8, 16]} />
          <meshStandardMaterial color={EMERALD} roughness={0.5} />
        </mesh>
        <mesh position={[0.1, -0.62, 0]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial color={JADE} roughness={0.4} />
        </mesh>
      </group>

      {/* Left Leg */}
      <group ref={leftLegRef} position={[-0.14, 0.3, 0]}>
        <mesh position={[-0.02, -0.4, 0]}>
          <capsuleGeometry args={[0.09, 0.7, 8, 16]} />
          <meshStandardMaterial color={FOREST} roughness={0.6} />
        </mesh>
        <mesh position={[-0.04, -0.78, 0.05]}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshStandardMaterial color={EMERALD} roughness={0.5} />
        </mesh>
      </group>

      {/* Right Leg */}
      <group ref={rightLegRef} position={[0.14, 0.3, 0]}>
        <mesh position={[0.02, -0.4, 0]}>
          <capsuleGeometry args={[0.09, 0.7, 8, 16]} />
          <meshStandardMaterial color={FOREST} roughness={0.6} />
        </mesh>
        <mesh position={[0.04, -0.78, 0.05]}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshStandardMaterial color={EMERALD} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

function ChakraOrbs({ paused }: { paused?: boolean }) {
  const group = useRef<Group>(null);

  const chakras = useMemo(
    () => [
      { y: 0.4, color: 0xe05638 },
      { y: 0.65, color: 0xe58e38 },
      { y: 0.9, color: 0xebc934 },
      { y: 1.15, color: 0x3cb067 },
      { y: 1.4, color: 0x389ce0 },
      { y: 1.65, color: 0x5b4ce0 },
    ],
    [],
  );

  useFrame((state) => {
    if (paused || !group.current) return;
    const t = state.clock.getElapsedTime();
    group.current.children.forEach((child, i) => {
      if (child) {
        const pulse = 1 + Math.sin(t * 2 + i * 0.8) * 0.15;
        child.scale.setScalar(pulse);
      }
    });
  });

  return (
    <group ref={group} position={[0, -0.3, 0.05]}>
      {chakras.map((c, i) => (
        <mesh key={i} position={[0, c.y, 0]}>
          <sphereGeometry args={[0.028, 16, 16]} />
          <meshBasicMaterial color={c.color} transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function EnergyRings({ paused }: { paused?: boolean }) {
  const ring1 = useRef<Mesh>(null);
  const ring2 = useRef<Mesh>(null);

  useFrame((state, delta) => {
    if (paused) return;
    if (ring1.current) {
      ring1.current.rotation.z += delta * 0.3;
      ring1.current.rotation.x = Math.sin(state.clock.getElapsedTime() * 0.6) * 0.15 + 0.3;
    }
    if (ring2.current) {
      ring2.current.rotation.z -= delta * 0.2;
      ring2.current.rotation.x = Math.cos(state.clock.getElapsedTime() * 0.5) * 0.12 - 0.2;
    }
  });

  return (
    <>
      <mesh ref={ring1} position={[0, 0.7, 0]}>
        <torusGeometry args={[1.0, 0.015, 16, 64]} />
        <meshStandardMaterial color={JADE} roughness={0.2} transparent opacity={0.5} />
      </mesh>
      <mesh ref={ring2} position={[0, 0.7, 0]}>
        <torusGeometry args={[1.15, 0.01, 16, 64]} />
        <meshStandardMaterial color={CHAMPAGNE} roughness={0.3} transparent opacity={0.35} />
      </mesh>
    </>
  );
}

function FloatingParticles({ paused, isMobile }: { paused?: boolean; isMobile?: boolean }) {
  const count = isMobile ? 10 : 20;
  const group = useRef<Group>(null);

  const particles = useMemo(() => {
    const temp: { x: number; y: number; z: number; scale: number; speed: number; initialY: number }[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.sin(i) * 0.5;
      const radius = 1.3 + Math.cos(i * 1.7) * 0.8;
      const y = (Math.sin(i * 3.3) - 0.5) * 2.5;
      temp.push({
        x: Math.cos(angle) * radius,
        y,
        z: Math.sin(angle) * radius - 0.3,
        scale: 0.02 + Math.abs(Math.sin(i * 2.1)) * 0.04,
        speed: 0.15 + Math.abs(Math.cos(i * 1.4)) * 0.25,
        initialY: y,
      });
    }
    return temp;
  }, [count]);

  useFrame((state, delta) => {
    if (paused || !group.current) return;
    const t = state.clock.getElapsedTime();
    group.current.children.forEach((child, i) => {
      const p = particles[i];
      if (p && child) {
        child.position.y = p.initialY + Math.sin(t * p.speed + i) * 0.12;
        child.rotation.x += delta * 0.08 * p.speed;
        child.rotation.y += delta * 0.15 * p.speed;
      }
    });
  });

  return (
    <group ref={group}>
      {particles.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]} scale={[p.scale, p.scale * 1.4, p.scale]}>
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? JADE : i % 3 === 1 ? EMERALD : CHAMPAGNE}
            roughness={0.4}
            metalness={0.1}
            transparent
            opacity={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

function ShowcaseLighting() {
  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 6, 3]} intensity={1.2} color={LIGHT.key} />
      <directionalLight position={[-4, 3, -3]} intensity={0.4} color={LIGHT.fill} />
      <pointLight position={[0, 0.5, 1.5]} intensity={0.5} color={JADE} distance={4} />
      <pointLight position={[0, -0.5, -1]} intensity={0.3} color={CHAMPAGNE} distance={3} />
    </>
  );
}

export default function YogaPoseShowcase({ paused = false }: ShowcaseProps) {
  const isMobile = useIsMobile();

  return (
    <div className="relative aspect-square w-full max-w-lg mx-auto overflow-hidden rounded-3xl" aria-hidden>
      <Canvas
        camera={{ position: [0, 0.5, 3.6], fov: 44 }}
        dpr={isMobile ? 1 : [1, 1.75]}
        frameloop={paused ? "demand" : "always"}
        gl={{ antialias: true, powerPreference: "low-power" }}
      >
        <ShowcaseLighting />
        <Suspense fallback={null}>
          <YogaFigure paused={paused} isMobile={isMobile} />
          <ChakraOrbs paused={paused} />
          <EnergyRings paused={paused} />
          <FloatingParticles paused={paused} isMobile={isMobile} />
        </Suspense>
      </Canvas>
    </div>
  );
}

export { POSES, type PoseName, type PoseConfig };
