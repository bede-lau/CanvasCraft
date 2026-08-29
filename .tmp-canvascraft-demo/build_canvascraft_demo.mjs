import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const ROOT = "C:\\Users\\bedel\\OneDrive\\Desktop\\CanvasCraft";
const BUILD = path.join(ROOT, ".tmp-canvascraft-demo");
const ASSETS = path.join(BUILD, "assets");
const OUTPUT = path.join(ROOT, "CanvasCraft_2min_demo.pptx");
const PREVIEWS = path.join(BUILD, "rendered");

const C = {
  void: "#0A0B0F",
  graphite: "#14161C",
  slate: "#1D212A",
  edge: "#2A2F3B",
  mist: "#8B93A7",
  chalk: "#E8EBF2",
  lamp: "#F0B860",
  mint: "#7BC89A",
  blue: "#7AA7FF",
  coral: "#E9897E",
  white: "#FFFFFF",
  black: "#000000",
};

const product = path.join(ROOT, "apps", "web", "public", "brand");
const MARK = path.join(product, "canvascraft-mark-512.png");
const HERO = path.join(product, "canvascraft-social.png");
const IMAGE_DATA = new Map();

const logo = (name) => path.join(ASSETS, name);

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

function addRect(slide, name, left, top, width, height, fill, options = {}) {
  return slide.shapes.add({
    geometry: options.geometry ?? "rect",
    name,
    position: { left, top, width, height },
    fill,
    line: {
      style: "solid",
      fill: options.line ?? "none",
      width: options.lineWidth ?? 0,
    },
    ...(options.borderRadius ? { borderRadius: options.borderRadius } : {}),
  });
}

function addText(slide, name, text, left, top, width, height, options = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    name,
    position: { left, top, width, height },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    fontSize: options.fontSize ?? 20,
    bold: options.bold ?? false,
    color: options.color ?? C.chalk,
    ...(options.alignment ? { alignment: options.alignment } : {}),
    ...(options.italic ? { italic: true } : {}),
  };
  return shape;
}

function contentTypeFor(assetPath) {
  return assetPath.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "image/png";
}

function addLogo(slide, name, assetPath, left, top, width, height, alt, options = {}) {
  const blob = IMAGE_DATA.get(assetPath);
  if (!blob) throw new Error(`Missing embedded image asset: ${assetPath}`);
  return slide.images.add({
    blob,
    contentType: contentTypeFor(assetPath),
    alt,
    fit: options.fit ?? "contain",
    position: { left, top, width, height },
    ...(options.geometry ? { geometry: options.geometry } : {}),
    ...(options.borderRadius ? { borderRadius: options.borderRadius } : {}),
  });
}

function addStepBadge(slide, number, label, left, top, color = C.lamp) {
  addRect(slide, `step-${number}-dot`, left, top, 30, 30, color, {
    geometry: "ellipse",
  });
  addText(slide, `step-${number}-number`, number, left, top + 4, 30, 22, {
    fontSize: 15,
    bold: true,
    color: C.void,
    alignment: "center",
  });
  addText(slide, `step-${number}-label`, label, left + 42, top + 4, 150, 22, {
    fontSize: 15,
    bold: true,
    color: C.mist,
  });
}

function addBottomRule(slide, text) {
  addRect(slide, "footer-rule", 72, 672, 1136, 1, C.edge);
  addText(slide, "footer-brand", "CANVASCRAFT", 72, 682, 160, 18, {
    fontSize: 11,
    bold: true,
    color: C.lamp,
  });
  addText(slide, "footer-text", text, 802, 682, 406, 18, {
    fontSize: 11,
    color: C.mist,
    alignment: "right",
  });
}

function addGrid(slide, opacity = 1) {
  for (let x = 0; x <= 1280; x += 48) {
    addRect(slide, `grid-v-${x}`, x, 0, 1, 720, opacity < 1 ? "#10141C" : "#161A22");
  }
  for (let y = 0; y <= 720; y += 48) {
    addRect(slide, `grid-h-${y}`, 0, y, 1280, 1, opacity < 1 ? "#10141C" : "#161A22");
  }
}

