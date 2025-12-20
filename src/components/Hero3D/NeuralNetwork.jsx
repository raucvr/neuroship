import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// -----------------------------------------------------------------------------
// SHADER - CELL MEMBRANE (Isomorphic Labs style)
// High-quality organic displacement with gradient colors
// -----------------------------------------------------------------------------
const membraneVertexShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;
  varying vec3 vViewPosition;

  // Simplex Noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    
    // Slow, organic rolling noise
    float noiseFreq = 0.7; 
    float noiseAmp = 0.5; 
    float timeSpeed = 0.15;
    
    vec3 noisePos = position * noiseFreq + uTime * timeSpeed;
    float n = snoise(noisePos);
    
    // Layer secondary noise for organic detail
    float n2 = snoise(position * 1.5 - uTime * 0.25) * 0.15;
    float n3 = snoise(position * 3.0 + uTime * 0.1) * 0.05;
    
    vDisplacement = n + n2 + n3;
    
    vec3 newPosition = position + normal * (vDisplacement * noiseAmp);
    
    vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    
    vPosition = newPosition;
  }
`;

const membraneFragmentShader = `
  uniform float uTime;
  uniform vec3 uColorBase;
  uniform vec3 uColorPeak;
  uniform vec3 uColorFresnel;
  
  varying vec3 vNormal;
  varying float vDisplacement;
  varying vec3 vViewPosition;

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 normal = normalize(vNormal);
    
    // Fresnel Effect - Rim Light (membrane glow)
    float fresnel = pow(1.0 - abs(dot(viewDir, normal)), 2.8);
    
    // Color gradient based on displacement (Deep areas → Peaks)
    float mixFactor = smoothstep(-0.6, 0.6, vDisplacement);
    vec3 surfaceColor = mix(uColorBase, uColorPeak, mixFactor);
    
    // Add fresnel glow color on edges
    vec3 finalColor = mix(surfaceColor, uColorFresnel, fresnel * 0.7);
    
    // Emissive boost for self-illumination
    finalColor *= 1.3;
    
    // Opacity: center transparent, edges opaque
    float alpha = clamp(0.25 + fresnel * 0.75, 0.0, 1.0);
    
    gl_FragColor = vec4(finalColor, alpha);
    
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// -----------------------------------------------------------------------------
// SHADER - FRESNEL RING (for orbital rings with glow effect)
// -----------------------------------------------------------------------------
const ringVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const ringFragmentShader = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uFresnelPower;
  
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  
  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 normal = normalize(vNormal);
    
    // Strong fresnel effect for glowing edges
    float fresnel = pow(1.0 - abs(dot(viewDir, normal)), uFresnelPower);
    
    // Boost brightness significantly at edges
    vec3 finalColor = uColor * (1.5 + fresnel * 3.0);
    
    // Alpha based on fresnel - strong glow at edges
    float alpha = uOpacity * (0.4 + fresnel * 0.8);
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

/**
 * Main Cell Material Hook - UNIQUE white/silver color for center cell
 */
function CellMaterial() {
  const materialRef = useRef();
  
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColorBase: { value: new THREE.Color("#334455") },    // Deep blue-gray
    uColorPeak: { value: new THREE.Color("#ffffff") },    // Pure white peaks
    uColorFresnel: { value: new THREE.Color("#aaddff") }, // Light blue rim
  }), []);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <shaderMaterial
      ref={materialRef}
      uniforms={uniforms}
      vertexShader={membraneVertexShader}
      fragmentShader={membraneFragmentShader}
      transparent={true}
      side={THREE.DoubleSide}
      depthWrite={false}
      blending={THREE.AdditiveBlending}
    />
  );
}

/**
 * Fresnel Ring Component - Single ring with fresnel glow
 */
function FresnelRing({ radius, tubeRadius, color, rotation, opacity = 0.6, fresnelPower = 2.5 }) {
  const materialRef = useRef();
  
  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: opacity },
    uFresnelPower: { value: fresnelPower },
  }), [color, opacity, fresnelPower]);
  
  return (
    <mesh rotation={rotation}>
      <torusGeometry args={[radius, tubeRadius, 32, 100]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={ringVertexShader}
        fragmentShader={ringFragmentShader}
        transparent={true}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/**
 * Outer Rings with Fresnel Effect - Rotating orbital rings
 */
function OuterRings() {
  const groupRef = useRef();

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.05;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.03) * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Cyan ring - brightest */}
      <FresnelRing 
        radius={2.8} 
        tubeRadius={0.025} 
        color="#00ffff" 
        rotation={[Math.PI / 2, 0, 0]}
        opacity={0.9}
        fresnelPower={1.8}
      />
      {/* Pink ring */}
      <FresnelRing 
        radius={3.5} 
        tubeRadius={0.022} 
        color="#ff66aa" 
        rotation={[Math.PI / 2.3, 0.4, 0]}
        opacity={0.8}
        fresnelPower={2.0}
      />
      {/* Orange ring */}
      <FresnelRing 
        radius={4.2} 
        tubeRadius={0.02} 
        color="#ffaa44" 
        rotation={[Math.PI / 2.8, -0.3, 0.5]}
        opacity={0.7}
        fresnelPower={2.2}
      />
    </group>
  );
}

