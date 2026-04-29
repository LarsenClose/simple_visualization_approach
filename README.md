# Constellation Network Visualization

A self-contained, dependency-free static site for visualizing a typed-edge knowledge graph in 3D and 2D. The example dataset is a 32-node constellation of physics, mathematics, electrical engineering, and RF engineering, but the rendering is generic — swap `data.json` and re-skin the legend to use it for any domain.

This is the visualization referenced in [Human Grokking: Phase Transitions in Semantic Field Saturation (Close, 2026)](https://zenodo.org/records/18627239).

## Quick start

No build step. No `npm install`. Just serve the directory:

```bash
python -m http.server 8000
# then open http://localhost:8000/
```

Or any equivalent (`npx serve`, `caddy file-server`, `php -S`, etc.). Opening `index.html` directly via `file://` will also work for the 3D view, but `data.json` will fail to load on some browsers due to CORS rules on local files — a one-line server avoids that.

## File structure

```
.
├── index.html       # 3D force-directed graph (uses 3d-force-graph + Three.js)
├── app.js           # 3D rendering logic, ESM module
├── index-2d.html    # 2D force-directed graph (D3 only — friendlier for mobile)
├── app-2d.js        # 2D rendering logic
├── style.css        # Shared styles for both views
└── data.json        # The graph data (nodes + edges)
```

The 3D and 2D views read the same `data.json`. They share `style.css`. They are otherwise independent — you can delete one pair if you only want one mode.

## Data schema

Two top-level arrays. Everything else is optional metadata that drives panels and tooltips.

### Nodes

```json
{
  "id": "physics/00_newtonian",
  "domain": "physics",
  "title": "Newtonian Mechanics",
  "level": "foundational",
  "lineCount": 124,
  "termCount": 11,
  "terms": ["Position", "Velocity", "..."],
  "invariant": "Markdown-formatted summary of the structural invariant.",
  "coherenceBridge": "Markdown-formatted longer-form connective tissue."
}
```

| Field             | Required | Drives                                                |
| ----------------- | :------: | ----------------------------------------------------- |
| `id`              |    yes   | Unique key; referenced by edges                       |
| `domain`          |    yes   | Color (see `DOMAIN_COLORS` in `app.js`)               |
| `title`           |    yes   | Sprite label + side-panel header                      |
| `level`           |    yes   | Node geometry: `foundational` / `intermediate` / `advanced` (icosahedron / sphere / octahedron) |
| `terms`           |    no    | Pills in the side panel; also indexed by search       |
| `invariant`       |    no    | "Constellation Invariant" section in the side panel   |
| `coherenceBridge` |    no    | "Coherence Bridge" section in the side panel          |
| `lineCount`       |    no    | Optional sizing/weighting hook                        |
| `termCount`       |    no    | Displayed metadata                                    |

### Edges

```json
{
  "source": "physics/00_newtonian",
  "target": "physics/01_lagrangian_hamiltonian",
  "type": "transform",
  "crossDomain": false,
  "label": "F=ma becomes Euler-Lagrange via variational principle"
}
```

| Field         | Required | Drives                                                              |
| ------------- | :------: | ------------------------------------------------------------------- |
| `source`      |    yes   | Node `id`                                                           |
| `target`      |    yes   | Node `id`                                                           |
| `type`        |    yes   | Edge color + particle count (see `EDGE_TYPE_COLORS` in `app.js`)    |
| `crossDomain` |    no    | Bumps width if true (visual emphasis on inter-domain bridges)       |
| `label`       |    no    | Tooltip text on hover                                               |

## Customizing for your data

Three places to edit:

1. **`data.json`** — replace nodes and edges with your own. Keep the schema above.
2. **`app.js`** — at the top of the file, two dictionaries control the visual encoding:
   - `DOMAIN_COLORS` — one color per `domain` value in your nodes.
   - `EDGE_TYPE_COLORS` — one color per `type` value in your edges. `EDGE_TYPE_PARTICLES` and `EDGE_TYPE_WIDTHS` give per-type animation density and stroke width.
3. **`index.html`** and **`index-2d.html`** — the legend and domain-filter buttons are hand-rolled HTML. Update them to match your `DOMAIN_COLORS` / `EDGE_TYPE_COLORS`.

The level-to-geometry mapping (foundational → icosahedron, intermediate → sphere, advanced → octahedron) is in `app.js`; change it there if you want different shapes or a different number of levels.

## The approach (why it looks the way it does)

A few design choices that aren't obvious from reading the code:

**Force-directed, not laid out.** Both views use D3's force simulation. Nodes are typed (by domain), edges are typed (by morphism), and forces respond to both. There's no manual layout — the graph self-organizes by domain cluster while cross-domain edges pull the clusters into a coherent whole. This is the visual claim the paper makes structurally: domains cohere because of inter-domain morphisms, not in spite of them.

**Edge color = relation kind, not weight.** Most graph viz uses edge thickness for weight. Here, edge color encodes the *type* of the morphism (composition, embedding, bridge, transform, ...). Width is reserved for emphasis on cross-domain bridges. The viewer reads the graph as a category — the type system is right there in the rendering.

**Node geometry = abstraction level.** Foundational concepts are icosahedra (highly symmetric, dense), intermediate are spheres (smooth), advanced are octahedra (sparser). Reading the graph by shape gives you the difficulty gradient at a glance, without reading any text.

**Side panel is content-rich, deliberately.** Click a node and you get terms, invariant, coherence bridge, and connected nodes (clickable to navigate). The graph is meant to be a study tool — you should be able to drill into it for an hour. Tooltips are deliberately terse to force the panel as the primary reading surface.

**3D + 2D split.** The 3D view is more compelling but rough on mobile; the 2D view is the same data and the same panel UX, viewable on a phone. The header bar links between them.

**Minimum dependencies, max portability.** Everything is loaded from CDN. There's no build step, no bundler, no `package.json`, no Node. You can host it on GitHub Pages, an S3 bucket, or a USB stick. The cost of this is reliance on third-party CDN availability — see "Deploying" below.

## Pinned versions

CDN URLs are version-pinned so this repo will keep working even as upstream libraries change:

- `d3@7.9.0`
- `3d-force-graph@1.73.4`
- `three@0.160.0`
- `three-spritetext@1.9.0`
- `marked@12.0.1`

If you fork this and want to update, search the HTML and JS files for the version strings.

## Deploying

Any static host works. Three options:

- **GitHub Pages** — push to a public repo, enable Pages on the default branch, done.
- **Netlify / Vercel / Cloudflare Pages** — drag-and-drop the directory; no build settings required.
- **Self-hosted** — copy the files to any web server. There is no server-side component.

For long-term reliability you may want to vendor the CDN scripts locally (download `d3.min.js`, `3d-force-graph.min.js`, `marked.min.js` and rewrite the `<script src>` to local paths). The Three.js + three-spritetext modules in `app.js` are loaded as ESM from `esm.sh` — vendoring those is more involved (you'd need a bundler), so the simplest fix is to mirror them on your own CDN.

## License

MIT — see `LICENSE`. The example dataset (`data.json`) is part of the *Human Grokking* paper (Close, 2026) and is included under the same permissive terms; please cite the paper if you use it.
