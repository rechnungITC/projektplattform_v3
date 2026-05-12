"use client"

import { Html, Line, OrbitControls } from "@react-three/drei"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as React from "react"
import * as THREE from "three"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"

import {
  buildProjectGraph3DScene,
  type Graph3DEdge,
  type Graph3DNode,
} from "@/lib/project-graph/three-adapter"
import type { ProjectGraphSnapshot } from "@/lib/project-graph/types"

interface ProjectGraph3DCanvasProps {
  snapshot: ProjectGraphSnapshot
  criticalOverlay: boolean
  focusedNodeId: string | null
  focusedEdgeId: string | null
  resetTick: number
  onFocusNode: (nodeId: string) => void
  onFocusEdge: (edgeId: string) => void
}

export function ProjectGraph3DCanvas({
  snapshot,
  criticalOverlay,
  focusedNodeId,
  focusedEdgeId,
  resetTick,
  onFocusNode,
  onFocusEdge,
}: ProjectGraph3DCanvasProps) {
  const scene = React.useMemo(
    () => buildProjectGraph3DScene(snapshot, { criticalOverlay }),
    [snapshot, criticalOverlay],
  )

  return (
    <div
      className="relative h-[520px] min-h-[360px] overflow-hidden rounded-md border bg-slate-50 md:h-[620px]"
      data-testid="project-graph-3d-canvas"
    >
      <Canvas
        camera={{
          position: [0, Math.max(6, scene.boundsRadius * 0.6), scene.boundsRadius * 1.35],
          fov: 45,
          near: 0.1,
          far: 1000,
        }}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
        }}
        fallback={<CanvasFallback />}
      >
        <color attach="background" args={["#f8fafc"]} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[4, 8, 5]} intensity={1.1} />
        <pointLight position={[-5, 3, -4]} intensity={0.45} />
        <CameraController
          boundsRadius={scene.boundsRadius}
          resetTick={resetTick}
        />
        <Grid boundsRadius={scene.boundsRadius} />
        <group>
          {scene.edges.map((edge, index) => (
            <EdgeLink
              key={edge.id}
              edge={edge}
              index={index}
              selected={focusedEdgeId === edge.id}
              dimmed={
                focusedNodeId != null &&
                edge.source.id !== focusedNodeId &&
                edge.target.id !== focusedNodeId
              }
              onFocusEdge={onFocusEdge}
            />
          ))}
          {scene.nodes.map((node) => (
            <NodeOrb
              key={node.id}
              node={node}
              selected={focusedNodeId === node.id}
              relatedToSelectedEdge={
                focusedEdgeId != null &&
                scene.edges.some(
                  (edge) =>
                    edge.id === focusedEdgeId &&
                    (edge.source.id === node.id || edge.target.id === node.id),
                )
              }
              onFocusNode={onFocusNode}
            />
          ))}
        </group>
      </Canvas>
      {scene.warnings.includes("large-graph-lod") && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-amber-500/30 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
          LOD aktiv: grosser Graph
        </div>
      )}
    </div>
  )
}

function CameraController({
  boundsRadius,
  resetTick,
}: {
  boundsRadius: number
  resetTick: number
}) {
  const controls = React.useRef<OrbitControlsImpl | null>(null)
  const { camera } = useThree()

  React.useEffect(() => {
    camera.position.set(0, Math.max(6, boundsRadius * 0.6), boundsRadius * 1.35)
    camera.lookAt(0, 0, 0)
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
  }, [boundsRadius, camera, resetTick])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      enableZoom
      maxDistance={boundsRadius * 3}
      minDistance={2.5}
    />
  )
}

function Grid({ boundsRadius }: { boundsRadius: number }) {
  return (
    <gridHelper
      args={[Math.max(12, boundsRadius * 2.2), 18, "#cbd5e1", "#e2e8f0"]}
      position={[0, -2.85, 0]}
    />
  )
}