/**
 * Neural Particles - Gray particles with neuron-like connections and signal pulses
 */
function NeuralParticles({ count = 30 }) {
  const meshRef = useRef();
  const linesRef = useRef();
  const pulsesRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  // Generate particle positions
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const r = 2.5 + Math.random() * 4.0;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      
      temp.push({ 
        pos: new THREE.Vector3(x, y, z), 
        speed: 0.1 + Math.random() * 0.2,
        scale: 0.04 + Math.random() * 0.06,
        offset: Math.random() * 100
      });
    }
    return temp;
  }, [count]);

  // Generate neuron-like connections between nearby particles
  const connections = useMemo(() => {
    const lines = [];
    const connectionDistance = 2.5;
    
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dist = particles[i].pos.distanceTo(particles[j].pos);
        if (dist < connectionDistance && dist > 0.5) {
          lines.push({
            start: particles[i].pos.clone(),
            end: particles[j].pos.clone(),
            startIdx: i,
            endIdx: j,
            // Each connection has its own pulse properties
            pulseSpeed: 0.3 + Math.random() * 0.5,
            pulseOffset: Math.random() * Math.PI * 2,
            pulseDirection: Math.random() > 0.5 ? 1 : -1
          });
        }
      }
    }
    return lines;
  }, [particles]);

  // Create line geometry
  const lineGeometry = useMemo(() => {
    const points = [];
    connections.forEach(conn => {
      points.push(conn.start, conn.end);
    });
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [connections]);

  // Flash pulses - frequent flashes every 2 seconds
  const flashCount = 12; // More flash points
  const flashData = useMemo(() => {
    const data = [];
    for (let i = 0; i < flashCount; i++) {
      data.push({
        // Random connection for each flash
        connectionIdx: Math.floor(Math.random() * Math.max(1, connections.length)),
        // Stagger flash timing across 2 second cycle (much more frequent)
        flashTime: (i * 0.4) % 2, // Flash every ~0.4 seconds
        // Random position along the connection
        position: Math.random(),
        // Random color
        colorIdx: Math.floor(Math.random() * 5),
        // Flash is very brief
        active: false
      });
    }
    return data;
  }, [connections.length]);

  const pulseColors = useMemo(() => [
    new THREE.Color("#00ffff"), // Cyan
    new THREE.Color("#ff66aa"), // Pink
    new THREE.Color("#66ff99"), // Green
    new THREE.Color("#ffaa44"), // Orange
    new THREE.Color("#aa88ff"), // Purple
  ], []);

  // Store current positions for line updates
  const currentPositions = useRef(particles.map(p => p.pos.clone()));

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    
    // Update particle positions
    particles.forEach((p, i) => {
      const time = t * p.speed + p.offset;
      
      const newX = p.pos.x + Math.sin(time) * 0.15;
      const newY = p.pos.y + Math.cos(time * 0.6) * 0.12;
      const newZ = p.pos.z + Math.sin(time * 0.4) * 0.1;
      
      dummy.position.set(newX, newY, newZ);
      currentPositions.current[i].set(newX, newY, newZ);
      
      const s = p.scale + Math.sin(time * 1.5) * 0.01;
      dummy.scale.setScalar(s);
      
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;

    // Update line positions
    if (linesRef.current && linesRef.current.geometry) {
      const positions = linesRef.current.geometry.attributes.position.array;
      let idx = 0;
      connections.forEach(conn => {
        const startPos = currentPositions.current[conn.startIdx];
        const endPos = currentPositions.current[conn.endIdx];
        
        positions[idx++] = startPos.x;
        positions[idx++] = startPos.y;
        positions[idx++] = startPos.z;
        positions[idx++] = endPos.x;
        positions[idx++] = endPos.y;
        positions[idx++] = endPos.z;
      });
      linesRef.current.geometry.attributes.position.needsUpdate = true;
    }

    // Update flash pulses - frequent flashes
    if (pulsesRef.current && connections.length > 0) {
      const pulsePositions = pulsesRef.current.geometry.attributes.position.array;
      const pulseColors = pulsesRef.current.geometry.attributes.color.array;
      const pulseSizes = pulsesRef.current.geometry.attributes.size.array;
      
      // Time within 2-second cycle (much faster)
      const cycleTime = t % 2;
      
      flashData.forEach((flash, i) => {
        const conn = connections[flash.connectionIdx % connections.length];
        if (!conn) return;
        
        const startPos = currentPositions.current[conn.startIdx];
        const endPos = currentPositions.current[conn.endIdx];
        
        // Calculate if this flash should be active (0.4 second window)
        const timeDiff = Math.abs(cycleTime - flash.flashTime);
        const isFlashing = timeDiff < 0.4 || timeDiff > 1.6; // Handle wrap-around
        
        // Position along the connection
        const progress = flash.position;
        const x = startPos.x + (endPos.x - startPos.x) * progress;
        const y = startPos.y + (endPos.y - startPos.y) * progress;
        const z = startPos.z + (endPos.z - startPos.z) * progress;
        
        pulsePositions[i * 3] = x;
        pulsePositions[i * 3 + 1] = y;
        pulsePositions[i * 3 + 2] = z;
        
        // Flash intensity - bright flash then fade over 0.4s
        if (isFlashing) {
          const flashIntensity = 1.0 - (timeDiff < 0.4 ? timeDiff / 0.4 : (2 - timeDiff) / 0.4);
          pulseSizes[i] = 0.5 * flashIntensity; // Bigger, brighter flash
        } else {
          pulseSizes[i] = 0; // Invisible when not flashing
        }
      });
      
      pulsesRef.current.geometry.attributes.position.needsUpdate = true;
      pulsesRef.current.geometry.attributes.size.needsUpdate = true;
    }
  });

  // Flash positions, colors, and sizes
  const pulseGeometry = useMemo(() => {
    const positions = new Float32Array(flashCount * 3);
    const colors = new Float32Array(flashCount * 3);
    const sizes = new Float32Array(flashCount);
    
    flashData.forEach((flash, i) => {
      // Initial positions will be updated in useFrame
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      
      // Set colors
      const color = pulseColors[flash.colorIdx];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      
      // Initial size (invisible)
      sizes[i] = 0;
    });
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, [flashCount, flashData, pulseColors]);

  return (
    <group>
      {/* Gray particles */}
      <instancedMesh ref={meshRef} args={[null, null, count]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial 
          color="#888899" 
          transparent 
          opacity={0.6}
        />
      </instancedMesh>
      
      {/* Neuron-like connection lines */}
      <lineSegments ref={linesRef} geometry={lineGeometry}>
        <lineBasicMaterial 
          color="#aabbcc" 
          transparent 
          opacity={0.25}
          depthWrite={false}
        />
      </lineSegments>
      
      {/* Flash pulses - instant camera flash effect */}
      <points ref={pulsesRef} geometry={pulseGeometry}>
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          vertexShader={`
            attribute float size;
            varying vec3 vColor;
            void main() {
              vColor = color;
              vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = size * (300.0 / -mvPosition.z);
              gl_Position = projectionMatrix * mvPosition;
            }
          `}
          fragmentShader={`
            varying vec3 vColor;
            void main() {
              float dist = length(gl_PointCoord - vec2(0.5));
              if (dist > 0.5) discard;
              float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
              gl_FragColor = vec4(vColor, alpha);
            }
          `}
          vertexColors
        />
      </points>
    </group>
  );
}

/**
 * Main Cell - Large organic sphere with membrane effect
 */
function MainCell() {
  const groupRef = useRef();
  
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.04;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.025) * 0.08;
    }
  });
  
  return (
    <group ref={groupRef}>
      <mesh>
        <icosahedronGeometry args={[1.6, 64]} />
        <CellMaterial />
      </mesh>
    </group>
  );
}