function addArrow(slide, name, left, top, width, color = C.lamp) {
  addRect(slide, `${name}-shaft`, left, top + 11, width - 18, 2, color);
  addRect(slide, `${name}-head`, left + width - 20, top + 4, 16, 16, color, {
    geometry: "triangle",
  }).rotation = 90;
}

function addLogoChip(slide, name, asset, title, left, top, width, height, accent) {
  addRect(slide, `${name}-surface`, left, top, width, height, C.graphite, {
    line: C.edge,
    lineWidth: 1,
    borderRadius: 8,
  });
  addRect(slide, `${name}-accent`, left, top, 4, height, accent);
  addLogo(slide, `${name}-logo`, asset, left + 18, top + 15, 38, 38, `${title} logo`);
  addText(slide, `${name}-title`, title, left + 66, top + 19, width - 80, 24, {
    fontSize: 18,
    bold: true,
  });
}

function addBranch(slide, name, left, top, width, height, tone, title, detail, selected = false) {
  addRect(slide, `${name}-frame`, left, top, width, height, C.graphite, {
    line: selected ? C.lamp : C.edge,
    lineWidth: selected ? 2 : 1,
    borderRadius: 8,
  });
  addRect(slide, `${name}-topline`, left, top, width, 8, tone, { borderRadius: 8 });
  addRect(slide, `${name}-nav`, left + 16, top + 26, width - 32, 18, C.slate, {
    borderRadius: 4,
  });
  addRect(slide, `${name}-hero`, left + 16, top + 58, width - 32, 74, tone, {
    borderRadius: 4,
  });
  addRect(slide, `${name}-line1`, left + 28, top + 75, width * 0.52, 8, C.white, {
    borderRadius: 4,
  });
  addRect(slide, `${name}-line2`, left + 28, top + 94, width * 0.37, 6, "#FFFFFFB8", {
    borderRadius: 4,
  });
  addRect(slide, `${name}-body`, left + 16, top + 146, width - 32, 64, C.slate, {
    borderRadius: 4,
  });
  addRect(slide, `${name}-body-a`, left + 28, top + 163, width * 0.27, 30, C.edge, {
    borderRadius: 4,
  });
  addRect(slide, `${name}-body-b`, left + 28 + width * 0.31, top + 163, width * 0.27, 30, C.edge, {
    borderRadius: 4,
  });
  addRect(slide, `${name}-body-c`, left + 28 + width * 0.62, top + 163, width * 0.19, 30, C.edge, {
    borderRadius: 4,
  });
  addText(slide, `${name}-title`, title, left + 16, top + height - 46, width - 32, 24, {
    fontSize: 18,
    bold: true,
    color: selected ? C.lamp : C.chalk,
  });
  addText(slide, `${name}-detail`, detail, left + 16, top + height - 22, width - 32, 18, {
    fontSize: 12,
    color: C.mist,
  });
  if (selected) {
    addRect(slide, `${name}-winner-dot`, left + width - 42, top + height - 42, 20, 20, C.lamp, {
      geometry: "ellipse",
    });
    addText(slide, `${name}-winner-check`, "✓", left + width - 42, top + height - 40, 20, 18, {
      fontSize: 15,
      bold: true,
      color: C.void,
      alignment: "center",
    });
  }
}

function notes(slide, lines) {
  slide.speakerNotes.textFrame.setText(lines);
  slide.speakerNotes.setVisible(true);
}

