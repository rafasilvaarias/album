<script lang="ts">

  let svgEl: SVGSVGElement;

  function downloadJpg(size = 1500) {
    const xml = new XMLSerializer().serializeToString(svgEl);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff'; // JPG has no transparency
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob!);
          a.download = 'curve.jpg';
          a.click();
          URL.revokeObjectURL(a.href);
        },
        'image/jpeg',
        0.95
      );
    };
    img.src = url;
  }

  type Vector = { position: number; rotation: number; scale: number };

  // Not defined in your snippet. 8 matches your 8x8 grid, so adjust if yours differs.
  const GRID = 8;

  const KICK_VECTORS: Vector[] = [
    { position: Math.random() * 360, rotation: Math.random() * 720 + 180, scale: Math.random() * 0.5 + 0.5 },
    { position: Math.random() * 360, rotation: - Math.random() * 720 + 180, scale: Math.random() * 0.5 + 0.5 },
    { position: Math.random() * 360, rotation: Math.random() * 1440 + 720, scale: Math.random() * 0.5 + 0.5},
    { position: Math.random() * 360, rotation: - Math.random() * 720 + 720, scale: Math.random() * 0.5 + 0.5}
  ];

  function getCartesianCoordinates(progress: number, vectors: Vector[]) {
    const endPoint = [7.5, 7.5];
    const startPoint = [-0.5, -0.5];
    let x = startPoint[0] + (endPoint[0] - startPoint[0]) * progress;
    let y = startPoint[1] + (endPoint[1] - startPoint[1]) * progress;
    let factor = (0.5 - Math.abs(progress - 0.5)) * 2;
    let scale = 7 / vectors.length * 1.2;
    for (const vector of vectors) {
      const angle = (vector.position + vector.rotation * progress) * (Math.PI / 180);
      x += scale * factor * vector.scale * Math.cos(angle);
      y += scale * factor * vector.scale * Math.sin(angle);
    }
    // clip x and y value between 0 and 7
    x = Math.max(0, Math.min(7, x));
    y = Math.max(0, Math.min(7, y));
    return { x, y };
  }

  export function tangent(progress: number, vectors: Vector[], scale: number = 0.5) {
    const MIN = 0;
    const MAX = 7;

    const a = getCartesianCoordinates(progress, vectors);
    const b = getCartesianCoordinates(progress - 1 / 100, vectors);
    const factor = (0.5 - progress) * 100 * scale;

    const tx = (a.x - b.x) * factor;
    const ty = (a.y - b.y) * factor;

    // largest fraction (0..1) of the vector that keeps a + vector inside [MIN, MAX]
    let limit = 1;
    if (tx > 0) limit = Math.min(limit, (MAX - a.x) / tx);
    else if (tx < 0) limit = Math.min(limit, (MIN - a.x) / tx);
    if (ty > 0) limit = Math.min(limit, (MAX - a.y) / ty);
    else if (ty < 0) limit = Math.min(limit, (MIN - a.y) / ty);

    return { x: tx * limit, y: ty * limit };
  }

  const POINTS = 100;
  const TANGENT_SCALE = 1; // raise this to make the tangent lines longer

  // sample progress from 0 to 1
  const points = Array.from({ length: POINTS + 1 }, (_, i) =>
    getCartesianCoordinates(i / POINTS, KICK_VECTORS)
  );

  // tangent at each sample point (raw, math coordinates)
  const tangents = Array.from({ length: POINTS + 1 }, (_, i) =>
    tangent(i / POINTS, KICK_VECTORS)
  );

  // view box: fit all points with padding
  const pad = 1;
  const minX = Math.min(...points.map((p) => p.x)) - pad;
  const maxX = Math.max(...points.map((p) => p.x)) + pad;
  const minY = Math.min(...points.map((p) => p.y)) - pad;
  const maxY = Math.max(...points.map((p) => p.y)) + pad;
  const w = maxX - minX;
  const h = maxY - minY;

  // flip Y so up is up (SVG's Y axis points down)
  const toSvg = (p: { x: number; y: number }) => ({ x: p.x, y: maxY - (p.y - minY) });

  const svgPoints = points.map(toSvg);
  const path = svgPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  // tangent segments in SVG space: start at the point, end at point + tangent (dy flipped)
  const svgTangents = svgPoints.map((p, i) => ({
    x1: p.x,
    y1: p.y,
    x2: p.x + tangents[i].x,
    y2: p.y - tangents[i].y
  }));
</script>

<button on:click={() => downloadJpg()}>Download JPG</button>



<svg bind:this={svgEl} viewBox="{minX} {minY} {w} {h}" width="500" height="500" style="border:1px solid #ccc">
  <defs>
    <!-- arrowhead; userSpaceOnUse so its size is in the same units as the viewBox -->
    <marker
      id="arrow"
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerUnits="userSpaceOnUse"
      markerWidth="0.1"
      markerHeight="0.1"
      orient="auto"
    >
      <path d="M0,0 L10,5 L0,10 z" fill="lightgrey" />
    </marker>
  </defs>

  <!-- the curve -->
  <path d={path} fill="none" stroke="green" stroke-width="0.05" />

  <!-- tangents: seagreen, 50% opacity, with arrowheads -->
  <g opacity="0.6">
    {#each svgTangents as t}
      {#if Math.hypot(t.x2 - t.x1, t.y2 - t.y1) > 0.01}
        <line
          x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke="lightgrey"
          stroke-width="0.02"
          marker-end="url(#arrow)"
        />
      {/if}
    {/each}
  </g>

  <!-- sample points -->
  {#each svgPoints as p, i}
    <circle cx={p.x} cy={p.y} r={i === 0 ? 0.05 : i === POINTS ? 0.05 : 0.03} fill={i === 0 ? 'black' : i === POINTS ? 'red' : 'lightgreen'} />
  {/each}
</svg>