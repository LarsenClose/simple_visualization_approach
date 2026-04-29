import * as THREE from "https://esm.sh/three";
import SpriteText from "https://esm.sh/three-spritetext";
import { UnrealBloomPass } from "https://esm.sh/three/examples/jsm/postprocessing/UnrealBloomPass.js";

// ===== CONSTANTS =====

const DOMAIN_COLORS = {
  physics: "#5B8DEF",
  math: "#EF5B5B",
  ee: "#5BEF7B",
  rf: "#EFB85B",
};

const EDGE_TYPE_COLORS = {
  composition:   "#C0C0C0",
  embedding:     "#00E5FF",
  bridge:        "#FFD700",
  transform:     "#FF00FF",
  constitutive:  "#FF6B6B",
  quantization:  "#7B68EE",
  conservation:  "#00FF7F",
  limit:         "#FF8C00",
  lifting:       "#E040FB",
  duality:       "#40E0D0",
  approximation: "#FFB74D",
};

const EDGE_TYPE_PARTICLES = {
  composition:   4,
  embedding:     3,
  bridge:        5,
  transform:     3,
  constitutive:  2,
  quantization:  3,
  conservation:  2,
  limit:         2,
  lifting:       3,
  duality:       4,
  approximation: 2,
};

const EDGE_TYPE_WIDTHS = {
  bridge: 3,
  embedding: 1.5,
  transform: 1.5,
  duality: 1.5,
};
const CROSS_DOMAIN_WIDTH = 1.5;
const DEFAULT_LINK_WIDTH = 0.5;

const LEVEL_Z = {
  foundational: -100,
  intermediate: 0,
  advanced: 100,
};

const DOMAIN_CENTERS = {
  physics: { x: -1, y: -1 },
  math:    { x: 1,  y: -1 },
  ee:      { x: -1, y: 1 },
  rf:      { x: 1,  y: 1 },
};

const ACRONYMS = new Set(["qft", "ac", "em", "sdr", "rf", "ee"]);

// ===== STATE =====

let graphData;
let graph;
let selectedNode = null;
let activeDomains = new Set(["physics", "math", "ee", "rf"]);
let searchQuery = "";
let nodeMap = new Map();
let degreeCentrality = new Map();
let mousePos = { x: 0, y: 0 };
let isFlattened = false;
let savedFz = new Map();

// ===== UTILITIES =====

function shortName(id) {
  const stem = id.split("/")[1] || id;
  return stem
    .replace(/^\d+_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w+/g, (w) =>
      ACRONYMS.has(w.toLowerCase())
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1)
    );
}

function nodeSize(d) {
  const minS = 4, maxS = 10;
  const minT = 5, maxT = 20;
  const t = Math.sqrt(
    (Math.max(minT, Math.min(maxT, d.termCount)) - minT) / (maxT - minT)
  );
  return minS + t * (maxS - minS);
}

