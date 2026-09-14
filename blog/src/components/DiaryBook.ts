// 日记本：封面开合 + 3D 翻页（vanilla JS，无依赖）。
// 数据来源 <template id="diary-data">：每个 .db-entry 是一个逻辑条目
// （右页 .db-right 的块级内容 + 可选左页 .db-left / data-emoji / data-date / data-image）。
// 长内容运行时贪心拆分成多个跨页，页内不滚动。

interface Entry {
  date: string;
  emoji: string;
  image: string;
  firstLeft: Node | null;
  blocks: Node[];
}

interface Spread {
  left: HTMLElement;
  blocks: Node[];
}

export function initDiaryBook() {
  const template = document.getElementById("diary-data");
  const bookRoot = document.getElementById("diary-book");
  const fallback = document.getElementById("story-fallback");
  if (!template || !bookRoot) return;

  const entries: Entry[] = [...template.content.querySelectorAll(".db-entry")].map((el) => ({
    date: el.dataset.date || "",
    emoji: el.dataset.emoji || "",
    image: el.dataset.image || "",
    firstLeft: el.querySelector(".db-left")?.cloneNode(true) ?? null,
    blocks: Array.from(el.querySelector(".db-right")!.children).map((n) => n.cloneNode(true)),
  }));
  if (entries.length === 0) return;

  let idx = 0;
  let state = "closed"; // closed | open | flipping
  let spreads: Spread[] = [];

  const stage = document.createElement("div");
  stage.className = "db-stage";
  stage.setAttribute("role", "dialog");
  stage.setAttribute("aria-modal", "true");
  stage.setAttribute("aria-label", "我们的故事日记");
  stage.innerHTML = `
    <button class="db-close" type="button" aria-label="关闭日记">&#10005;</button>
    <div class="db-row">
      <button class="db-prev" type="button" aria-label="上一页">&#8249;</button>
      <div class="db-book">
        <div class="db-inner">
          <div class="db-spread"></div>
          <div class="db-flipper" aria-hidden="true"></div>
          <div class="db-cover" role="button" tabindex="0" aria-label="翻开日记">
            <div class="db-cover-face">
              <span class="db-cover-kicker">七七 &amp; 斐哥</span>
              <span class="db-cover-title">我们的故事</span>
              <span class="db-cover-duo">
                <span class="db-cover-half"><img src="/qiqi-avatar.jpg" alt="七七" /></span>
                <span class="db-cover-half"><img src="/feige-avatar.jpg" alt="斐哥" /></span>
                <span class="db-cover-heart">&#9829;</span>
              </span>
              <span class="db-cover-hint">点击翻开</span>
            </div>
          </div>
        </div>
      </div>
      <button class="db-next" type="button" aria-label="下一页">&#8250;</button>
    </div>
    <span class="db-indicator"></span>
  `;
  bookRoot.appendChild(stage);

  const book = stage.querySelector(".db-book");
  const spreadEl = stage.querySelector(".db-spread");
  const flipper = stage.querySelector(".db-flipper");
  const cover = stage.querySelector(".db-cover");
  const closeBtn = stage.querySelector(".db-close");
  const prevBtn = stage.querySelector(".db-prev");
  const nextBtn = stage.querySelector(".db-next");
  const indicator = stage.querySelector(".db-indicator");

  function node(html: string): HTMLElement {
    const t = document.createElement("template");
    t.innerHTML = html;
    return t.content.firstElementChild as HTMLElement;
  }

  function firstLeft(entry: Entry): HTMLElement {
    if (entry.firstLeft) return entry.firstLeft.cloneNode(true) as HTMLElement;
    const left = node('<div class="db-left"></div>');
    if (entry.emoji) left.append(node(`<span class="db-emoji">${entry.emoji}</span>`));
    if (entry.date) left.append(node(`<span class="db-date">${entry.date}</span>`));
    if (entry.image) left.append(node(`<img class="db-photo" src="${entry.image}" alt="" loading="lazy" />`));
    return left;
  }

  function contLeft(entry: Entry): HTMLElement {
    const left = node('<div class="db-left"></div>');
    if (entry.emoji) left.append(node(`<span class="db-emoji db-emoji-sm">${entry.emoji}</span>`));
    if (entry.date) left.append(node(`<span class="db-date db-date-sm">${entry.date}</span>`));
    left.append(node('<span class="db-kicker">续</span>'));
    return left;
  }

  function pageNode(cls: string, blocks: Node[], pageNo?: number): HTMLElement {
    const page = node(`<div class="db-page ${cls}"></div>`);
    for (const b of blocks) page.appendChild(b);
    if (pageNo) page.append(node(`<span class="db-pageno">${pageNo}</span>`));
    return page;
  }

  // 贪心拆页：块逐个试放，放不下就另起一个跨页
  function buildSpreads() {
    spreadEl.innerHTML = "";
    spreadEl.append(node('<div class="db-page left"></div>'), node('<div class="db-page right"></div>'));
    const page = spreadEl.querySelector(".db-page.right")!;
    const maxW = page.clientWidth;
    const maxH = page.clientHeight;

    const measurer = node('<div class="db-page right db-measure"></div>');
    measurer.style.width = maxW + "px";
    measurer.style.height = maxH + "px";
    stage.append(measurer);

    const result: Spread[] = [];
    for (const entry of entries) {
      let cur: Node[] = [];
      let sheetIndex = 0;
      const pushSheet = () => {
        if (cur.length === 0) return;
        result.push({
          left: sheetIndex === 0 ? firstLeft(entry) : contLeft(entry),
          blocks: cur.map((b) => b.cloneNode(true)),
        });
        cur = [];
        sheetIndex++;
      };
      for (const block of entry.blocks) {
        measurer.innerHTML = "";
        for (const b of cur) measurer.appendChild(b.cloneNode(true));
        measurer.appendChild(block.cloneNode(true));
        if (measurer.scrollHeight <= maxH) {
          cur.push(block);
        } else if (cur.length === 0) {
          cur.push(block); // 单个块就超页高：独占一个跨页
        } else {
          pushSheet();
          cur.push(block);
        }
      }
      pushSheet();
    }
    measurer.remove();
    return result;
  }

  function renderSpread() {
    const s = spreads[idx];
    spreadEl.innerHTML = "";
    const left = pageNode("left", [s.left], idx * 2 + 1);
    const right = pageNode("right", s.blocks, idx * 2 + 2);
    left.addEventListener("click", () => flip(-1));
    right.addEventListener("click", () => flip(1));
    spreadEl.append(left, right);
  }

  function refresh() {
    const open = state === "open";
    prevBtn.disabled = !open || idx === 0;
    nextBtn.disabled = !open || idx === spreads.length - 1;
    indicator.textContent = state === "closed" ? "封 面" : `第 ${idx + 1} / ${spreads.length} 页`;
  }

  function open() {
    if (state !== "closed") return;
    state = "open";
    cover.classList.add("open");
    book.classList.add("open");
    document.documentElement.classList.add("db-locked");
    refresh();
  }

  function close() {
    if (state !== "open") return;
    state = "closed";
    cover.classList.remove("open");
    book.classList.remove("open");
    document.documentElement.classList.remove("db-locked");
    refresh();
  }

  function flip(dir: number) {
    if (state !== "open") return;
    const target = idx + dir;
    if (target < 0 || target >= spreads.length) return;
    state = "flipping";
    refresh();

    // 正面 = 当前右页（翻走的那张），背面 = 目标跨页的左页（落下来的那张）
    const front = pageNode("right db-fp", spreads[idx].blocks.map((b) => b.cloneNode(true)), idx * 2 + 2);
    const back = pageNode("left db-fp", [spreads[target].left.cloneNode(true)], target * 2 + 1);
    flipper.innerHTML = "";
    flipper.append(front, back);
    back.classList.add("db-fp-back");

    const endClass = dir === 1 ? "db-fwd" : "db-bwd";
    if (dir === -1) flipper.classList.add("db-at-back");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => flipper.classList.add(endClass));
    });
    flipper.addEventListener("transitionend", function handler(e) {
      if (e.propertyName !== "transform") return;
      flipper.removeEventListener("transitionend", handler);
      idx = target;
      renderSpread();
      flipper.classList.remove(endClass, "db-at-back");
      flipper.style.transition = "none";
      flipper.innerHTML = "";
      void flipper.offsetWidth;
      flipper.style.transition = "";
      state = "open";
      refresh();
    });
  }

  cover.addEventListener("click", () => (state === "closed" ? open() : close()));
  cover.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (state === "closed") open();
      else close();
    }
  });
  closeBtn.addEventListener("click", close);
  prevBtn.addEventListener("click", () => flip(-1));
  nextBtn.addEventListener("click", () => flip(1));
  stage.addEventListener("click", (e) => {
    if (e.target === stage) close();
  });
  document.addEventListener("keydown", (e) => {
    if (state === "closed") return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") flip(1);
    else if (e.key === "ArrowLeft") flip(-1);
  });

  // 必须先显示再测量：display:none 的树里 clientHeight/scrollHeight 都是 0
  bookRoot.hidden = false;
  spreads = buildSpreads();
  renderSpread();
  refresh();
  if (fallback) fallback.hidden = true;
}
