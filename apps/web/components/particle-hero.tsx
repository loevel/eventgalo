"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Champ de particules dorées dérivant lentement, avec parallax souris.
 * Rendu Three.js pur (pas de R3F) pour garder le bundle léger sur la landing.
 * Respecte prefers-reduced-motion : une seule frame statique est alors rendue.
 */
export function ParticleHero() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.z = 18;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // Sprite circulaire doux généré en canvas — évite de charger une texture externe.
    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = 64;
    spriteCanvas.height = 64;
    const ctx = spriteCanvas.getContext("2d")!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,220,180,0.7)");
    grad.addColorStop(1, "rgba(255,180,120,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const spriteTexture = new THREE.CanvasTexture(spriteCanvas);

    const COUNT = 340;
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    const sways = new Float32Array(COUNT);
    const colors = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);

    const warm = new THREE.Color("#ffb37a");
    const gold = new THREE.Color("#f2c078");
    const cream = new THREE.Color("#fff3e0");

    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 34;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 22;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 16;
      speeds[i] = 0.35 + Math.random() * 0.9;
      sways[i] = Math.random() * Math.PI * 2;
      const c = [warm, gold, cream][Math.floor(Math.random() * 3)].clone();
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      sizes[i] = 0.35 + Math.random() * 0.9;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.55,
      map: spriteTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    let mouseX = 0;
    let mouseY = 0;
    let targetRotX = 0;
    let targetRotY = 0;

    function onPointerMove(e: PointerEvent) {
      const rect = mount!.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    }
    mount.addEventListener("pointermove", onPointerMove);

    function onResize() {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }
    window.addEventListener("resize", onResize);

    const clock = new THREE.Clock();
    let frameId = 0;

    function renderFrame() {
      const t = clock.getElapsedTime();
      const posAttr = geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < COUNT; i++) {
        const idx = i * 3;
        let y = posAttr.array[idx + 1] as number;
        y += speeds[i] * 0.006;
        if (y > 11) y = -11;
        posAttr.array[idx + 1] = y;
        posAttr.array[idx] += Math.sin(t * 0.4 + sways[i]) * 0.0025;
      }
      posAttr.needsUpdate = true;

      targetRotX += (mouseY * 0.12 - targetRotX) * 0.02;
      targetRotY += (mouseX * 0.18 - targetRotY) * 0.02;
      points.rotation.x = targetRotX;
      points.rotation.y = targetRotY;
      points.rotation.z = t * 0.01;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(renderFrame);
    }

    if (reduceMotion) {
      renderer.render(scene, camera);
    } else {
      frameId = requestAnimationFrame(renderFrame);
    }

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      mount?.removeEventListener("pointermove", onPointerMove);
      geometry.dispose();
      material.dispose();
      spriteTexture.dispose();
      renderer.dispose();
      mount?.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="particle-hero" aria-hidden="true" />;
}
