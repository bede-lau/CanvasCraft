import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const ROOT = "C:\\Users\\bedel\\OneDrive\\Desktop\\CanvasCraft";
const BUILD = path.join(ROOT, ".tmp-canvascraft-redesign");
const OLD_ASSETS = path.join(ROOT, ".tmp-canvascraft-demo", "assets");
const OUTPUT = path.join(ROOT, "CanvasCraft_2min_demo_architecture_redesign.pptx");
const PREVIEWS = path.join(BUILD, "rendered");
const MARK = path.join(ROOT, "apps", "web", "public", "brand", "canvascraft-mark-512.png");
const SOCIAL = path.join(ROOT, "apps", "web", "public", "brand", "canvascraft-social.png");
const THUMBNAILS = path.join(ROOT, "packages", "registry", "data", "thumbnails");

const C = {
  void: "#090A0E",
  graphite: "#151820",
  slate: "#202631",
  edge: "#323A48",
  chalk: "#F2F4F8",
  mist: "#A7B0C1",
  lamp: "#F3C15C",
  mint: "#79D39B",
  blue: "#7CA8FF",
  coral: "#F08C7B",
  white: "#FFFFFF",
};

const FILES = {
  canvas: MARK,
  social: SOCIAL,
  openai: path.join(OLD_ASSETS, "openai-symbol.svg"),
  nosana: path.join(OLD_ASSETS, "nosana.svg"),
  daytona: path.join(OLD_ASSETS, "daytona-light.png"),
  react: path.join(OLD_ASSETS, "react.svg"),
  vite: path.join(OLD_ASSETS, "vite.svg"),
  ts: path.join(OLD_ASSETS, "typescript.svg"),
  tailwind: path.join(OLD_ASSETS, "tailwindcss.svg"),
  fastify: path.join(OLD_ASSETS, "fastify.svg"),
  fastapi: path.join(OLD_ASSETS, "fastapi.svg"),
  docker: path.join(OLD_ASSETS, "docker.svg"),
  zod: path.join(OLD_ASSETS, "zod.svg"),
  node: path.join(OLD_ASSETS, "node.svg"),
  python: path.join(OLD_ASSETS, "python.svg"),
  framer: path.join(OLD_ASSETS, "framer.svg"),
  wire: path.join(THUMBNAILS, "canvascraft-neutral-shell.svg"),
  grid: path.join(THUMBNAILS, "canvascraft-neutral-card-grid.svg"),
  dialog: path.join(THUMBNAILS, "coss-ui-dialog.svg"),
  tabs: path.join(THUMBNAILS, "coss-ui-tabs.svg"),
  steps: path.join(THUMBNAILS, "reui-stepper.svg"),
  tasks: path.join(THUMBNAILS, "beautiful-ui-task-list.svg"),
};

const IMAGE_DATA = new Map();

function typeFor(assetPath) {
  return assetPath.endsWith(".svg") ? "image/svg+xml" : "image/png";
}

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

