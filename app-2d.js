(function () {
  "use strict";

  const DOMAIN_COLORS = {
    physics: "#5B8DEF",
    math: "#EF5B5B",
    ee: "#5BEF7B",
    rf: "#EFB85B",
  };

  const KEYSTONE_NODES = new Set([
    "physics/01_lagrangian_hamiltonian",
    "math/07_profunctors_enriched",
  ]);

  const DOMAIN_CENTERS = {
    physics: { x: -1, y: -1 },
    math: { x: 1, y: -1 },
    ee: { x: -1, y: 1 },
    rf: { x: 1, y: 1 },
  };

  let graphData;
  let simulation;
  let selectedNode = null;
  let activeDomains = new Set(["physics", "math", "ee", "rf"]);
  let searchQuery = "";

  const svg = d3.select("#graph-svg");
  const graphLayer = svg.select("#graph-layer");
  const edgesLayer = svg.select("#edges-layer");
  const nodesLayer = svg.select("#nodes-layer");
  const tooltip = d3.select("#tooltip");

  const ACRONYMS = new Set(["qft", "ac", "em", "sdr", "rf", "ee"]);

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

  function nodeRadius(d) {
    const minR = 15, maxR = 35;
    const minT = 5, maxT = 20;
    const t = Math.sqrt(
      (Math.max(minT, Math.min(maxT, d.termCount)) - minT) / (maxT - minT)
    );
    return minR + t * (maxR - minR);
  }

  function getFirstSentence(text) {
    if (!text) return "";
    const clean = text.replace(/\*\*/g, "");
    const m = clean.match(/^[^.!?]+[.!?]/);
    return m ? m[0].trim() : clean.slice(0, 120) + "...";
  }

  function isNodeVisible(d) {
    return activeDomains.has(d.domain);
  }

  function isEdgeVisible(e) {
    const src = typeof e.source === "object" ? e.source : nodeMap.get(e.source);
    const tgt = typeof e.target === "object" ? e.target : nodeMap.get(e.target);
    return src && tgt && isNodeVisible(src) && isNodeVisible(tgt);
  }

  let nodeMap = new Map();

  function init(data) {
    graphData = data;
    data.nodes.forEach((n) => {
      n.shortName = shortName(n.id);
      n.r = nodeRadius(n);
      nodeMap.set(n.id, n);
    });

    const width = window.innerWidth;
    const height = window.innerHeight - 60;

    data.nodes.forEach((n) => {
      const c = DOMAIN_CENTERS[n.domain] || { x: 0, y: 0 };
      n.x = width / 2 + c.x * width * 0.2 + (Math.random() - 0.5) * 80;
      n.y = height / 2 + c.y * height * 0.2 + (Math.random() - 0.5) * 80;
    });

    setupSimulation(data, width, height);
    renderEdges(data.edges);
    renderNodes(data.nodes);
    setupZoom();
    setupControls();
    updateStats();
  }

  function setupSimulation(data, width, height) {
    simulation = d3
      .forceSimulation(data.nodes)
      .force(
        "link",
        d3
          .forceLink(data.edges)
          .id((d) => d.id)
          .distance((d) => (d.crossDomain ? 200 : 120))
          .strength((d) => (d.crossDomain ? 0.15 : 0.4))
      )
      .force("charge", d3.forceManyBody().strength(-300).distanceMax(500))
      .force(
        "x",
        d3
          .forceX((d) => {
            const c = DOMAIN_CENTERS[d.domain] || { x: 0 };
            return width / 2 + c.x * width * 0.2;
          })
          .strength(0.12)
      )
      .force(
        "y",
        d3
          .forceY((d) => {
            const c = DOMAIN_CENTERS[d.domain] || { y: 0 };
            return height / 2 + c.y * height * 0.2;
          })
          .strength(0.12)
      )
      .force(
        "collide",
        d3.forceCollide((d) => d.r + 8)
      )
      .on("tick", ticked);
  }

  let linkSelection, nodeSelection;

  function renderEdges(edges) {
    linkSelection = edgesLayer
      .selectAll("line.link")
      .data(edges, (d) => d.source.id || d.source + "-" + (d.target.id || d.target))
      .join("line")
      .attr("class", "link")
      .attr("stroke", (d) => {
        if (d.crossDomain) return "rgba(255,255,255,0.2)";
        const src = typeof d.source === "object" ? d.source : nodeMap.get(d.source);
        return src ? DOMAIN_COLORS[src.domain] : "#888";
      })
      .attr("stroke-opacity", (d) => (d.crossDomain ? 0.15 : 0.25))
      .attr("stroke-width", (d) => (d.crossDomain ? 1 : 1.5))
      .attr("stroke-dasharray", (d) => (d.crossDomain ? "4,4" : null))
      .attr("marker-end", (d) => {
        if (d.crossDomain) return "url(#arrowhead-cross)";
        const src = typeof d.source === "object" ? d.source : nodeMap.get(d.source);
        return src ? `url(#arrowhead-${src.domain})` : "url(#arrowhead-default)";
      })
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("stroke-opacity", 0.8).attr("stroke-width", 2.5);
        showTooltip(event, d.label, d.type);
      })
      .on("mousemove", function (event) {
        moveTooltip(event);
      })
      .on("mouseleave", function (event, d) {
        d3.select(this)
          .attr("stroke-opacity", d.crossDomain ? 0.15 : 0.25)
          .attr("stroke-width", d.crossDomain ? 1 : 1.5);
        hideTooltip();
      });
  }

  function renderNodes(nodes) {
    const nodeGroup = nodesLayer
      .selectAll("g.node")
      .data(nodes, (d) => d.id)
      .join("g")
      .attr("class", "node")
      .style("cursor", "pointer")
      .call(
        d3
          .drag()
          .on("start", dragStarted)
          .on("drag", dragged)
          .on("end", dragEnded)
      );

    nodeGroup.each(function (d) {
      const g = d3.select(this);

      if (KEYSTONE_NODES.has(d.id)) {
        g.append("circle")
          .attr("class", "keystone-ring")
          .attr("r", d.r + 6)
          .attr("fill", "none")
          .attr("stroke", DOMAIN_COLORS[d.domain])
          .attr("stroke-width", 2)
          .attr("stroke-opacity", 0.6);
      }

      g.append("circle")
        .attr("r", d.r)
        .attr("fill", DOMAIN_COLORS[d.domain])
        .attr("fill-opacity", 0.85)
        .attr("stroke", DOMAIN_COLORS[d.domain])
        .attr("stroke-width", 1.5)
        .attr("stroke-opacity", 0.4)
        .attr("filter", `url(#glow-${d.domain})`);

      g.append("text")
        .attr("class", "node-label")
        .attr("text-anchor", "middle")
        .attr("dy", d.r + 16)
        .attr("filter", "url(#text-shadow)")
        .text(d.shortName);
    });

    nodeGroup
      .on("mouseenter", function (event, d) {
        if (selectedNode) return;
        d3.select(this).select("circle:not(.keystone-ring)").transition().duration(200).attr("r", d.r * 1.3);
        showTooltip(event, d.title, getFirstSentence(d.invariant));
      })
      .on("mousemove", function (event) {
        moveTooltip(event);
      })
      .on("mouseleave", function (event, d) {
        if (selectedNode) return;
        d3.select(this).select("circle:not(.keystone-ring)").transition().duration(200).attr("r", d.r);
        hideTooltip();
      })
      .on("click", function (event, d) {
        event.stopPropagation();
        selectNode(d);
      })
      .on("dblclick", function (event, d) {
        event.stopPropagation();
        zoomToNode(d);
      });

    nodeSelection = nodeGroup;
  }

  function ticked() {
    linkSelection
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        return d.target.x - (dx / dist) * d.target.r;
      })
      .attr("y2", (d) => {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        return d.target.y - (dy / dist) * d.target.r;
      });

    nodeSelection.attr("transform", (d) => `translate(${d.x},${d.y})`);
  }

  function showTooltip(event, title, body) {
    tooltip
      .style("display", "block")
      .select("#tooltip-title")
      .text(title);
    tooltip.select("#tooltip-body").text(body || "");
    moveTooltip(event);
  }

  function moveTooltip(event) {
    const container = document.getElementById("graph-container");
    const rect = container.getBoundingClientRect();
    let x = event.clientX - rect.left + 16;
    let y = event.clientY - rect.top - 10;
    const tw = tooltip.node().offsetWidth;
    if (x + tw > rect.width - 20) x = event.clientX - rect.left - tw - 16;
    tooltip.style("left", x + "px").style("top", y + "px");
  }

  function hideTooltip() {
    tooltip.style("display", "none");
  }

  function selectNode(d) {
    hideTooltip();

    if (selectedNode && selectedNode.id === d.id) {
      deselectNode();
      return;
    }

    selectedNode = d;

    const connectedIds = new Set([d.id]);
    graphData.edges.forEach((e) => {
      const sid = typeof e.source === "object" ? e.source.id : e.source;
      const tid = typeof e.target === "object" ? e.target.id : e.target;
      if (sid === d.id) connectedIds.add(tid);
      if (tid === d.id) connectedIds.add(sid);
    });

    nodeSelection.classed("dimmed", (n) => !connectedIds.has(n.id));
    nodeSelection.classed("highlighted", (n) => n.id === d.id);

    linkSelection.classed("dimmed", (e) => {
      const sid = typeof e.source === "object" ? e.source.id : e.source;
      const tid = typeof e.target === "object" ? e.target.id : e.target;
      return sid !== d.id && tid !== d.id;
    });
    linkSelection.classed("highlighted", (e) => {
      const sid = typeof e.source === "object" ? e.source.id : e.source;
      const tid = typeof e.target === "object" ? e.target.id : e.target;
      return sid === d.id || tid === d.id;
    });

    openPanel(d, connectedIds);
  }

  function deselectNode() {
    selectedNode = null;
    nodeSelection.classed("dimmed", false).classed("highlighted", false);
    linkSelection.classed("dimmed", false).classed("highlighted", false);
    closePanel();
  }

  function openPanel(d, connectedIds) {
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
          `<div class="connection-item" data-id="${c.node.id}">` +
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
          zoomToNode(targetNode);
        }
      });
    });
  }

  function closePanel() {
    document.getElementById("side-panel").classList.remove("visible");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  let zoom;

  function setupZoom() {
    zoom = d3
      .zoom()
      .scaleExtent([0.2, 5])
      .on("zoom", (event) => {
        graphLayer.attr("transform", event.transform);
      });

    svg.call(zoom);

    svg.on("click", function (event) {
      if (event.target === this || event.target.tagName === "svg") {
        deselectNode();
      }
    });

    const width = window.innerWidth;
    const height = window.innerHeight - 60;
    svg.call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(1));
  }

  function zoomToNode(d) {
    const width = window.innerWidth;
    const height = window.innerHeight - 60;
    const scale = 1.8;
    const tx = width / 2 - d.x * scale;
    const ty = height / 2 - d.y * scale;
    svg
      .transition()
      .duration(750)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

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
  }

  function applyFilters() {
    nodeSelection.style("display", (d) => (isNodeVisible(d) ? null : "none"));

    linkSelection.style("display", (d) => (isEdgeVisible(d) ? null : "none"));

    if (selectedNode && !isNodeVisible(selectedNode)) {
      deselectNode();
    }

    updateStats();
  }

  function applySearch() {
    if (!searchQuery) {
      nodeSelection.classed("dimmed", false).classed("search-match", false);
      linkSelection.classed("dimmed", false);
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

    nodeSelection
      .classed("dimmed", (d) => isNodeVisible(d) && !matches.has(d.id))
      .classed("search-match", (d) => matches.has(d.id));

    linkSelection.classed("dimmed", (d) => {
      const sid = typeof d.source === "object" ? d.source.id : d.source;
      const tid = typeof d.target === "object" ? d.target.id : d.target;
      return !(matches.has(sid) && matches.has(tid));
    });
  }

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

  function dragStarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragEnded(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  d3.json("data.json").then((data) => {
    init(data);
  });

  window.addEventListener("resize", () => {
    if (!graphData) return;
    const width = window.innerWidth;
    const height = window.innerHeight - 60;
    simulation
      .force(
        "x",
        d3
          .forceX((d) => {
            const c = DOMAIN_CENTERS[d.domain] || { x: 0 };
            return width / 2 + c.x * width * 0.2;
          })
          .strength(0.12)
      )
      .force(
        "y",
        d3
          .forceY((d) => {
            const c = DOMAIN_CENTERS[d.domain] || { y: 0 };
            return height / 2 + c.y * height * 0.2;
          })
          .strength(0.12)
      )
      .alpha(0.3)
      .restart();
  });
})();