function getFirstSentence(text) {
  if (!text) return "";
  const clean = text.replace(/\*\*/g, "");
  const m = clean.match(/^[^.!?]+[.!?]/);
  return m ? m[0].trim() : clean.slice(0, 120) + "...";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function isNodeVisible(d) {
  return activeDomains.has(d.domain);
}

function isEdgeVisible(e) {
  const src = typeof e.source === "object" ? e.source : nodeMap.get(e.source);
  const tgt = typeof e.target === "object" ? e.target : nodeMap.get(e.target);
  return src && tgt && isNodeVisible(src) && isNodeVisible(tgt);
}

// ===== DEGREE CENTRALITY =====

function computeDegreeCentrality(nodes, edges) {
  const degree = new Map();
  nodes.forEach(n => degree.set(n.id, 0));
  edges.forEach(e => {
    const sid = typeof e.source === "object" ? e.source.id : e.source;
    const tid = typeof e.target === "object" ? e.target.id : e.target;
    degree.set(sid, (degree.get(sid) || 0) + 1);
    degree.set(tid, (degree.get(tid) || 0) + 1);
  });
  let maxDeg = 0;
  degree.forEach(v => { if (v > maxDeg) maxDeg = v; });
  if (maxDeg === 0) maxDeg = 1;
  const normalized = new Map();
  degree.forEach((v, k) => normalized.set(k, v / maxDeg));
  return normalized;
}

// ===== CREATE NODE THREE.JS OBJECT =====

function createNodeObject(node) {
  const size = nodeSize(node);
  const color = new THREE.Color(DOMAIN_COLORS[node.domain]);
  const centrality = degreeCentrality.get(node.id) || 0;

  // Geometry by level
  let geometry;
  switch (node.level) {
    case "foundational":
      geometry = new THREE.IcosahedronGeometry(size, 0);
      break;
    case "advanced":
      geometry = new THREE.OctahedronGeometry(size, 0);
      break;
    default:
      geometry = new THREE.SphereGeometry(size, 16, 12);
      break;
  }

  // Material with emissive glow scaled by degree centrality
  const emissiveIntensity = 0.2 + centrality * 0.8;
  const material = new THREE.MeshLambertMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: emissiveIntensity,
    transparent: true,
    opacity: 0.9,
  });

  const mesh = new THREE.Mesh(geometry, material);

  // Outer glow sphere
  const glowSize = size * (1.3 + centrality * 0.5);
  const glowGeometry = new THREE.SphereGeometry(glowSize, 12, 8);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.08 + centrality * 0.12,
    side: THREE.BackSide,
  });
  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);

  // SpriteText label
  const label = new SpriteText(node.shortName, 6, "#e6e6e6");
  label.fontFace = "Inter, sans-serif";
  label.fontWeight = "500";
  label.backgroundColor = "rgba(0,0,0,0.5)";
  label.padding = 2;
  label.borderRadius = 3;
  label.position.y = -(size + 7);

  // Group
  const group = new THREE.Group();
  group.add(mesh);
  group.add(glowMesh);
  group.add(label);

  // Store references for interaction
  group.__mainMesh = mesh;
  group.__glowMesh = glowMesh;
  group.__label = label;
  group.__nodeData = node;

  return group;
}

// ===== TOOLTIP =====

function showTooltip(title, body, domain) {
  const tooltipEl = document.getElementById("tooltip");
  tooltipEl.style.display = "block";
  tooltipEl.style.borderTopColor = domain ? (DOMAIN_COLORS[domain] || "") : "";
  document.getElementById("tooltip-title").textContent = title;
  document.getElementById("tooltip-body").textContent = body || "";
  positionTooltip();
}

function positionTooltip() {
  const tooltipEl = document.getElementById("tooltip");
  const container = document.getElementById("graph-container");
  const rect = container.getBoundingClientRect();
  let x = mousePos.x - rect.left + 16;
  let y = mousePos.y - rect.top - 10;
  const tw = tooltipEl.offsetWidth;
  if (x + tw > rect.width - 20) x = mousePos.x - rect.left - tw - 16;
  tooltipEl.style.left = x + "px";
  tooltipEl.style.top = y + "px";
}

function hideTooltip() {
  document.getElementById("tooltip").style.display = "none";
}

// ===== SELECTION / DIMMING =====

function dimGraph(selectedId) {
  if (!graphData) return;

  const connectedIds = new Set([selectedId]);
  graphData.edges.forEach(e => {
    const sid = typeof e.source === "object" ? e.source.id : e.source;
    const tid = typeof e.target === "object" ? e.target.id : e.target;
    if (sid === selectedId) connectedIds.add(tid);
    if (tid === selectedId) connectedIds.add(sid);
  });

  graphData.nodes.forEach(n => {
    const obj = n.__threeObj;
    if (!obj) return;
    const isConnected = connectedIds.has(n.id);
    const isSelected = n.id === selectedId;
    const opacity = isConnected ? 0.9 : 0.08;
    const labelOpacity = isConnected ? 1.0 : 0.05;

    obj.__mainMesh.material.opacity = opacity;
    obj.__mainMesh.material.emissiveIntensity = isSelected ? 1.2 : (isConnected ? 0.5 : 0.05);
    obj.__glowMesh.material.opacity = isConnected ? (0.08 + (degreeCentrality.get(n.id) || 0) * 0.12) : 0.01;
    obj.__label.material.opacity = labelOpacity;
  });
}

function undimGraph() {
  if (!graphData) return;
  graphData.nodes.forEach(n => {
    const obj = n.__threeObj;
    if (!obj) return;
    const centrality = degreeCentrality.get(n.id) || 0;
    obj.__mainMesh.material.opacity = 0.9;
    obj.__mainMesh.material.emissiveIntensity = 0.2 + centrality * 0.8;
    obj.__glowMesh.material.opacity = 0.08 + centrality * 0.12;
    obj.__label.material.opacity = 1.0;
  });
}

// ===== NODE SELECTION =====