function NodeOrb({
  node,
  selected,
  relatedToSelectedEdge,
  onFocusNode,
}: {
  node: Graph3DNode
  selected: boolean
  relatedToSelectedEdge: boolean
  onFocusNode: (nodeId: string) => void
}) {
  const showLabel =
    node.node.kind === "project" || selected || relatedToSelectedEdge || node.critical
  const scale = selected ? 1.32 : relatedToSelectedEdge ? 1.18 : 1
  return (
    <group position={node.position}>
      <mesh
        scale={scale}
        onPointerOver={(event) => {
          event.stopPropagation()
          onFocusNode(node.id)
        }}
        onClick={(event) => {
          event.stopPropagation()
          onFocusNode(node.id)
        }}
      >
        <sphereGeometry args={[node.radius, 28, 18]} />
        <meshStandardMaterial
          color={node.color}
          emissive={selected || node.critical ? node.color : "#000000"}
          emissiveIntensity={selected ? 0.42 : node.critical ? 0.18 : 0}
          metalness={0.08}
          roughness={0.45}
        />
      </mesh>
      {(selected || node.critical) && (
        <mesh scale={selected ? 1.72 : 1.45}>
          <sphereGeometry args={[node.radius, 32, 16]} />
          <meshBasicMaterial
            color={selected ? "#0f172a" : "#f59e0b"}
            transparent
            opacity={0.12}
            wireframe
          />
        </mesh>
      )}
      {showLabel && (
        <Html
          center
          distanceFactor={9}
          position={[0, node.radius + 0.34, 0]}
          zIndexRange={[20, 0]}
        >
          <span className="pointer-events-none max-w-40 rounded-md border bg-background/95 px-2 py-1 text-[11px] font-medium text-foreground shadow-sm">
            {node.node.label}
          </span>
        </Html>
      )}
    </group>
  )
}

function EdgeLink({
  edge,
  index,
  selected,
  dimmed,
  onFocusEdge,
}: {
  edge: Graph3DEdge
  index: number
  selected: boolean
  dimmed: boolean
  onFocusEdge: (edgeId: string) => void
}) {
  const opacity = selected ? 1 : dimmed ? Math.min(edge.opacity, 0.22) : edge.opacity
  const lineWidth = selected ? edge.width + 1.2 : edge.width
  return (
    <group>
      <Line
        points={edge.points}
        color={edge.color}
        lineWidth={lineWidth}
        transparent
        opacity={opacity}
      />
      <Line
        points={edge.points}
        color={edge.color}
        lineWidth={10}
        transparent
        opacity={0.001}
        onPointerOver={(event) => {
          event.stopPropagation()
          onFocusEdge(edge.id)
        }}
        onClick={(event) => {
          event.stopPropagation()
          onFocusEdge(edge.id)
        }}
      />
      <EdgeArrow edge={edge} selected={selected} opacity={opacity} />
      {!dimmed && <EdgeParticle edge={edge} index={index} selected={selected} />}
    </group>
  )
}

function EdgeArrow({
  edge,
  selected,
  opacity,
}: {
  edge: Graph3DEdge
  selected: boolean
  opacity: number
}) {
  const { position, quaternion } = React.useMemo(() => {
    const end = new THREE.Vector3(...edge.points[edge.points.length - 1])
    const beforeEnd = new THREE.Vector3(...edge.points[edge.points.length - 2])
    const direction = end.clone().sub(beforeEnd).normalize()
    const position = end.clone().add(direction.clone().multiplyScalar(-0.34))
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction,
    )
    return { position, quaternion }
  }, [edge.points])

  return (
    <mesh position={position} quaternion={quaternion}>
      <coneGeometry args={[selected ? 0.12 : 0.09, selected ? 0.34 : 0.25, 18]} />
      <meshStandardMaterial color={edge.color} transparent opacity={opacity} />
    </mesh>
  )
}

function EdgeParticle({
  edge,
  index,
  selected,
}: {
  edge: Graph3DEdge
  index: number
  selected: boolean
}) {
  const ref = React.useRef<THREE.Mesh>(null)
  const curve = React.useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        edge.points.map((point) => new THREE.Vector3(...point)),
      ),
    [edge.points],
  )

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = (clock.elapsedTime * (selected ? 0.28 : 0.16) + index * 0.13) % 1
    mesh.position.copy(curve.getPointAt(t))
  })

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[selected ? 0.07 : 0.045, 12, 8]} />
      <meshBasicMaterial color={edge.color} transparent opacity={selected ? 0.9 : 0.58} />
    </mesh>
  )
}

function CanvasFallback() {
  return (
    <div className="flex h-full min-h-[360px] items-center justify-center rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
      WebGL ist in diesem Browser nicht verfuegbar.
    </div>
  )
}