function rect(slide, name, left, top, width, height, fill, options = {}) {
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

function text(slide, name, value, left, top, width, height, options = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    name,
    position: { left, top, width, height },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = value;
  shape.text.style = {
    fontSize: options.fontSize ?? 20,
    bold: options.bold ?? false,
    color: options.color ?? C.chalk,
    ...(options.alignment ? { alignment: options.alignment } : {}),
  };
  return shape;
}

function image(slide, name, asset, left, top, width, height, alt, options = {}) {
  const blob = IMAGE_DATA.get(asset);
  if (!blob) throw new Error(`Missing image asset: ${asset}`);
  return slide.images.add({
    blob,
    contentType: typeFor(asset),
    alt,
    fit: options.fit ?? "contain",
    position: { left, top, width, height },
    ...(options.geometry ? { geometry: options.geometry } : {}),
    ...(options.borderRadius ? { borderRadius: options.borderRadius } : {}),
  });
}

function line(slide, name, left, top, width, color, thickness = 2) {
  rect(slide, name, left, top, width, thickness, color);
}

function arrow(slide, name, left, top, width, color) {
  line(slide, `${name}-line`, left, top + 16, width - 20, color, 2);
  const head = rect(slide, `${name}-head`, left + width - 22, top + 8, 16, 16, color, {
    geometry: "triangle",
  });
  head.rotation = 90;
}

function downArrow(slide, name, left, top, height, color) {
  rect(slide, `${name}-line`, left + 16, top, 2, height - 20, color);
  const head = rect(slide, `${name}-head`, left + 8, top + height - 22, 16, 16, color, {
    geometry: "triangle",
  });
  head.rotation = 180;
}

function leftArrow(slide, name, left, top, width, color) {
  line(slide, `${name}-line`, left + 20, top + 16, width - 20, color, 2);
  const head = rect(slide, `${name}-head`, left + 4, top + 8, 16, 16, color, {
    geometry: "triangle",
  });
  head.rotation = 270;
}

function footer(slide, page) {
  line(slide, "footer-rule", 64, 668, 1152, C.edge, 1);
  text(slide, "footer-mark", "CANVASCRAFT", 64, 680, 150, 18, {
    fontSize: 11,
    bold: true,
    color: C.lamp,
  });
  text(slide, "footer-page", `0${page}`, 1162, 680, 54, 18, {
    fontSize: 11,
    bold: true,
    color: C.mist,
    alignment: "right",
  });
}

function title(slide, word, sub) {
  text(slide, "slide-word", word, 64, 48, 300, 22, {
    fontSize: 14,
    bold: true,
    color: C.lamp,
  });
  text(slide, "slide-title", sub, 64, 86, 1100, 64, {
    fontSize: 42,
    bold: true,
  });
}

function dot(slide, name, left, top, color, size = 14) {
  rect(slide, name, left, top, size, size, color, { geometry: "ellipse" });
}

function stage(slide, name, asset, label, left, top, accent) {
  rect(slide, `${name}-ring`, left - 10, top - 10, 100, 100, C.graphite, {
    geometry: "ellipse",
    line: accent,
    lineWidth: 2,
  });
  image(slide, `${name}-asset`, asset, left + 8, top + 8, 64, 64, `${label} logo`);
  text(slide, `${name}-label`, label, left - 20, top + 104, 120, 22, {
    fontSize: 16,
    bold: true,
    color: C.chalk,
    alignment: "center",
  });
}

function thumb(slide, name, asset, left, top, width, height, accent, label) {
  rect(slide, `${name}-back`, left, top, width, height, C.graphite, {
    line: C.edge,
    lineWidth: 1,
    borderRadius: 8,
  });
  rect(slide, `${name}-bar`, left, top, width, 7, accent, { borderRadius: 8 });
  image(slide, `${name}-art`, asset, left + 12, top + 18, width - 24, height - 56, label, {
    fit: "contain",
  });
  text(slide, `${name}-label`, label, left + 12, top + height - 30, width - 24, 20, {
    fontSize: 14,
    bold: true,
    color: C.chalk,
  });
}

function notes(slide, sources) {
  slide.speakerNotes.textFrame.setText(`[Sources]\n${sources.join("\n")}`);
  slide.speakerNotes.setVisible(true);
}

async function main() {
  await fs.mkdir(PREVIEWS, { recursive: true });
  await Promise.all(
    Object.values(FILES).map(async (asset) => {
      IMAGE_DATA.set(asset, await fs.readFile(asset));
    }),
  );

  const presentation = Presentation.create({
    slideSize: { width: 1280, height: 720 },
  });

  // Slide 1: Problem
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.void;
    title(slide, "01 / PROBLEM", "A sketch is not a decision.");
    text(slide, "problem-caption", "It captures the pieces. The experience stays unresolved.", 64, 154, 680, 34, {
      fontSize: 23,
      color: C.mist,
    });

    image(slide, "problem-canvas", FILES.canvas, 68, 258, 118, 118, "CanvasCraft mark");
    image(slide, "problem-wire", FILES.wire, 194, 220, 410, 278, "rough wireframe example", {
      fit: "contain",
    });
    rect(slide, "wire-outline", 180, 208, 438, 302, "none", {
      line: C.edge,
      lineWidth: 1,
      borderRadius: 8,
    });
    text(slide, "wire-caption", "rough intent", 190, 520, 210, 22, {
      fontSize: 15,
      color: C.mist,
    });

    line(slide, "problem-split", 670, 218, 1, C.edge, 306);
    const problemItems = [
      { y: 230, asset: FILES.dialog, accent: C.coral, headline: "STATE", detail: "What happens next?" },
      { y: 346, asset: FILES.steps, accent: C.blue, headline: "FLOW", detail: "What comes first?" },
      { y: 462, asset: FILES.tabs, accent: C.mint, headline: "FEEL", detail: "Which direction wins?" },
    ];
    for (const [index, item] of problemItems.entries()) {
      image(slide, `problem-icon-${index}`, item.asset, 724, item.y, 82, 70, item.headline, { fit: "contain" });
      dot(slide, `problem-dot-${index}`, 842, item.y + 10, item.accent);
      text(slide, `problem-name-${index}`, item.headline, 870, item.y + 2, 210, 22, {
        fontSize: 18,
        bold: true,
      });
      text(slide, `problem-detail-${index}`, item.detail, 870, item.y + 30, 270, 24, {
        fontSize: 18,
        color: C.mist,
      });
    }
    text(slide, "problem-signal", "ONE DIRECTION IS A GUESS.", 724, 586, 430, 24, {
      fontSize: 15,
      bold: true,
      color: C.lamp,
    });
    footer(slide, 1);
    notes(slide, [
      "Product claim: CanvasCraft README.md and docs/architecture.md.",
      "CanvasCraft mark: apps/web/public/brand/canvascraft-mark-512.png.",
      "Component thumbnails: packages/registry/data/thumbnails/ (project-owned).",
    ]);
  }

  // Slide 2: Solution
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.void;
    title(slide, "02 / SOLUTION", "Interpret once. Explore three times.");
    text(slide, "solution-caption", "One shared product contract. Three live visual directions.", 64, 154, 760, 30, {
      fontSize: 23,
      color: C.mist,
    });

    arrow(slide, "solution-arrow-1", 196, 278, 155, C.lamp);
    arrow(slide, "solution-arrow-2", 420, 278, 155, C.mint);
    arrow(slide, "solution-arrow-3", 644, 278, 155, C.blue);
    stage(slide, "solution-canvas", FILES.canvas, "CANVAS", 104, 236, C.lamp);
    stage(slide, "solution-ai", FILES.openai, "INTERPRET", 328, 236, C.mint);
    stage(slide, "solution-match", FILES.nosana, "MATCH", 552, 236, C.blue);
    stage(slide, "solution-launch", FILES.daytona, "LAUNCH", 776, 236, C.coral);

    text(slide, "solution-three", "3 LIVE DIRECTIONS", 908, 260, 250, 26, {
      fontSize: 17,
      bold: true,
      color: C.lamp,
    });
    dot(slide, "solution-status-a", 908, 306, C.mint, 12);
    dot(slide, "solution-status-b", 932, 306, C.blue, 12);
    dot(slide, "solution-status-c", 956, 306, C.coral, 12);

    thumb(slide, "solution-branch-a", FILES.grid, 246, 448, 214, 150, C.mint, "CALM");
    thumb(slide, "solution-branch-b", FILES.tasks, 532, 448, 214, 150, C.coral, "BOLD");
    thumb(slide, "solution-branch-c", FILES.tabs, 818, 448, 214, 150, C.blue, "EDITORIAL");
    line(slide, "solution-tree", 640, 360, 2, C.edge, 72);
    line(slide, "solution-tree-left", 350, 430, 580, C.edge, 2);
    line(slide, "solution-tree-a", 351, 420, 2, C.edge, 22);
    line(slide, "solution-tree-b", 638, 420, 2, C.edge, 22);
    line(slide, "solution-tree-c", 927, 420, 2, C.edge, 22);
    footer(slide, 2);
    notes(slide, [
      "Solution claim: CanvasCraft README.md and docs/architecture.md.",
      "OpenAI mark: Wikimedia Commons, OpenAI 2025 symbol.",
      "Nosana mark: official nosana.com brand mark.",
      "Daytona mark: official daytona.io brand mark.",
      "Branch visuals: packages/registry/data/thumbnails/ (project-owned).",
    ]);
  }

  // Slide 3: Value proposition
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.void;
    title(slide, "03 / VALUE", "Same product. Better decision.");
    text(slide, "value-caption", "Compare the experience before the sprint commits to one aesthetic.", 64, 154, 930, 30, {
      fontSize: 23,
      color: C.mist,
    });

    image(slide, "value-spec", FILES.canvas, 98, 285, 94, 94, "CanvasCraft shared specification");
    text(slide, "value-spec-label", "ONE SHARED\nSCREEN SPEC", 74, 398, 140, 54, {
      fontSize: 16,
      bold: true,
      color: C.lamp,
      alignment: "center",
    });

    arrow(slide, "value-arrow", 218, 320, 130, C.lamp);
    thumb(slide, "value-direction-a", FILES.steps, 384, 246, 224, 252, C.mint, "CALM TRUST");
    thumb(slide, "value-direction-b", FILES.tasks, 664, 246, 224, 252, C.coral, "PLAYFUL");
    thumb(slide, "value-direction-c", FILES.grid, 944, 246, 224, 252, C.blue, "EDITORIAL");

    line(slide, "value-base", 330, 546, 838, C.edge, 1);
    dot(slide, "value-dot-a", 466, 540, C.mint, 12);
    dot(slide, "value-dot-b", 746, 540, C.coral, 12);
    dot(slide, "value-dot-c", 1026, 540, C.blue, 12);
    text(slide, "value-line-one", "COMPARE", 354, 576, 220, 28, {
      fontSize: 18,
      bold: true,
      color: C.chalk,
      alignment: "center",
    });
    text(slide, "value-line-two", "CHOOSE", 634, 576, 220, 28, {
      fontSize: 18,
      bold: true,
      color: C.chalk,
      alignment: "center",
    });
    text(slide, "value-line-three", "KEEP LIVE", 914, 576, 220, 28, {
      fontSize: 18,
      bold: true,
      color: C.chalk,
      alignment: "center",
    });
    footer(slide, 3);
    notes(slide, [
      "Value proposition claim: CanvasCraft README.md and docs/architecture.md.",
      "CanvasCraft mark: apps/web/public/brand/canvascraft-mark-512.png.",
      "Branch visuals: packages/registry/data/thumbnails/ (project-owned).",
    ]);
  }

  // Slide 4: Technical architecture
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.void;
    title(slide, "04 / TECHNICAL ARCHITECTURE", "One codebase. One visible run.");
    text(slide, "arch-caption", "The folders become one trace: sketch → contract → live branches → review.", 64, 146, 900, 26, {
      fontSize: 20,
      color: C.mist,
    });

    // Main request and live-preview return flow.
    arrow(slide, "arch-request", 282, 244, 86, C.lamp);
    arrow(slide, "arch-ai-call", 622, 224, 80, C.mint);
    arrow(slide, "arch-nosana-call", 622, 306, 80, C.blue);
    arrow(slide, "arch-daytona-call", 622, 518, 80, C.coral);
    leftArrow(slide, "arch-preview-return", 282, 342, 86, C.lamp);
    arrow(slide, "arch-preview-output", 884, 518, 58, C.coral);

    // Vertical codebase dependencies.
    downArrow(slide, "arch-schema-down", 174, 334, 62, C.lamp);
    downArrow(slide, "arch-orchestrator-down", 486, 348, 50, C.mint);
    downArrow(slide, "arch-registry-down", 486, 492, 38, C.blue);

    // apps/web
    rect(slide, "arch-web-card", 64, 200, 218, 134, C.graphite, {
      line: C.lamp,
      lineWidth: 2,
      borderRadius: 8,
    });
    text(slide, "arch-web-path", "apps/web", 82, 216, 180, 22, {
      fontSize: 20,
      bold: true,
      color: C.lamp,
    });
    image(slide, "arch-react", FILES.react, 82, 250, 34, 34, "React logo");
    image(slide, "arch-vite", FILES.vite, 122, 250, 34, 34, "Vite logo");
    image(slide, "arch-ts", FILES.ts, 162, 250, 34, 34, "TypeScript logo");
    image(slide, "arch-tailwind", FILES.tailwind, 202, 250, 34, 34, "Tailwind CSS logo");
    text(slide, "arch-web-role", "Canvas + review", 82, 298, 184, 20, {
      fontSize: 15,
      color: C.chalk,
    });

    // apps/orchestrator
    rect(slide, "arch-orchestrator-card", 368, 184, 254, 164, C.graphite, {
      line: C.mint,
      lineWidth: 2,
      borderRadius: 8,
    });
    text(slide, "arch-orchestrator-path", "apps/orchestrator", 388, 202, 210, 22, {
      fontSize: 20,
      bold: true,
      color: C.mint,
    });
    image(slide, "arch-node", FILES.node, 388, 240, 38, 38, "Node.js logo");
    image(slide, "arch-fastify", FILES.fastify, 434, 240, 38, 38, "Fastify logo");
    text(slide, "arch-orchestrator-line-one", "Run store · SSE · preview proxy", 388, 286, 214, 20, {
      fontSize: 15,
      color: C.chalk,
    });
    text(slide, "arch-orchestrator-line-two", "Credentials stay here", 388, 312, 214, 18, {
      fontSize: 15,
      bold: true,
      color: C.lamp,
    });

    // OpenAI endpoint.
    rect(slide, "arch-openai-card", 702, 184, 202, 80, C.graphite, {
      line: C.mint,
      lineWidth: 1,
      borderRadius: 8,
    });
    image(slide, "arch-openai", FILES.openai, 720, 202, 40, 40, "OpenAI logo");
    text(slide, "arch-openai-title", "OpenAI AI", 770, 200, 120, 18, {
      fontSize: 16,
      bold: true,
    });
    text(slide, "arch-openai-detail", "Spec + variants", 770, 226, 120, 18, {
      fontSize: 16,
      color: C.mist,
    });

    // Nosana GPU matcher service.
    rect(slide, "arch-nosana-card", 702, 278, 182, 108, C.graphite, {
      line: C.blue,
      lineWidth: 1,
      borderRadius: 8,
    });
    image(slide, "arch-nosana", FILES.nosana, 718, 298, 42, 30, "Nosana logo");
    image(slide, "arch-fastapi", FILES.fastapi, 768, 292, 38, 38, "FastAPI logo");
    image(slide, "arch-python", FILES.python, 812, 292, 38, 38, "Python logo");
    text(slide, "arch-nosana-path-one", "services/", 718, 340, 150, 18, {
      fontSize: 16,
      bold: true,
      color: C.blue,
    });
    text(slide, "arch-nosana-path-two", "nosana-clip", 718, 360, 150, 18, {
      fontSize: 16,
      bold: true,
      color: C.mist,
    });

    // Shared schema and registry.
    rect(slide, "arch-schema-card", 64, 396, 218, 94, C.graphite, {
      line: C.lamp,
      lineWidth: 1,
      borderRadius: 8,
    });
    image(slide, "arch-zod", FILES.zod, 82, 416, 34, 34, "Zod logo");
    text(slide, "arch-schema-path", "packages/schema", 122, 412, 148, 20, {
      fontSize: 16,
      bold: true,
      color: C.lamp,
    });
    text(slide, "arch-schema-detail", "CanvasDoc · ScreenSpec", 82, 454, 174, 18, {
      fontSize: 14,
      color: C.mist,
    });

    rect(slide, "arch-registry-card", 368, 396, 254, 96, C.graphite, {
      line: C.blue,
      lineWidth: 1,
      borderRadius: 8,
    });
    image(slide, "arch-registry-thumb", FILES.grid, 388, 412, 58, 50, "Component registry visual");
    text(slide, "arch-registry-path", "packages/registry", 454, 412, 154, 20, {
      fontSize: 16,
      bold: true,
      color: C.blue,
    });
    text(slide, "arch-registry-detail", "Candidate + licence gate", 454, 450, 156, 18, {
      fontSize: 14,
      color: C.mist,
    });

    // Branch template -> Daytona snapshot -> live sandboxes.
    rect(slide, "arch-template-card", 368, 530, 254, 84, C.graphite, {
      line: C.mint,
      lineWidth: 1,
      borderRadius: 8,
    });
    image(slide, "arch-template-react", FILES.react, 388, 548, 32, 32, "React logo");
    image(slide, "arch-template-vite", FILES.vite, 426, 548, 32, 32, "Vite logo");
    text(slide, "arch-template-path-one", "packages/", 470, 540, 144, 18, {
      fontSize: 16,
      bold: true,
      color: C.mint,
    });
    text(slide, "arch-template-path-two", "branch-template", 470, 562, 144, 18, {
      fontSize: 16,
      bold: true,
      color: C.mist,
    });

    rect(slide, "arch-daytona-card", 702, 482, 182, 132, C.graphite, {
      line: C.coral,
      lineWidth: 2,
      borderRadius: 8,
    });
    image(slide, "arch-docker", FILES.docker, 720, 504, 34, 34, "Docker logo");
    image(slide, "arch-daytona", FILES.daytona, 762, 502, 42, 42, "Daytona logo");
    text(slide, "arch-snapshot-path-one", "infra/", 720, 544, 150, 18, {
      fontSize: 16,
      bold: true,
      color: C.coral,
    });
    text(slide, "arch-snapshot-path-two", "daytona-", 720, 564, 150, 18, {
      fontSize: 16,
      bold: true,
      color: C.mist,
    });
    text(slide, "arch-snapshot-path-three", "snapshot", 720, 582, 150, 18, {
      fontSize: 16,
      bold: true,
      color: C.mist,
    });
    thumb(slide, "arch-preview-a", FILES.grid, 942, 454, 90, 120, C.mint, "A");
    thumb(slide, "arch-preview-b", FILES.tasks, 1046, 454, 90, 120, C.coral, "B");
    thumb(slide, "arch-preview-c", FILES.tabs, 1150, 454, 66, 120, C.blue, "C");
    text(slide, "arch-previews-title", "LIVE PREVIEWS", 944, 594, 230, 18, {
      fontSize: 14,
      bold: true,
      color: C.coral,
      alignment: "center",
    });

    text(slide, "arch-post-runs", "CanvasDoc + PNG", 286, 224, 76, 18, {
      fontSize: 12,
      bold: true,
      color: C.lamp,
      alignment: "center",
    });
    text(slide, "arch-sse", "SSE + preview proxy", 280, 366, 92, 18, {
      fontSize: 12,
      bold: true,
      color: C.lamp,
      alignment: "center",
    });

    footer(slide, 4);
    notes(slide, [
      "Architecture claims: docs/architecture.md; apps/orchestrator/src/app.ts; apps/orchestrator/src/daytona.ts; apps/orchestrator/src/nosana.ts; apps/orchestrator/src/branch-materializer.ts; packages/schema/src/branch.ts.",
      "OpenAI mark: Wikimedia Commons, OpenAI 2025 symbol.",
      "Nosana mark: official nosana.com brand mark.",
      "Daytona mark: official daytona.io brand mark.",
      "Developer-tool marks: Simple Icons (simpleicons.org).",
      "Preview visuals: packages/registry/data/thumbnails/ (project-owned).",
    ]);
  }

  for (const [index, slide] of presentation.slides.items.entries()) {
    await writeBlob(
      path.join(PREVIEWS, `slide-${index + 1}.png`),
      await presentation.export({ slide, format: "png", scale: 1 }),
    );
    await fs.writeFile(
      path.join(PREVIEWS, `slide-${index + 1}.layout.json`),
      await (await slide.export({ format: "layout" })).text(),
    );
  }
  await writeBlob(
    path.join(PREVIEWS, "deck-montage.webp"),
    await presentation.export({ format: "webp", montage: true, scale: 1 }),
  );

  const snapshot = await presentation.inspect({
    kind: "slide,textbox,shape,image,notes",
    maxChars: 30000,
  });
  await fs.writeFile(path.join(BUILD, "redesign.inspect.ndjson"), snapshot.ndjson);

  const deck = await PresentationFile.exportPptx(presentation);
  await deck.save(OUTPUT);
  console.log(`Created ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