function selectNode(d) {
  hideTooltip();

  if (selectedNode && selectedNode.id === d.id) {
    deselectNode();
    return;
  }

  selectedNode = d;
  dimGraph(d.id);
  openPanel(d);

  // Camera fly-to
  const distance = 180;
  const nodePos = { x: d.x || 0, y: d.y || 0, z: d.z || 0 };
  graph.cameraPosition(
    { x: nodePos.x, y: nodePos.y, z: nodePos.z + distance },
    nodePos,
    1000
  );
}

function deselectNode() {
  selectedNode = null;
  undimGraph();
  closePanel();
}

// ===== PANEL (pure DOM) =====

function openPanel(d) {
  const panel = document.getElementById("side-panel");
  panel.setAttribute("data-domain", d.domain);
  panel.classList.add("visible");

  const dot = document.getElementById("panel-domain-dot");
  dot.style.backgroundColor = DOMAIN_COLORS[d.domain];

  document.getElementById("panel-domain-name").textContent =
    d.domain.toUpperCase();
  document.getElementById("panel-domain-badge").setAttribute("data-domain", d.domain);

  document.getElementById("panel-title").textContent = d.title;
  document.getElementById("panel-level").textContent = d.level;

  const termsEl = document.getElementById("panel-terms");
  termsEl.innerHTML = d.terms
    .map((t) => `<span class="panel-term">${escapeHtml(t)}</span>`)
    .join("");

  const invariantEl = document.getElementById("panel-invariant");
  invariantEl.innerHTML =
    typeof marked !== "undefined"
      ? marked.parse(d.invariant || "")
      : escapeHtml(d.invariant || "");

  const bridgeEl = document.getElementById("panel-coherence-bridge");
  bridgeEl.innerHTML =
    typeof marked !== "undefined"
      ? marked.parse(d.coherenceBridge || "")
      : escapeHtml(d.coherenceBridge || "");

  const connEl = document.getElementById("panel-connections");
  const connections = [];
  graphData.edges.forEach((e) => {
    const sid = typeof e.source === "object" ? e.source.id : e.source;
    const tid = typeof e.target === "object" ? e.target.id : e.target;
    if (sid === d.id) {
      const target = nodeMap.get(tid);
      if (target)
        connections.push({ node: target, type: e.type, label: e.label, dir: "out" });
    }
    if (tid === d.id) {
      const source = nodeMap.get(sid);
      if (source)
        connections.push({ node: source, type: e.type, label: e.label, dir: "in" });
    }
  });

  connEl.innerHTML = connections
    .map(
      (c) =>
        `<div class="connection-item" data-id="${c.node.id}" style="--edge-color: ${EDGE_TYPE_COLORS[c.type] || '#888'}">` +
        `<span class="dot" style="background:${DOMAIN_COLORS[c.node.domain]}"></span>` +
        `<span>${c.dir === "out" ? "\u2192" : "\u2190"} ${escapeHtml(c.node.title)}</span>` +
        `<span class="edge-type">${escapeHtml(c.type)}</span>` +
        `</div>`
    )
    .join("");

  connEl.querySelectorAll(".connection-item").forEach((el) => {
    el.addEventListener("click", () => {
      const targetId = el.getAttribute("data-id");
      const targetNode = nodeMap.get(targetId);
      if (targetNode) {
        selectNode(targetNode);
      }
    });
  });
}

function closePanel() {
  const panel = document.getElementById("side-panel");
  panel.classList.remove("visible");
  panel.classList.remove("panel-expanded");
  // Reset expand button icon
  const btn = document.getElementById("panel-expand");
  if (btn) {
    btn.querySelector(".panel-expand-icon-plus").style.display = "";
    btn.querySelector(".panel-expand-icon-minus").style.display = "none";
  }
}

// ===== STATS =====

function updateStats() {
  const visibleNodes = graphData.nodes.filter(isNodeVisible);
  const visibleEdges = graphData.edges.filter(isEdgeVisible);
  const crossDomain = visibleEdges.filter((e) => e.crossDomain).length;

  document.getElementById("stat-nodes").textContent = visibleNodes.length;
  document.getElementById("stat-edges").textContent = visibleEdges.length;
  document.getElementById("stats-nodes").textContent = visibleNodes.length;
  document.getElementById("stats-edges").textContent = visibleEdges.length;
  document.getElementById("stats-cross-domain").textContent = crossDomain;
}

// ===== CAMERA PRESETS =====

