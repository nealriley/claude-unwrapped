# Designing local 3D data experiences

## Choose the question and the visual encoding

| Question | Starting form | What to check |
| --- | --- | --- |
| Which of us uses a word more often? | Aligned scatterplot with an orthographic view | Keep rates comparable across cohorts. Show denominators beside counts. |
| Which words appear together? | A graph with one layout seeded from real message co-occurrence | Define the unit of co-occurrence and edge weight. Show a manageable set of neighbors and label the edge meaning. |
| What happened in this session? | A sequential view with a stage and a transcript | Keep turn order, timestamps, role, and a way to seek directly. |
| What belongs to this project? | Hierarchy, or an orbital layout for known links | Track whether links come from IDs or inference. Keep inferred links identifiable. |
| What is available to explore? | A gallery with previews and one selected experience | Make selection, loading, and returning work with keyboard and browser history. |

Use depth when it helps expose a relationship or orient the viewer. Give exact comparisons a front-on view and a readable numeric inspector. Constrain camera motion during reading and reset the viewpoint when the user changes context. Keep animated lights and materials subordinate to text and data marks.

## Choose the rendering and packaging tools

- Use React Three Fiber for scenes whose selections, filters, and timelines also drive HTML controls. For an R3F exhibit, use the React 19 and R3F 9 pairing. Two Heads uses flat CSS artwork for both characters. [R3F installation](https://r3f.docs.pmnd.rs/getting-started/installation)
- Use vanilla Three.js for small rendering experiments. Learn cameras, scene graphs, materials, raycasting, and `BufferGeometry` before adding engine abstractions. [Three.js examples](https://threejs.org/examples/)
- Use a point buffer for simple marks and instanced meshes when many marks share geometry and material. Label the hovered or selected subset, and keep a readable HTML list. [Drei Instances](https://drei.docs.pmnd.rs/performances/instances)
- Start with WebGL for the exhibit builds. Try WebGPU and TSL on a separate effect first and verify renderer and material compatibility. [Three.js WebGPU renderer](https://threejs.org/manual/pages/webgpurenderer)
- Inline dependencies and exhibit data when shipping a standalone local HTML. Test the actual double-clicked file. Browser rules for fetching adjacent files can differ from localhost. [MDN local file origins](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSRequestNotHttp)

## Code patterns

### Orthographic stage

An orthographic camera preserves apparent size with depth. Place it above and off-axis to show the top and side edges of the stage. The example can be pasted into an R3F app with a sized parent. [R3F Canvas](https://r3f.docs.pmnd.rs/api/canvas)

```jsx
import { Canvas } from '@react-three/fiber'

export function Stage() {
  return (
    <Canvas orthographic camera={{ position: [7, 5, 10], zoom: 70 }}>
      <ambientLight intensity={1.3} />
      <directionalLight position={[3, 5, 4]} intensity={2} />
      <mesh>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#eeb85d" roughness={0.5} />
      </mesh>
    </Canvas>
  )
}
```

### Animate a mesh without re-rendering React on every frame

Use a ref for per-frame geometry changes. Let React track discrete state such as which speaker is active. If an exhibit comes to rest, use demand rendering or pause its animation on exit. [R3F performance patterns](https://r3f.docs.pmnd.rs/advanced/scaling-performance)

```jsx
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils } from 'three'

export function Mouth({ speaking }) {
  const mesh = useRef(null)
  useFrame(({ clock }, delta) => {
    const opening = speaking ? 0.55 + 0.35 * Math.sin(clock.elapsedTime * 18) : 0.12
    mesh.current.scale.y = MathUtils.damp(mesh.current.scale.y, opening, 16, delta)
  })
  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[0.24, 16, 12]} />
      <meshBasicMaterial color="#211727" />
    </mesh>
  )
}
```

### Let the URL control the selected experience

A curated manifest supplies the known local filenames. Store its ID in the fragment so the gallery supports deep links and Back. Mount one iframe from that manifest. Remove it on return so timers, audio, and the GPU context are released with its document.

```js
const experiences = new Map([['two-heads', './two-heads.html']])

function showSelected() {
  const id = location.hash.slice(1)
  const url = experiences.get(id)
  document.querySelector('#gallery').hidden = Boolean(url)
  const host = document.querySelector('#experience')
  host.replaceChildren()
  if (!url) return

  const iframe = document.createElement('iframe')
  iframe.title = 'Two Heads'
  iframe.src = url
  host.append(iframe)
}

addEventListener('hashchange', showSelected)
showSelected()
```

## Before adding an exhibit to the gallery

- Confirm the meaning and source of each axis, node, edge, or timestamp.
- Test initial load, selection, empty data, direct links, and return to gallery.
- Test keyboard and touch controls. Keep text readable and honor reduced-motion preferences. [W3C motion guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions)
- Measure the experience while moving the camera and after leaving it. Clean up observers, event handlers, timers, and media.
- Open the built exhibit from disk and account for every network dependency.
