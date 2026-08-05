/* ============================================================
   SILVERLINE RESORT — WebGL atmosphere layer
   A single lightweight Three.js scene layered over the hero:
     · volumetric fog sheets drifting laterally
     · floating dust motes with depth
     · slow-tumbling leaves
     · soft god-ray shafts
     · parallax camera reacting to cursor
   Palette sampled from the drone footage: pine, stone mist,
   ivory highlights, warm amber sun.
   Budget-conscious: one scene, additive sprites, no shadows,
   capped DPR, pauses when off-screen or tab-hidden.
   ============================================================ */

import * as THREE from 'three';

const canvas = document.getElementById('atmos-canvas');
if (canvas) {
  const env = window.__silverline || {};
  const reduceMotion = env.reduceMotion || false;
  const isMobile = env.isMobile || window.matchMedia('(max-width: 1024px)').matches;

  if (!reduceMotion) init();

  function init() {
    /* ---------- Renderer ---------- */
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.4 : 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55, window.innerWidth / window.innerHeight, 0.1, 260
    );
    camera.position.set(0, 0, 46);

    /* ---------- Palette ---------- */
    const C = {
      pine:   new THREE.Color('#2c4a3f'),
      stone:  new THREE.Color('#7d8a86'),
      fog:    new THREE.Color('#d7dcd8'),
      ivory:  new THREE.Color('#eceae3'),
      amber:  new THREE.Color('#d9b483'),
      teak:   new THREE.Color('#9a7a52')
    };

    /* ---------- Soft radial sprite texture ---------- */
    function radialTexture(inner, outer, softness) {
      const s = 128;
      const cv = document.createElement('canvas');
      cv.width = cv.height = s;
      const ctx = cv.getContext('2d');
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, inner);
      g.addColorStop(softness, outer);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }

    /* ---------- Leaf-silhouette texture ---------- */
    function leafTexture() {
      const s = 128;
      const cv = document.createElement('canvas');
      cv.width = cv.height = s;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = 'rgba(40,62,52,0.92)';
      ctx.beginPath();
      // simple almond leaf shape
      ctx.moveTo(64, 12);
      ctx.bezierCurveTo(108, 40, 108, 92, 64, 118);
      ctx.bezierCurveTo(20, 92, 20, 40, 64, 12);
      ctx.fill();
      // midrib
      ctx.strokeStyle = 'rgba(20,32,27,0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(64, 18);
      ctx.lineTo(64, 112);
      ctx.stroke();
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }

    const texMote = radialTexture('rgba(255,255,255,0.95)', 'rgba(255,255,255,0.18)', 0.42);
    const texFog  = radialTexture('rgba(255,255,255,0.5)',  'rgba(255,255,255,0.12)', 0.5);
    const texLeaf = leafTexture();

    /* ==========================================================
       1 · FOG SHEETS — large, slow, low-opacity billboards
       ========================================================== */
    const fogGroup = new THREE.Group();
    scene.add(fogGroup);

    const FOG_COUNT = isMobile ? 9 : 16;
    const fogSprites = [];

    for (let i = 0; i < FOG_COUNT; i++) {
      const mat = new THREE.SpriteMaterial({
        map: texFog,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        opacity: 0.05 + Math.random() * 0.07
      });
      // fog tint drifts between stone mist and pine shadow
      mat.color.copy(Math.random() > 0.45 ? C.fog : C.stone).lerp(C.pine, Math.random() * 0.35);

      const sp = new THREE.Sprite(mat);
      const scale = 34 + Math.random() * 52;
      sp.scale.set(scale * 1.5, scale * 0.62, 1);
      sp.position.set(
        (Math.random() - 0.5) * 150,
        -14 + Math.random() * 30,
        -60 + Math.random() * 68
      );
      sp.userData = {
        driftX: 0.45 + Math.random() * 0.85,
        bobAmp: 0.7 + Math.random() * 1.5,
        bobSpeed: 0.09 + Math.random() * 0.14,
        phase: Math.random() * Math.PI * 2,
        baseY: sp.position.y
      };
      fogGroup.add(sp);
      fogSprites.push(sp);
    }

    /* ==========================================================
       2 · DUST MOTES — depth-layered points
       ========================================================== */
    const MOTE_COUNT = isMobile ? 220 : 560;
    const motePos = new Float32Array(MOTE_COUNT * 3);
    const moteSeed = new Float32Array(MOTE_COUNT);
    const moteSize = new Float32Array(MOTE_COUNT);

    for (let i = 0; i < MOTE_COUNT; i++) {
      motePos[i * 3]     = (Math.random() - 0.5) * 120;
      motePos[i * 3 + 1] = (Math.random() - 0.5) * 78;
      motePos[i * 3 + 2] = (Math.random() - 0.5) * 90 - 6;
      moteSeed[i] = Math.random() * Math.PI * 2;
      moteSize[i] = 0.22 + Math.random() * 0.72;
    }

    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    moteGeo.setAttribute('aSize', new THREE.BufferAttribute(moteSize, 1));
    moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(moteSeed, 1));

    const moteMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: texMote },
        uColorA: { value: C.ivory },
        uColorB: { value: C.amber },
        uPixelRatio: { value: renderer.getPixelRatio() }
      },
      vertexShader: /* glsl */`
        attribute float aSize;
        attribute float aSeed;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying float vMix;

        void main() {
          vec3 p = position;
          // gentle three-axis drift, like still air
          p.x += sin(uTime * 0.14 + aSeed) * 3.4;
          p.y += cos(uTime * 0.11 + aSeed * 1.7) * 2.6 + sin(uTime * 0.06 + aSeed) * 1.2;
          p.z += sin(uTime * 0.09 + aSeed * 0.7) * 2.0;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;

          float dist = -mv.z;
          gl_PointSize = aSize * 26.0 * uPixelRatio * (34.0 / max(dist, 1.0));

          // fade with depth and twinkle very slowly
          vAlpha = smoothstep(120.0, 14.0, dist) * (0.30 + 0.28 * sin(uTime * 0.5 + aSeed * 3.1));
          vMix = fract(aSeed * 0.159);
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying float vAlpha;
        varying float vMix;

        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          vec3 col = mix(uColorA, uColorB, vMix * 0.75);
          float a = tex.a * clamp(vAlpha, 0.0, 1.0);
          if (a < 0.006) discard;
          gl_FragColor = vec4(col, a);
        }
      `
    });

    const motes = new THREE.Points(moteGeo, moteMat);
    scene.add(motes);

    /* ==========================================================
       3 · FLOATING LEAVES — slow tumble and fall
       ========================================================== */
    const leafGroup = new THREE.Group();
    scene.add(leafGroup);

    const LEAF_COUNT = isMobile ? 7 : 15;
    const leaves = [];

    for (let i = 0; i < LEAF_COUNT; i++) {
      const geo = new THREE.PlaneGeometry(1.5, 2.4);
      const mat = new THREE.MeshBasicMaterial({
        map: texLeaf,
        transparent: true,
        depthWrite: false,
        opacity: 0.20 + Math.random() * 0.30,
        side: THREE.DoubleSide
      });
      mat.color.copy(C.pine).lerp(C.teak, Math.random() * 0.45);

      const mesh = new THREE.Mesh(geo, mat);
      const s = 0.75 + Math.random() * 1.5;
      mesh.scale.set(s, s, s);
      mesh.position.set(
        (Math.random() - 0.5) * 110,
        Math.random() * 80 - 20,
        (Math.random() - 0.5) * 60 - 4
      );
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      mesh.userData = {
        fall: 0.9 + Math.random() * 1.5,
        swayAmp: 2.4 + Math.random() * 4.2,
        swaySpeed: 0.2 + Math.random() * 0.3,
        spinX: (Math.random() - 0.5) * 0.16,
        spinY: (Math.random() - 0.5) * 0.24,
        spinZ: (Math.random() - 0.5) * 0.1,
        phase: Math.random() * Math.PI * 2,
        baseX: mesh.position.x
      };
      leafGroup.add(mesh);
      leaves.push(mesh);
    }

    /* ==========================================================
       4 · LIGHT SHAFTS — soft additive god rays
       ========================================================== */
    const rayGroup = new THREE.Group();
    rayGroup.position.set(16, 14, -34);
    rayGroup.rotation.z = -0.32;
    scene.add(rayGroup);

    const RAY_COUNT = isMobile ? 3 : 6;
    const rays = [];

    const rayGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < RAY_COUNT; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0.05 + Math.random() * 0.055 },
          uColor: { value: new THREE.Color().copy(C.amber).lerp(C.ivory, Math.random() * 0.6) },
          uSeed: { value: Math.random() * 10 }
        },
        vertexShader: /* glsl */`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */`
          uniform float uTime;
          uniform float uOpacity;
          uniform float uSeed;
          uniform vec3 uColor;
          varying vec2 vUv;

          void main() {
            // taper across the width, fade along the length
            float edge = smoothstep(0.0, 0.42, vUv.x) * smoothstep(1.0, 0.58, vUv.x);
            float len  = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.42, vUv.y);
            // slow breathing so shafts feel like moving sunlight
            float breathe = 0.72 + 0.28 * sin(uTime * 0.24 + uSeed);
            float a = edge * len * uOpacity * breathe;
            if (a < 0.004) discard;
            gl_FragColor = vec4(uColor, a);
          }
        `
      });

      const mesh = new THREE.Mesh(rayGeo, mat);
      mesh.scale.set(8 + Math.random() * 14, 130, 1);
      mesh.position.set(-30 + i * (11 + Math.random() * 6), 0, -Math.random() * 12);
      mesh.rotation.z = (Math.random() - 0.5) * 0.14;
      mesh.userData = { swaySpeed: 0.05 + Math.random() * 0.07, phase: Math.random() * 6.28, baseX: mesh.position.x };
      rayGroup.add(mesh);
      rays.push(mesh);
    }

    /* ==========================================================
       5 · DISTANT BIRDS — tiny drifting silhouettes
       ========================================================== */
    const birdGroup = new THREE.Group();
    scene.add(birdGroup);

    const BIRD_COUNT = isMobile ? 3 : 6;
    const birds = [];
    const birdMat = new THREE.LineBasicMaterial({
      color: new THREE.Color('#33413b'),
      transparent: true,
      opacity: 0.42
    });

    for (let i = 0; i < BIRD_COUNT; i++) {
      const g = new THREE.BufferGeometry();
      const pts = new Float32Array([-1, 0, 0, 0, 0.42, 0, 1, 0, 0]);
      g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const line = new THREE.Line(g, birdMat.clone());
      const s = 0.5 + Math.random() * 0.8;
      line.scale.set(s, s, s);
      line.position.set(
        -70 + Math.random() * 140,
        12 + Math.random() * 26,
        -46 - Math.random() * 26
      );
      line.userData = {
        speed: 1.4 + Math.random() * 1.6,
        flap: 3 + Math.random() * 2.4,
        phase: Math.random() * 6.28,
        baseY: line.position.y
      };
      birdGroup.add(line);
      birds.push(line);
    }

    /* ==========================================================
       POINTER PARALLAX
       ========================================================== */
    let targetX = 0, targetY = 0, curX = 0, curY = 0;

    if (env.finePointer !== false) {
      window.addEventListener('mousemove', e => {
        targetX = (e.clientX / window.innerWidth - 0.5) * 2;
        targetY = (e.clientY / window.innerHeight - 0.5) * 2;
      }, { passive: true });
    }

    // Device tilt on mobile
    window.addEventListener('deviceorientation', e => {
      if (e.gamma == null || e.beta == null) return;
      targetX = Math.max(-1, Math.min(1, e.gamma / 34));
      targetY = Math.max(-1, Math.min(1, (e.beta - 45) / 40));
    }, { passive: true });

    /* ==========================================================
       VISIBILITY GATING — never burn frames off-screen
       ========================================================== */
    let heroVisible = true;
    let tabVisible = true;

    const hero = document.getElementById('hero');
    if (hero && 'IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        heroVisible = entries[0].isIntersecting;
      }, { threshold: 0.01 }).observe(hero);
    }
    document.addEventListener('visibilitychange', () => {
      tabVisible = !document.hidden;
    });

    /* ==========================================================
       RESIZE
       ========================================================== */
    let resizeRaf = null;
    window.addEventListener('resize', () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        const w = window.innerWidth, h = window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        moteMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      });
    }, { passive: true });

    /* ==========================================================
       ANIMATION LOOP
       ========================================================== */
    const clock = new THREE.Clock();

    function frame() {
      requestAnimationFrame(frame);
      if (!heroVisible || !tabVisible) return;

      const t = clock.getElapsedTime();
      const dt = Math.min(clock.getDelta(), 0.05);

      // Camera parallax — heavily damped for a cinematic feel
      curX += (targetX - curX) * 0.028;
      curY += (targetY - curY) * 0.028;
      camera.position.x = curX * 3.4;
      camera.position.y = -curY * 2.2;
      camera.lookAt(curX * 0.7, -curY * 0.5, 0);

      // Fog drift
      fogSprites.forEach(sp => {
        const u = sp.userData;
        sp.position.x += u.driftX * dt * 1.9;
        sp.position.y = u.baseY + Math.sin(t * u.bobSpeed + u.phase) * u.bobAmp;
        if (sp.position.x > 92) sp.position.x = -92;
      });

      // Motes
      moteMat.uniforms.uTime.value = t;

      // Leaves
      leaves.forEach(mesh => {
        const u = mesh.userData;
        mesh.position.y -= u.fall * dt * 1.5;
        mesh.position.x = u.baseX + Math.sin(t * u.swaySpeed + u.phase) * u.swayAmp;
        mesh.rotation.x += u.spinX * dt;
        mesh.rotation.y += u.spinY * dt;
        mesh.rotation.z += u.spinZ * dt;
        if (mesh.position.y < -46) {
          mesh.position.y = 52 + Math.random() * 14;
          u.baseX = (Math.random() - 0.5) * 110;
        }
      });

      // Rays breathe and sway
      rays.forEach(mesh => {
        mesh.material.uniforms.uTime.value = t;
        const u = mesh.userData;
        mesh.position.x = u.baseX + Math.sin(t * u.swaySpeed + u.phase) * 2.2;
      });

      // Birds glide with a subtle wing beat
      birds.forEach(line => {
        const u = line.userData;
        line.position.x += u.speed * dt * 2.4;
        line.position.y = u.baseY + Math.sin(t * 0.4 + u.phase) * 1.6;
        const beat = 0.34 + Math.abs(Math.sin(t * u.flap + u.phase)) * 0.5;
        line.scale.y = line.scale.x * beat;
        if (line.position.x > 86) {
          line.position.x = -86;
          u.baseY = 12 + Math.random() * 26;
        }
      });

      renderer.render(scene, camera);
    }

    frame();
  }
}