const CAMERA_PRESETS = {
  top:   { position: { x: 0, y: 0, z: 500 },  lookAt: { x: 0, y: 0, z: 0 } },
  front: { position: { x: 0, y: -500, z: 0 },  lookAt: { x: 0, y: 0, z: 0 } },
  side:  { position: { x: 500, y: 0, z: 0 },   lookAt: { x: 0, y: 0, z: 0 } },
};

function setCameraView(preset) {
  if (!graph) return;
  const p = CAMERA_PRESETS[preset];
  if (!p) return;
  graph.cameraPosition(p.position, p.lookAt, 1000);
}

// ===== FLATTEN TOGGLE =====

function toggleFlatten() {
  if (!graphData || !graph) return;
  isFlattened = !isFlattened;

  if (isFlattened) {
    graphData.nodes.forEach(n => {
      savedFz.set(n.id, n.fz);
      n.fz = 0;
    });
  } else {
    graphData.nodes.forEach(n => {
      n.fz = savedFz.get(n.id) ?? (LEVEL_Z[n.level] || 0);
    });
  }

  graph.d3ReheatSimulation();

  // Auto-switch to top view when flattening so the 2D layout is visible
  if (isFlattened) {
    setCameraView("top");
  }

  const btn = document.getElementById("btn-flatten");
  if (btn) btn.classList.toggle("active", isFlattened);
}

// ===== CONTROLS =====

function setupControls() {
  document.querySelectorAll(".domain-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const domain = btn.getAttribute("data-domain");
      if (activeDomains.has(domain)) {
        if (activeDomains.size <= 1) return;
        activeDomains.delete(domain);
        btn.classList.remove("active");
      } else {
        activeDomains.add(domain);
        btn.classList.add("active");
      }
      applyFilters();
    });
  });

  const searchInput = document.getElementById("search-input");
  const searchClear = document.getElementById("search-clear");

  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    searchClear.style.display = searchQuery ? "block" : "none";
    applySearch();
  });

  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchQuery = "";
    searchClear.style.display = "none";
    applySearch();
  });

  document.getElementById("panel-close").addEventListener("click", () => {
    deselectNode();
  });

  // Panel expand toggle
  document.getElementById("panel-expand")?.addEventListener("click", () => {
    const panel = document.getElementById("side-panel");
    const expanded = panel.classList.toggle("panel-expanded");
    const btn = document.getElementById("panel-expand");
    btn.setAttribute("aria-label", expanded ? "Collapse panel" : "Expand panel");
    btn.setAttribute("title", expanded ? "Collapse panel" : "Expand panel");
    btn.querySelector(".panel-expand-icon-plus").style.display = expanded ? "none" : "";
    btn.querySelector(".panel-expand-icon-minus").style.display = expanded ? "" : "none";
  });

  document.addEventListener("mousemove", (e) => {
    mousePos.x = e.clientX;
    mousePos.y = e.clientY;
  });

  window.addEventListener("resize", () => {
    if (!graph) return;
    const container = document.getElementById("graph-container");
    graph.width(container.offsetWidth);
    graph.height(container.offsetHeight);
  });

  // Legend collapse toggle
  document.getElementById("legend-toggle")?.addEventListener("click", () => {
    document.getElementById("legend")?.classList.toggle("legend-collapsed");
  });

  // View preset buttons
  document.getElementById("btn-view-top")?.addEventListener("click", () => setCameraView("top"));
  document.getElementById("btn-view-front")?.addEventListener("click", () => setCameraView("front"));
  document.getElementById("btn-view-side")?.addEventListener("click", () => setCameraView("side"));
  document.getElementById("btn-flatten")?.addEventListener("click", () => toggleFlatten());
}

function applyFilters() {
  if (!graphData || !graph) return;

  graphData.nodes.forEach(n => {
    const obj = n.__threeObj;
    if (obj) {
      obj.visible = isNodeVisible(n);
    }
  });

  graph.linkVisibility(e => isEdgeVisible(e));

  if (selectedNode && !isNodeVisible(selectedNode)) {
    deselectNode();
  }

  updateStats();
}