/**
 * Electron Cloud - Simulates electron cloud effect with many small dots
 */
function ElectronCloud({ count = 200, radius = 0.8, color = "#ffffff", size = 0.015, opacity = 0.9 }) {
  const pointsRef = useRef();
  
  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);
    const radii = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      // Random spherical distribution
      const r = radius * Math.cbrt(Math.random()); // cbrt for uniform volume distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      
      speeds[i] = 0.5 + Math.random() * 1.5;
      phases[i] = Math.random() * Math.PI * 2;
      radii[i] = r;
    }
    
    return { positions, speeds, phases, radii };
  }, [count, radius]);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const positions = pointsRef.current.geometry.attributes.position.array;
    const time = state.clock.elapsedTime;
    
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      const speed = particles.speeds[i];
      const phase = particles.phases[i];
      const r = particles.radii[i];
      
      // Orbital motion around center
      const angle = time * speed + phase;
      const wobble = Math.sin(time * 2 + phase) * 0.1;
      
      // Update position with orbital motion
      const currentR = r + wobble;
      const theta = angle;
      const phi = Math.PI / 2 + Math.sin(time * 0.5 + phase) * 0.5;
      
      positions[idx] = currentR * Math.sin(phi) * Math.cos(theta);
      positions[idx + 1] = currentR * Math.sin(phi) * Math.sin(theta);
      positions[idx + 2] = currentR * Math.cos(phi);
    }
    
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={particles.positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        color={color}
        transparent
        opacity={opacity}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/**
 * Inner Glow - WHITE electron cloud only (no spheres) - HIGH DENSITY
 */
function InnerGlow() {
  return (
    <group>
      {/* White electron cloud effect - very dense, bright */}
      <ElectronCloud count={1200} radius={0.5} color="#ffffff" size={0.018} opacity={1.0} />
    </group>
  );
}

/**
 * Secondary Cells - Smaller cells around the main one (5 colors, ratio 2:2:2:1:1)
 */
const CELL_COLORS = [
  { base: "#002244", peak: "#00ffcc", fresnel: "#66ffcc" },  // Teal/Cyan (x2)
  { base: "#440022", peak: "#ff6699", fresnel: "#ffaacc" },  // Rose/Pink (x2)
  { base: "#442200", peak: "#ffaa33", fresnel: "#ffcc66" },  // Orange/Gold (x2)
  { base: "#220044", peak: "#aa66ff", fresnel: "#cc99ff" },  // Violet/Purple (x1)
  { base: "#003322", peak: "#66ff99", fresnel: "#99ffbb" },  // Mint/Green (x1)
];

// Color distribution for 8 cells: 2:2:2:1:1
const COLOR_DISTRIBUTION = [0, 0, 1, 1, 2, 2, 3, 4];

function SecondaryCells() {
  const groupRef = useRef();
  
  const cells = useMemo(() => {
    const temp = [];
    const count = 8; // 8 small cells
    
    for (let i = 0; i < count; i++) {
      const r = 3.0 + Math.random() * 3.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      
      temp.push({
        pos: [x, y, z],
        scale: 0.18 + Math.random() * 0.2,
        speed: 0.15 + Math.random() * 0.25,
        colorIndex: COLOR_DISTRIBUTION[i] // Use 2:2:2:1:1 distribution
      });
    }
    return temp;
  }, []);
  
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.015;
    }
  });
  
  return (
    <group ref={groupRef}>
      {cells.map((cell, i) => (
        <SmallCell 
          key={i} 
          position={cell.pos} 
          scale={cell.scale} 
          speed={cell.speed}
          colors={CELL_COLORS[cell.colorIndex]}
        />
      ))}
    </group>
  );
}

