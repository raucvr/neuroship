import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import NeuralNetwork from './NeuralNetwork.jsx';

/**
 * LoadingFallback - 简单的加载占位符
 */
function LoadingFallback() {
  return (
    <mesh visible={false}>
      <boxGeometry />
      <meshBasicMaterial />
    </mesh>
  );
}

/**
 * SceneContent - 包含灯光和3D对象
 */
const SceneContent = () => {
  return (
    <>
      {/* 最小灯光 - 主要依赖材质自发光 */}
      <ambientLight intensity={0.3} color="#ffffff" />
      
      {/* 补充点光源 */}
      <pointLight position={[-6, -4, -6]} intensity={0.4} color="#0088ff" />
      <pointLight position={[5, -6, 3]} intensity={0.3} color="#ff44aa" />

      {/* 细胞/神经网络动画 */}
      <NeuralNetwork />
    </>
  );
};

/**
 * Scene - 主入口组件 - 完全透明背景（无后处理）
 */
export default function Scene() {
  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      minHeight: '500px',
      position: 'relative',
      background: 'transparent'
    }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ 
          antialias: true, 
          alpha: true,
          premultipliedAlpha: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true
        }}
        camera={{ position: [0, 0, 12], fov: 50 }}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <PerspectiveCamera makeDefault position={[0, 0, 12]} />
          
          <SceneContent />
          
          {/* 相机控制 */}
          <OrbitControls 
            enableZoom={false} 
            enablePan={false} 
            autoRotate 
            autoRotateSpeed={0.15}
            minPolarAngle={Math.PI / 3}
            maxPolarAngle={Math.PI / 1.7}
            enableDamping
            dampingFactor={0.03}
          />
          
          {/* 移除EffectComposer以确保完全透明背景 */}
        </Suspense>
      </Canvas>
    </div>
  );
}