function applySearch() {
  if (!graphData) return;

  if (!searchQuery) {
    undimGraph();
    return;
  }

  const matches = new Set();
  graphData.nodes.forEach((n) => {
    if (!isNodeVisible(n)) return;
    const searchFields = [
      n.title,
      n.domain,
      n.shortName,
      ...n.terms,
    ]
      .join(" ")
      .toLowerCase();
    if (searchFields.includes(searchQuery)) {
      matches.add(n.id);
    }
  });

  graphData.nodes.forEach(n => {
    const obj = n.__threeObj;
    if (!obj) return;
    const isMatch = matches.has(n.id);
    obj.__mainMesh.material.opacity = isMatch ? 0.9 : 0.08;
    obj.__mainMesh.material.emissiveIntensity = isMatch ? 0.8 : 0.05;
    obj.__glowMesh.material.opacity = isMatch ? 0.15 : 0.01;
    obj.__label.material.opacity = isMatch ? 1.0 : 0.05;
  });
}

// ===== INIT =====

function init(data) {
  graphData = data;

  data.nodes.forEach((n) => {
    n.shortName = shortName(n.id);
    n.fz = LEVEL_Z[n.level] || 0; // Pin Z to level layer
    nodeMap.set(n.id, n);
  });

  degreeCentrality = computeDegreeCentrality(data.nodes, data.edges);

  const container = document.getElementById("graph-3d");
  const width = container.offsetWidth;
  const height = container.offsetHeight;

  const spread = 120;

  graph = ForceGraph3D({ controlType: "orbit" })(container)
    .width(width)
    .height(height)
    .backgroundColor("#0d1117")
    .graphData({ nodes: data.nodes, links: data.edges })

    // Node rendering
    .nodeId("id")
    .nodeThreeObject(node => createNodeObject(node))
    .nodeThreeObjectExtend(false)

    // Edge rendering
    .linkSource("source")
    .linkTarget("target")
    .linkColor(e => EDGE_TYPE_COLORS[e.type] || "#888")
    .linkOpacity(0.4)
    .linkWidth(e => EDGE_TYPE_WIDTHS[e.type] || (e.crossDomain ? CROSS_DOMAIN_WIDTH : DEFAULT_LINK_WIDTH))
    .linkVisibility(e => isEdgeVisible(e))

    // Directional particles
    .linkDirectionalParticles(e => EDGE_TYPE_PARTICLES[e.type] || 2)
    .linkDirectionalParticleWidth(e => EDGE_TYPE_WIDTHS[e.type] ? 2.5 : 1.2)
    .linkDirectionalParticleColor(e => EDGE_TYPE_COLORS[e.type] || "#888")
    .linkDirectionalParticleSpeed(0.005)

    // Forces
    .d3Force("link", d3.forceLink()
      .id(d => d.id)
      .distance(d => d.crossDomain ? 140 : 80)
      .strength(d => d.crossDomain ? 0.15 : 0.4)
    )
    .d3Force("charge", d3.forceManyBody().strength(-120).distanceMax(400))
    .d3Force("x", d3.forceX(d => {
      const c = DOMAIN_CENTERS[d.domain] || { x: 0 };
      return c.x * spread;
    }).strength(0.15))
    .d3Force("y", d3.forceY(d => {
      const c = DOMAIN_CENTERS[d.domain] || { y: 0 };
      return c.y * spread;
    }).strength(0.15))
    .d3Force("collide", d3.forceCollide(d => nodeSize(d) + 4))

    // Warm-up
    .warmupTicks(80)
    .cooldownTime(3000)

    // Interactions
    .onNodeClick((node) => {
      selectNode(node);
    })
    .onNodeHover((node) => {
      container.style.cursor = node ? "pointer" : "default";
      if (node && !selectedNode) {
        showTooltip(node.title, getFirstSentence(node.invariant), node.domain);
      } else if (!node) {
        hideTooltip();
      }
    })
    .onBackgroundClick(() => {
      deselectNode();
      hideTooltip();
    });

  // Set camera after initial layout settles
  graph.onEngineStop(() => {
    if (!graph.__initialPositioned) {
      graph.__initialPositioned = true;
      graph.cameraPosition({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 0 }, 0);
    }
  });

  // Lighting
  const scene = graph.scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
  dirLight.position.set(100, 200, 300);
  scene.add(dirLight);

  // Bloom post-processing (threshold-based, only bright emissive surfaces bloom)
  try {
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.8,   // strength
      0.4,   // radius
      0.7    // threshold
    );
    graph.postProcessingComposer().addPass(bloomPass);
  } catch (err) {
    console.warn("Bloom post-processing unavailable:", err.message);
  }

  setupControls();
  updateStats();
}

// ===== LOAD DATA =====

d3.json("data.json").then((data) => {
  init(data);
});