/**
 * Small Cell - Individual secondary cell with customizable colors and electron cloud
 */
function SmallCell({ position, scale, speed, colors }) {
  const groupRef = useRef();
  const materialRef = useRef();
  
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColorBase: { value: new THREE.Color(colors.base) },
    uColorPeak: { value: new THREE.Color(colors.peak) },
    uColorFresnel: { value: new THREE.Color(colors.fresnel) },
  }), [colors]);
  
  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.elapsedTime;
      groupRef.current.position.x = position[0] + Math.sin(t * speed) * 0.4;
      groupRef.current.position.y = position[1] + Math.cos(t * speed * 0.7) * 0.25;
      groupRef.current.position.z = position[2] + Math.sin(t * speed * 0.5) * 0.3;
    }
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });
  
  return (
    <group ref={groupRef} position={position} scale={scale}>
      {/* Cell membrane */}
      <mesh>
        <icosahedronGeometry args={[2, 32]} />
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={membraneVertexShader}
          fragmentShader={membraneFragmentShader}
          transparent={true}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      
      {/* Colored electron cloud inside each small cell - compact */}
      <ElectronCloud 
        count={200} 
        radius={0.6} 
        color={colors.peak} 
        size={0.02}
      />
    </group>
  );
}

/**
 * Main Export - Complete Neural/Cell Network
 */
export default function NeuralNetwork() {
  return (
    <group>
      <MainCell />
      <InnerGlow />
      <OuterRings />
      <SecondaryCells />
      <NeuralParticles count={35} />
    </group>
  );
}