async function buildDeck() {
  await fs.mkdir(PREVIEWS, { recursive: true });
  const imageAssets = [
    MARK,
    HERO,
    "openai-symbol.svg",
    "nosana.svg",
    "daytona.svg",
    "react.svg",
    "vite.svg",
    "typescript.svg",
    "tailwindcss.svg",
    "fastify.svg",
    "fastapi.svg",
    "docker.svg",
    "zod.svg",
    "node.svg",
    "python.svg",
    "framer.svg",
  ].map((asset) => (asset.includes(".") && !asset.includes("\\") ? logo(asset) : asset));
  await Promise.all(
    imageAssets.map(async (assetPath) => {
      IMAGE_DATA.set(assetPath, await fs.readFile(assetPath));
    }),
  );
  const presentation = Presentation.create({
    slideSize: { width: 1280, height: 720 },
  });

  // 1. Problem
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.void;
    addGrid(slide, 0.6);

    addLogo(slide, "problem-mark", MARK, 72, 52, 44, 44, "CanvasCraft mark");
    addText(slide, "problem-kicker", "CANVASCRAFT  /  DESIGN STUDIO", 132, 62, 350, 20, {
      fontSize: 14,
      bold: true,
      color: C.lamp,
    });
    addText(
      slide,
      "problem-title",
      "Great product ideas\nshould not stall\nas rough wireframes.",
      72,
      140,
      500,
      270,
      { fontSize: 54, bold: true, color: C.chalk },
    );
    addText(
      slide,
      "problem-copy",
      "Sketches are ambiguous. Hand-offs are slow.\nOne-direction builds hide better answers.",
      72,
      442,
      500,
      72,
      { fontSize: 23, color: C.mist },
    );
    addRect(slide, "problem-accent", 72, 552, 164, 7, C.lamp);
    addText(slide, "problem-footnote", "THE GAP: intent → a credible prototype", 72, 577, 330, 22, {
      fontSize: 14,
      bold: true,
      color: C.mist,
    });

    addRect(slide, "problem-hero-shadow", 626, 76, 582, 530, C.black, {
      line: C.edge,
      lineWidth: 1,
      borderRadius: 8,
    });
    addLogo(
      slide,
      "problem-hero",
      HERO,
      642,
      92,
      550,
      498,
      "CanvasCraft product artwork",
      { fit: "cover", geometry: "roundRect", borderRadius: 6 },
    );
    addText(slide, "problem-hero-label", "A wireframe only captures the beginning.", 658, 610, 500, 24, {
      fontSize: 16,
      color: C.mist,
    });
    addBottomRule(slide, "FROM ROUGH INTENT TO LIVE OPTIONS");
    notes(slide, [
      "CanvasCraft demo: start with the bottleneck. The team can capture an idea, but getting to a credible, comparable prototype tends to be slow and linear.",
      "[Sources]",
      "- Internal product artwork: apps/web/public/brand/canvascraft-social.png",
    ]);
  }

  // 2. Solution
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.void;
    addGrid(slide, 0.45);

    addText(slide, "solution-title", "One wireframe. Three live design bets.", 72, 58, 760, 58, {
      fontSize: 44,
      bold: true,
    });
    addText(slide, "solution-subtitle", "CanvasCraft fixes product intent, then gives visual and motion choices room to compete.", 72, 122, 915, 32, {
      fontSize: 20,
      color: C.mist,
    });

    // Connectors are intentionally created before their nodes.
    addArrow(slide, "solution-arrow-1", 252, 267, 90, C.edge);
    addArrow(slide, "solution-arrow-2", 523, 267, 90, C.edge);
    addArrow(slide, "solution-arrow-3", 794, 267, 90, C.edge);

    addRect(slide, "solution-canvas-node", 72, 200, 180, 164, C.graphite, {
      line: C.edge,
      lineWidth: 1,
      borderRadius: 8,
    });
    addLogo(slide, "solution-canvas-mark", MARK, 96, 223, 64, 64, "CanvasCraft mark");
    addText(slide, "solution-canvas-title", "Canvas", 96, 305, 130, 24, {
      fontSize: 23,
      bold: true,
    });
    addText(slide, "solution-canvas-copy", "Sketch or import", 96, 333, 132, 20, {
      fontSize: 14,
      color: C.mist,
    });

    addRect(slide, "solution-ai-node", 342, 200, 180, 164, C.graphite, {
      line: C.edge,
      lineWidth: 1,
      borderRadius: 8,
    });
    addLogo(slide, "solution-ai-logo", logo("openai-symbol.svg"), 366, 224, 52, 52, "OpenAI logo");
    addText(slide, "solution-ai-title", "Interpret intent", 366, 305, 140, 24, {
      fontSize: 21,
      bold: true,
    });
    addText(slide, "solution-ai-copy", "One shared Screen Spec", 366, 333, 140, 20, {
      fontSize: 14,
      color: C.mist,
    });

    addRect(slide, "solution-nosana-node", 613, 200, 180, 164, C.graphite, {
      line: C.edge,
      lineWidth: 1,
      borderRadius: 8,
    });
    addLogo(slide, "solution-nosana-logo", logo("nosana.svg"), 637, 226, 116, 38, "Nosana logo");
    addText(slide, "solution-nosana-title", "Ground choices", 637, 305, 140, 24, {
      fontSize: 21,
      bold: true,
    });
    addText(slide, "solution-nosana-copy", "Visual match + licence gate", 637, 333, 140, 20, {
      fontSize: 14,
      color: C.mist,
    });

    addRect(slide, "solution-daytona-node", 884, 200, 180, 164, C.graphite, {
      line: C.edge,
      lineWidth: 1,
      borderRadius: 8,
    });
    addLogo(slide, "solution-daytona-logo", logo("daytona.svg"), 908, 228, 120, 28, "Daytona logo");
    addText(slide, "solution-daytona-title", "Run three branches", 908, 305, 148, 24, {
      fontSize: 21,
      bold: true,
    });
    addText(slide, "solution-daytona-copy", "Live sandbox previews", 908, 333, 148, 20, {
      fontSize: 14,
      color: C.mist,
    });

    addText(slide, "solution-output-label", "COMPARABLE OUTPUTS", 72, 416, 300, 18, {
      fontSize: 13,
      bold: true,
      color: C.lamp,
    });
    addBranch(slide, "solution-branch-a", 72, 452, 308, 176, C.blue, "Calm Trust", "Clear hierarchy · restrained motion");
    addBranch(slide, "solution-branch-b", 405, 452, 308, 176, C.coral, "Playful Momentum", "Expressive rhythm · bold energy");
    addBranch(slide, "solution-branch-c", 738, 452, 308, 176, C.mint, "Editorial Precision", "Tight type · decisive density");
    addText(slide, "solution-three", "3", 1080, 470, 84, 84, {
      fontSize: 72,
      bold: true,
      color: C.lamp,
      alignment: "center",
    });
    addText(slide, "solution-three-label", "live branches\nfrom one contract", 1054, 557, 140, 44, {
      fontSize: 14,
      bold: true,
      color: C.mist,
      alignment: "center",
    });

    addBottomRule(slide, "OPENAI-COMPATIBLE · NOSANA · DAYTONA");
    notes(slide, [
      "CanvasCraft converts the canvas to a shared Screen Spec, uses visual matching and a licence gate to ground component choices, then launches three directions as live Daytona branches.",
      "[Sources]",
      "- OpenAI mark: https://upload.wikimedia.org/wikipedia/commons/6/66/OpenAI_logo_2025_%28symbol%29.svg",
      "- Nosana mark: https://nosana.com/_astro/nosanaLogoDark.D176lt8U_ZVySwW.svg",
      "- Daytona mark: https://framerusercontent.com/images/1POXYvdCDtiBLbQGEcarnytrtQ.svg",
    ]);
  }

  // 3. Value proposition
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.void;
    addGrid(slide, 0.35);

    addText(slide, "value-title", "Decide before a sprint gets attached to the first aesthetic.", 72, 58, 1050, 58, {
      fontSize: 40,
      bold: true,
    });
    addText(slide, "value-subtitle", "Hold the product contract steady. Compare hierarchy, states, and motion before committing.", 72, 119, 1020, 28, {
      fontSize: 20,
      color: C.mist,
    });

    addRect(slide, "value-lock-rail", 72, 196, 292, 362, C.graphite, {
      line: C.edge,
      lineWidth: 1,
      borderRadius: 8,
    });
    addLogo(slide, "value-lock-mark", MARK, 100, 226, 50, 50, "CanvasCraft mark");
    addText(slide, "value-lock-kicker", "LOCKED ACROSS EVERY BRANCH", 100, 293, 210, 18, {
      fontSize: 12,
      bold: true,
      color: C.lamp,
    });
    addText(slide, "value-lock-title", "Shared\nScreen Spec", 100, 327, 188, 98, {
      fontSize: 35,
      bold: true,
    });
    addText(slide, "value-lock-copy", "Same product meaning.\nSame interaction model.\nSame responsive states.", 100, 444, 190, 88, {
      fontSize: 17,
      color: C.mist,
    });
    addRect(slide, "value-lock-status", 100, 532, 172, 5, C.mint);
    addText(slide, "value-lock-status-copy", "INTENT PROTECTED", 100, 548, 180, 18, {
      fontSize: 12,
      bold: true,
      color: C.mint,
    });

    addText(slide, "value-compare-label", "WHAT CHANGES", 404, 188, 230, 20, {
      fontSize: 13,
      bold: true,
      color: C.lamp,
    });
    addBranch(slide, "value-branch-a", 404, 226, 238, 286, C.blue, "Calm Trust", "Low noise", false);
    addBranch(slide, "value-branch-b", 669, 226, 238, 286, C.coral, "Playful Momentum", "More energy", false);
    addBranch(slide, "value-branch-c", 934, 226, 238, 286, C.mint, "Editorial Precision", "Champion", true);

    addText(slide, "value-decision", "Choose the strongest direction.\nKeep a live preview. Archive the rest.", 404, 556, 720, 68, {
      fontSize: 28,
      bold: true,
    });
    addRect(slide, "value-decision-accent", 404, 636, 504, 6, C.lamp);
    addBottomRule(slide, "COMPARE FIRST · COMMIT WITH CONFIDENCE");
    notes(slide, [
      "The key value is not more variation for its own sake. CanvasCraft preserves the product contract, so reviewers compare true design decisions instead of accidentally comparing different products.",
      "[Sources]",
      "- Internal product model: CanvasCraft_PRD.md and docs/architecture.md",
    ]);
  }

  // 4. Technical architecture
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.void;
    addGrid(slide, 0.25);

    addText(slide, "architecture-title", "Every integration is visible in the demo trace.", 72, 54, 1000, 52, {
      fontSize: 40,
      bold: true,
    });
    addText(slide, "architecture-subtitle", "A deliberately narrow stack: browser studio → credentialed orchestration → GPU matching → isolated previews.", 72, 112, 1080, 28, {
      fontSize: 19,
      color: C.mist,
    });

    // Connectors first.
    addArrow(slide, "architecture-arrow-1", 250, 254, 62, C.edge);
    addArrow(slide, "architecture-arrow-2", 520, 254, 62, C.edge);
    addArrow(slide, "architecture-arrow-3", 790, 254, 62, C.edge);
    addArrow(slide, "architecture-arrow-4", 1060, 254, 62, C.edge);

    addRect(slide, "architecture-client", 72, 186, 178, 164, C.graphite, {
      line: C.edge,
      lineWidth: 1,
      borderRadius: 8,
    });
    addText(slide, "architecture-client-title", "Canvas Studio", 96, 210, 135, 24, {
      fontSize: 21,
      bold: true,
    });
    addText(slide, "architecture-client-copy", "Capture intent", 96, 240, 120, 18, {
      fontSize: 14,
      color: C.mist,
    });
    addLogo(slide, "architecture-react", logo("react.svg"), 96, 278, 32, 32, "React logo");
    addLogo(slide, "architecture-vite", logo("vite.svg"), 139, 278, 32, 32, "Vite logo");
    addLogo(slide, "architecture-ts", logo("typescript.svg"), 182, 278, 32, 32, "TypeScript logo");
    addLogo(slide, "architecture-tailwind", logo("tailwindcss.svg"), 96, 317, 32, 22, "Tailwind CSS logo");
    addText(slide, "architecture-client-stack", "React · Vite · TS · Tailwind", 135, 318, 108, 30, {
      fontSize: 10,
      color: C.mist,
    });

    addRect(slide, "architecture-orchestrator", 312, 186, 208, 164, C.graphite, {
      line: C.edge,
      lineWidth: 1,
      borderRadius: 8,
    });
    addText(slide, "architecture-orch-title", "Orchestrator", 336, 210, 150, 24, {
      fontSize: 21,
      bold: true,
    });
    addText(slide, "architecture-orch-copy", "Schemas · credentials · SSE", 336, 240, 170, 18, {
      fontSize: 14,
      color: C.mist,
    });
    addLogo(slide, "architecture-fastify", logo("fastify.svg"), 336, 277, 47, 28, "Fastify logo");
    addLogo(slide, "architecture-node", logo("node.svg"), 394, 277, 34, 34, "Node.js logo");
    addLogo(slide, "architecture-zod", logo("zod.svg"), 438, 277, 34, 34, "Zod logo");
    addLogo(slide, "architecture-openai", logo("openai-symbol.svg"), 482, 277, 30, 30, "OpenAI logo");
    addText(slide, "architecture-orch-stack", "Fastify · Node · Zod · OpenAI-compatible", 336, 318, 170, 24, {
      fontSize: 10,
      color: C.mist,
    });

    addRect(slide, "architecture-nosana", 582, 186, 208, 164, C.graphite, {
      line: C.edge,
      lineWidth: 1,
      borderRadius: 8,
    });
    addLogo(slide, "architecture-nosana-wordmark", logo("nosana.svg"), 608, 213, 122, 28, "Nosana logo");
    addText(slide, "architecture-nosana-title", "Visual matching", 608, 248, 140, 24, {
      fontSize: 20,
      bold: true,
    });
    addText(slide, "architecture-nosana-copy", "CLIP rank + local gate", 608, 278, 150, 18, {
      fontSize: 14,
      color: C.mist,
    });
    addLogo(slide, "architecture-fastapi", logo("fastapi.svg"), 608, 312, 29, 29, "FastAPI logo");
    addLogo(slide, "architecture-python", logo("python.svg"), 646, 312, 29, 29, "Python logo");
    addText(slide, "architecture-nosana-stack", "FastAPI · Python · CLIP", 682, 316, 90, 22, {
      fontSize: 10,
      color: C.mist,
    });

    addRect(slide, "architecture-daytona", 852, 186, 208, 164, C.graphite, {
      line: C.edge,
      lineWidth: 1,
      borderRadius: 8,
    });
    addLogo(slide, "architecture-daytona-wordmark", logo("daytona.svg"), 876, 213, 126, 26, "Daytona logo");
    addText(slide, "architecture-daytona-title", "Parallel branches", 876, 248, 154, 24, {
      fontSize: 20,
      bold: true,
    });
    addText(slide, "architecture-daytona-copy", "Snapshot → sandbox → preview", 876, 278, 160, 18, {
      fontSize: 14,
      color: C.mist,
    });
    addLogo(slide, "architecture-docker", logo("docker.svg"), 876, 312, 35, 27, "Docker logo");
    addLogo(slide, "architecture-framer", logo("framer.svg"), 923, 312, 29, 29, "Framer Motion logo");
    addText(slide, "architecture-daytona-stack", "Docker · Motion", 961, 316, 80, 22, {
      fontSize: 10,
      color: C.mist,
    });

    addRect(slide, "architecture-outputs", 1122, 186, 86, 164, C.lamp, {
      borderRadius: 8,
    });
    addText(slide, "architecture-outputs-number", "3", 1122, 210, 86, 64, {
      fontSize: 54,
      bold: true,
      color: C.void,
      alignment: "center",
    });
    addText(slide, "architecture-outputs-label", "live\npreviews", 1124, 277, 82, 44, {
      fontSize: 14,
      bold: true,
      color: C.void,
      alignment: "center",
    });

    addRect(slide, "architecture-boundary", 72, 410, 1136, 124, C.graphite, {
      line: C.edge,
      lineWidth: 1,
      borderRadius: 8,
    });
    addText(slide, "architecture-boundary-kicker", "SECURITY BOUNDARY", 96, 434, 180, 18, {
      fontSize: 12,
      bold: true,
      color: C.lamp,
    });
    addText(slide, "architecture-boundary-title", "The browser never holds API keys or talks to integrations directly.", 96, 462, 760, 31, {
      fontSize: 24,
      bold: true,
    });
    addText(slide, "architecture-boundary-copy", "The orchestrator owns provider credentials, sandbox capability, progress events, and explicit fallback states.", 96, 500, 940, 18, {
      fontSize: 15,
      color: C.mist,
    });
    addText(slide, "architecture-stack-label", "IMPLEMENTED STACK", 72, 580, 170, 20, {
      fontSize: 12,
      bold: true,
      color: C.lamp,
    });
    const chips = [
      ["react", "React", 72, 610, 154, C.blue],
      ["vite", "Vite", 240, 610, 136, C.coral],
      ["typescript", "TypeScript", 390, 610, 166, C.blue],
      ["tailwind", "Tailwind", 570, 610, 164, C.mint],
      ["fastify", "Fastify", 748, 610, 156, C.coral],
      ["docker", "Docker", 918, 610, 150, C.blue],
      ["zod", "Zod", 1082, 610, 126, C.mint],
    ];
    for (const [assetName, title, left, top, width, accent] of chips) {
      const lookup = {
        react: "react.svg",
        vite: "vite.svg",
        typescript: "typescript.svg",
        tailwind: "tailwindcss.svg",
        fastify: "fastify.svg",
        docker: "docker.svg",
        zod: "zod.svg",
      };
      addLogoChip(slide, `architecture-chip-${assetName}`, logo(lookup[assetName]), title, left, top, width, 48, accent);
    }
    addBottomRule(slide, "CREDENTIALS STAY SERVER-SIDE · FAILURES STAY VISIBLE");
    notes(slide, [
      "CanvasCraft's architecture is intentionally narrow. The browser captures intent; a credentialed orchestrator validates and coordinates; Nosana provides visual matching; Daytona runs isolated previews.",
      "[Sources]",
      "- OpenAI mark: https://upload.wikimedia.org/wikipedia/commons/6/66/OpenAI_logo_2025_%28symbol%29.svg",
      "- Nosana mark: https://nosana.com/_astro/nosanaLogoDark.D176lt8U_ZVySwW.svg",
      "- Daytona mark: https://framerusercontent.com/images/1POXYvdCDtiBLbQGEcarnytrtQ.svg",
      "- React, Vite, TypeScript, Tailwind CSS, Fastify, FastAPI, Docker, Zod, Node.js, Python, and Framer marks: https://github.com/simple-icons/simple-icons",
    ]);
  }

  for (const [index, slide] of presentation.slides.items.entries()) {
    const png = await presentation.export({ slide, format: "png", scale: 2 });
    await writeBlob(path.join(PREVIEWS, `slide-${index + 1}.png`), png);
    const layout = await slide.export({ format: "layout" });
    await fs.writeFile(path.join(PREVIEWS, `slide-${index + 1}.layout.json`), await layout.text());
  }

  const montage = await presentation.export({ format: "webp", montage: true, scale: 1 });
  await writeBlob(path.join(PREVIEWS, "deck-montage.webp"), montage);
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(OUTPUT);
  console.log(`Created ${OUTPUT}`);
}

buildDeck().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
