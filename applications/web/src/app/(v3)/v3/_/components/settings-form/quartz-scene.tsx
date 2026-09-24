"use client"

import {
  Environment,
  Lightformer,
  MeshTransmissionMaterial,
  useGLTF,
} from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Suspense, useEffect, useMemo, useRef } from "react"
import { Color, type Group, MathUtils, type Mesh } from "three"

const MODEL_URL = "/models/quartz.glb"

const IDLE_FRAME_MS = 1000 / 30
const SETTLE_EPSILON = 0.002

export type CrystalMode = "hidden" | "hover" | "selected"

type SceneProps = {
  mode: CrystalMode
  spins: number
  reducedMotion: boolean
}

function Crystal({ mode, spins, reducedMotion }: SceneProps) {
  const gltf = useGLTF(MODEL_URL)
  const source = gltf.nodes["Cube"] as Mesh

  const { geometry, fit } = useMemo(() => {
    const geometry = source.geometry.clone()
    geometry.scale(source.scale.x, source.scale.y, source.scale.z)
    geometry.center()
    geometry.computeBoundingSphere()
    return {
      geometry,
      fit: 0.78 / (geometry.boundingSphere?.radius ?? 1),
    }
  }, [source])

  const interior = useMemo(() => new Color("#7fbcc0"), [])
  const invalidate = useThree((three) => three.invalidate)
  const canvas = useThree((three) => three.gl.domElement)
  const onScreen = useRef(true)
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    invalidate()
  }, [mode, spins, invalidate])

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      onScreen.current = entry?.isIntersecting ?? true
      if (onScreen.current) invalidate()
    })
    observer.observe(canvas)
    const onVisibility = () => {
      if (document.visibilityState === "visible") invalidate()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      clearTimeout(idleTimer.current)
    }
  }, [canvas, invalidate])

  const group = useRef<Group>(null)
  const state = useRef({
    scale: 0,
    scaleV: 0,
    lift: -0.8,
    liftV: 0,
    yaw: 0,
    tilt: 0.12,
    velocity: 0,
    spins,
  })

  useFrame((frame, delta) => {
    const node = group.current
    if (!node) return

    const dt = Math.min(delta, 1 / 20)
    const s = state.current

    if (s.spins !== spins) {
      s.spins = spins
      s.scaleV += 7
      if (!reducedMotion) s.velocity += 26
    }

    const targetScale = mode === "hidden" ? 0 : mode === "hover" ? 1.12 : 1
    const targetLift = mode === "hidden" ? -0.8 : mode === "hover" ? 0.12 : 0
    const stiffness = mode === "hidden" ? 260 : 150
    const damping = mode === "hidden" ? 26 : 11

    s.scaleV += ((targetScale - s.scale) * stiffness - s.scaleV * damping) * dt
    s.scale = Math.max(0, s.scale + s.scaleV * dt)
    s.liftV += ((targetLift - s.lift) * 120 - s.liftV * 16) * dt
    s.lift += s.liftV * dt

    const idle = reducedMotion ? 0 : mode === "hover" ? 0.7 : 0.35
    s.velocity = MathUtils.damp(s.velocity, idle, 1.6, dt)
    s.yaw += s.velocity * dt
    s.tilt = MathUtils.damp(s.tilt, 0.12, 2.4, dt)

    const bob =
      reducedMotion || mode !== "hover"
        ? 0
        : Math.sin(frame.clock.elapsedTime * 1.8) * 0.04

    node.visible = s.scale > 0.002
    node.scale.setScalar(Math.max(s.scale, 0.0001))
    node.position.y = s.lift + bob
    node.rotation.set(s.tilt, s.yaw, 0)

    const springing =
      Math.abs(targetScale - s.scale) > SETTLE_EPSILON ||
      Math.abs(s.scaleV) > SETTLE_EPSILON ||
      Math.abs(targetLift - s.lift) > SETTLE_EPSILON ||
      Math.abs(s.liftV) > SETTLE_EPSILON ||
      Math.abs(s.velocity - idle) > 0.01 ||
      bob !== 0

    clearTimeout(idleTimer.current)
    if (!onScreen.current || document.visibilityState === "hidden") return
    if (springing) {
      invalidate()
    } else if (node.visible && idle > 0) {
      idleTimer.current = setTimeout(invalidate, IDLE_FRAME_MS)
    }
  })

  return (
    <group ref={group}>
      <mesh geometry={geometry} scale={fit}>
        <MeshTransmissionMaterial
          backside
          samples={3}
          resolution={256}
          transmission={1}
          thickness={0.55}
          roughness={0.05}
          ior={1.54}
          chromaticAberration={0.08}
          anisotropy={0.25}
          distortion={0.12}
          distortionScale={0.4}
          temporalDistortion={0.04}
          color="#e2f5f4"
          attenuationColor="#9dd3d6"
          attenuationDistance={2.6}
          emissive="#5c9fa6"
          emissiveIntensity={0.18}
          background={interior}
        />
      </mesh>
    </group>
  )
}

export function QuartzCanvas(props: SceneProps) {
  return (
    <Canvas
      style={{ pointerEvents: "none" }}
      frameloop="demand"
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 0.2, 4.2], fov: 32 }}
    >
      <Suspense fallback={null}>
        <Crystal {...props} />
        <Environment resolution={256} frames={1}>
          <Lightformer
            form="rect"
            intensity={4}
            position={[0, 4, -2]}
            scale={[8, 2, 1]}
          />
          <Lightformer
            form="ring"
            intensity={3}
            color="#d2f3f1"
            position={[-4, 1, 2]}
            scale={3}
          />
          <Lightformer
            form="rect"
            intensity={2}
            color="#b3e3ff"
            position={[4, -1, 3]}
            scale={[3, 6, 1]}
          />
          <Lightformer
            form="circle"
            intensity={6}
            position={[0, 0, 6]}
            scale={2}
          />
        </Environment>
      </Suspense>
    </Canvas>
  )
}

useGLTF.preload(MODEL_URL)
