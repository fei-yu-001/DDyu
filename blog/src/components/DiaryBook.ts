// 日记本：封面开合 + 3D 翻页（vanilla JS，无依赖）。
// 数据来源 <template id="diary-data">：每个 .db-entry 是一跨页（左页 .db-left + 右页 .db-right）。
// 条目类跨页只给 .db-right，左页由 data-emoji/data-date/data-image 现场拼装。

export function initDiaryBook() {
  const template = document.getElementById("diary-data");
  const bookRoot = document.getElementById("diary-book");
  const fallback = document.getElementById("story-fallback");
  if (!template || !bookRoot) return;

  const spreads = [...template.content.querySelectorAll(".db-entry")].map((el) => ({
    left: el.querySelector(".db-left"),
    right: el.querySelector(".db-right"),
    emoji: el.dataset.emoji || "",
    date: el.dataset.date || "",
    image: el.dataset.image || "",
  }));
  if (spreads.length === 0) return;

  let idx = 0;
  let state = "closed"; // closed | open | flipping

  const stage = document.createElement("div");
  stage.className = "db-stage";
  stage.setAttribute("role", "dialog");
  stage.setAttribute("aria-modal", "true");
  stage.setAttribute("aria-label", "我们的故事日记");
  stage.innerHTML = `
    <button class="db-close" type="button" aria-label="关闭日记">&#10005;</button>
    <div class="db-book">
      <div class="db-inner">
        <div class="db-spread"></div>
        <div class="db-flipper" aria-hidden="true"></div>
        <div class="db-cover" role="button" tabindex="0" aria-label="翻开日记">
          <div class="db-cover-face">
            <span class="db-cover-kicker">七七 &amp; 斐哥</span>
            <span class="db-cover-title">我们的故事</span>
            <span class="db-cover-avatars">
              <img src="/qiqi-avatar.jpg" alt="七七" />
              <img src="/feige-avatar.jpg" alt="斐哥" />
            </span>
            <span class="db-cover-hint">点击翻开</span>
          </div>
        </div>
      </div>
    </div>
    <div class="db-nav">
      <button class="db-prev" type="button" aria-label="上一页">&#8249;</button>
      <span class="db-indicator"></span>
      <button class="db-next" type="button" aria-label="下一页">&#8250;</button>
    </div>
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

  function node(html) {
    const t = document.createElement("template");
    t.innerHTML = html;
    return t.content.firstElementChild;
  }

  function leftContent(s, pageNo) {
    const left = s.left ? s.left.cloneNode(true) : node('<div class="db-left"></div>');
    if (!s.left) {
      if (s.emoji) left.append(node(`<span class="db-emoji">${s.emoji}</span>`));
      if (s.date) left.append(node(`<span class="db-date">${s.date}</span>`));
      if (s.image) left.append(node(`<img class="db-photo" src="${s.image}" alt="" loading="lazy" />`));
    }
    if (pageNo) left.append(node(`<span class="db-pageno">${pageNo}</span>`));
    return left;
  }

  function rightContent(s, pageNo) {
    const right = s.right.cloneNode(true);
    if (pageNo) right.append(node(`<span class="db-pageno">${pageNo}</span>`));
    return right;
  }

  function pageNode(cls, content) {
    const page = node(`<div class="db-page ${cls}"></div>`);
    page.append(content);
    return page;
  }

  function renderSpread() {
    const s = spreads[idx];
    spreadEl.innerHTML = "";
    const left = pageNode("left", leftContent(s, idx * 2 + 1));
    const right = pageNode("right", rightContent(s, idx * 2 + 2));
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

  function flip(dir) {
    if (state !== "open") return;
    const target = idx + dir;
    if (target < 0 || target >= spreads.length) return;
    state = "flipping";
    refresh();

    // 正面 = 当前右页（翻走的那张），背面 = 目标跨页的左页（落下来的那张）
    const front = pageNode("right db-fp", rightContent(spreads[idx], idx * 2 + 2));
    const back = pageNode("left db-fp", leftContent(spreads[target], target * 2 + 1));
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

  renderSpread();
  refresh();
  bookRoot.hidden = false;
  if (fallback) fallback.hidden = true;
}
