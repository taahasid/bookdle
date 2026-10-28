(() => {
  const PER_DAY = 5;
  const MAX_TRIES = 4;
  const EPOCH = Date.UTC(2026, 0, 1);
  const SQUARES = ["🟩", "🟨", "🟧", "🟥"]; // solved on try 1..4
  const PALETTES = [
    ["#2f7f7a", "#e2a83a", "#d6602c"],
    ["#d6602c", "#2f7f7a", "#f4ead5"],
    ["#8a8a3b", "#d6602c", "#e2a83a"],
    ["#1f5c58", "#c9796a", "#e2a83a"],
    ["#e2a83a", "#d6602c", "#2f7f7a"],
  ];

  const $ = (id) => document.getElementById(id);

  // ---------- Daily selection ----------
  const today = new Date();
  const dayIndex = Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - EPOCH) / 86400000);

  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const perms = {};
  function permutation(cycle) {
    if (perms[cycle]) return perms[cycle];
    const rand = mulberry32(cycle * 7919 + 1013);
    const idx = BOOKS.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return (perms[cycle] = idx);
  }

  // Walk one big shuffled deck per cycle; a full pass through the pool before any repeat.
  function booksForDay(day) {
    const picks = [];
    for (let g = day * PER_DAY; picks.length < PER_DAY; g++) {
      const b = permutation(Math.floor(g / BOOKS.length))[g % BOOKS.length];
      if (!picks.includes(b)) picks.push(b);
    }
    return picks;
  }

  const todays = booksForDay(Math.max(dayIndex, 0)).map((i) => BOOKS[i]);

  // ---------- Storage ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    },
  };

  let state = store.get("bookdle-state", null);
  const shelfId = todays.map((b) => b.title).join("|"); // resets saved progress if the pool changes
  if (!state || state.day !== dayIndex || state.shelf !== shelfId) {
    state = { day: dayIndex, shelf: shelfId, current: 0, books: todays.map(() => ({ guesses: [], status: "playing" })) };
  }
  const history = store.get("bookdle-history", {}); // day -> score
  const save = () => store.set("bookdle-state", state);

  // ---------- Matching ----------
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and").replace(/[^a-z0-9 ]/g, "").replace(/^(the|a|an) /, "").replace(/\s+/g, " ").trim();

  const catalog = [];
  BOOKS.forEach((b) => {
    [b.title, ...(b.aliases || [])].forEach((name) => catalog.push({ name, key: norm(name), book: b }));
  });
  catalog.sort((a, b) => a.name.localeCompare(b.name));

  const findBook = (text) => catalog.find((c) => c.key === norm(text))?.book;

  // ---------- Rendering ----------
  const triesUsed = (entry) => entry.guesses.length;
  const missCount = (entry) => entry.guesses.length - (entry.status === "won" ? 1 : 0);
  const points = (entry) => (entry.status === "won" ? MAX_TRIES - missCount(entry) : 0);
  const totalScore = () => state.books.reduce((s, e) => s + points(e), 0);
  const allDone = () => state.books.every((e) => e.status !== "playing");

  function renderShelf() {
    $("shelf").innerHTML = state.books.map((e, i) => {
      const mark = e.status === "won" ? "✓" : e.status === "lost" ? "✕" : "";
      return `<button class="spine${i === state.current ? " active" : ""}" data-i="${i}" aria-label="Book ${i + 1}">
        <span>${i + 1}</span><span class="mark">${mark}</span></button>`;
    }).join("");
  }

  function renderCard() {
    const book = todays[state.current];
    const entry = state.books[state.current];
    const misses = missCount(entry);
    const done = entry.status !== "playing";

    $("bookLabel").textContent = `Book No. ${state.current + 1}`;
    $("tries").innerHTML = Array.from({ length: MAX_TRIES }, (_, i) => {
      const cls = i < misses ? "used" : entry.status === "won" && i === misses ? "won" : "";
      return `<i class="${cls}"></i>`;
    }).join("");
    $("plot").textContent = book.plot;

    const clues = [
      ["Genre · Year", `${book.genre} · ${book.year}`],
      [book.heroLabel || "Main character", book.hero],
      ["Author", book.author],
    ];
    const shown = done ? 3 : Math.min(misses, 3);
    $("clues").innerHTML = clues.map(([label, value], i) => i < shown
      ? `<li class="clue open"><span class="num">${i + 1}</span><span><span class="label">${label}</span>${value}</span></li>`
      : `<li class="clue"><span class="num">${i + 1}</span><span>${label} — locked</span></li>`
    ).join("");

    $("guesses").innerHTML = entry.guesses
      .filter((g) => !(entry.status === "won" && g === entry.guesses.at(-1)))
      .map((g) => g ? `<li class="miss">${g}</li>` : `<li class="skip">skipped</li>`).join("");

    $("guessForm").hidden = done;
    $("reveal").hidden = !done;
    if (done) {
      const won = entry.status === "won";
      const [c1, c2, c3] = PALETTES[state.current];
      const cover = $("cover");
      cover.style.background = c1;
      cover.style.setProperty("--c2", c2);
      cover.style.setProperty("--c3", c3);
      cover.querySelector(".cover-title").textContent = book.title;
      cover.querySelector(".cover-author").textContent = book.author;
      $("verdict").className = `verdict ${won ? "win" : "lose"}`;
      $("verdict").textContent = won
        ? `${["First try!", "Second try", "Third try", "Last chance!"][misses]} · +${points(entry)}`
        : "Out of tries";
      $("revealTitle").textContent = book.title;
      $("revealMeta").textContent = `${book.author} · ${book.year}`;
      const next = nextUnplayed();
      $("nextBtn").textContent = next === -1 ? "See results →" : "Next book →";
    } else {
      $("guessInput").value = "";
      hideSuggestions();
    }
  }

  function render() { renderShelf(); renderCard(); }

  function nextUnplayed() {
    for (let k = 1; k <= PER_DAY; k++) {
      const i = (state.current + k) % PER_DAY;
      if (state.books[i].status === "playing") return i;
    }
    return -1;
  }

  // ---------- Guessing ----------
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2000);
  }

  function shake() {
    const c = $("card");
    c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake");
  }

  function submit(text) {
    const entry = state.books[state.current];
    if (entry.status !== "playing") return;
    const target = todays[state.current];

    if (text !== null) {
      const book = findBook(text);
      if (!text.trim()) return;
      if (!book) { toast("Not on our shelf. Pick a title from the list."); shake(); return; }
      if (entry.guesses.includes(book.title)) { toast("Already guessed that one"); return; }
      entry.guesses.push(book.title);
      if (book === target) entry.status = "won";
    } else {
      entry.guesses.push(null);
    }

    if (entry.status === "playing") {
      if (triesUsed(entry) >= MAX_TRIES) entry.status = "lost";
      else if (text !== null) { shake(); toast("Not quite. Here's a clue."); }
    }

    if (allDone()) {
      history[state.day] = totalScore();
      store.set("bookdle-history", history);
    }
    save();
    render();
  }

  // ---------- Autocomplete ----------
  let selected = -1;
  let matches = [];
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function showSuggestions() {
    const q = norm($("guessInput").value);
    const list = $("suggestions");
    if (!q) return hideSuggestions();
    matches = catalog.filter((c) => c.key.includes(q) || norm(c.name).includes(q))
      .sort((a, b) => (b.key.startsWith(q) - a.key.startsWith(q)))
      .slice(0, 8);
    selected = matches.length ? 0 : -1;
    if (!matches.length) return hideSuggestions();
    const rx = new RegExp(`(${$("guessInput").value.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i");
    list.innerHTML = matches.map((m, i) =>
      `<li role="option" data-i="${i}" class="${i === selected ? "sel" : ""}">${esc(m.name).replace(rx, "<mark>$1</mark>")}</li>`
    ).join("");
    list.classList.add("show");
    $("guessInput").setAttribute("aria-expanded", "true");
  }

  function hideSuggestions() {
    $("suggestions").classList.remove("show");
    $("guessInput").setAttribute("aria-expanded", "false");
    matches = []; selected = -1;
  }

  function highlight() {
    [...$("suggestions").children].forEach((li, i) => li.classList.toggle("sel", i === selected));
    $("suggestions").children[selected]?.scrollIntoView({ block: "nearest" });
  }

  $("guessInput").addEventListener("input", showSuggestions);
  $("guessInput").addEventListener("keydown", (e) => {
    if (!matches.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); selected = (selected + 1) % matches.length; highlight(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); selected = (selected - 1 + matches.length) % matches.length; highlight(); }
    else if (e.key === "Escape") hideSuggestions();
  });
  $("suggestions").addEventListener("mousedown", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    e.preventDefault();
    const pick = matches[+li.dataset.i];
    hideSuggestions();
    submit(pick.name);
  });
  $("guessInput").addEventListener("blur", () => setTimeout(hideSuggestions, 100));

  $("guessForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const typed = $("guessInput").value;
    const pick = selected >= 0 && matches[selected] && !findBook(typed) ? matches[selected].name : typed;
    hideSuggestions();
    submit(pick);
  });
  $("skipBtn").addEventListener("click", () => submit(null));

  $("shelf").addEventListener("click", (e) => {
    const s = e.target.closest(".spine");
    if (!s) return;
    state.current = +s.dataset.i;
    save();
    render();
  });

  $("nextBtn").addEventListener("click", () => {
    const next = nextUnplayed();
    if (next === -1) return openStats();
    state.current = next;
    save();
    render();
    $("guessInput").focus();
  });

  // ---------- Stats & sharing ----------
  function emojiRow() {
    return state.books.map((e) => e.status === "won" ? SQUARES[missCount(e)] : e.status === "lost" ? "⬛" : "⬜").join("");
  }

  function streaks() {
    const days = Object.keys(history).map(Number).sort((a, b) => a - b);
    let max = 0, run = 0, prev = null;
    days.forEach((d) => { run = prev !== null && d === prev + 1 ? run + 1 : 1; max = Math.max(max, run); prev = d; });
    const last = days.at(-1);
    const current = last === dayIndex || last === dayIndex - 1 ? run : 0;
    return { current, max };
  }

  function openStats() {
    const done = allDone();
    $("statsHead").textContent = done ? "Today's Shelf" : "Your Shelf";
    $("todayScore").innerHTML = `${totalScore()}<small> / ${PER_DAY * MAX_TRIES} PTS${done ? "" : " SO FAR"}</small>`;
    $("emojiGrid").textContent = emojiRow();

    const scores = Object.values(history);
    const { current, max } = streaks();
    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "–";
    $("statsRow").innerHTML = [
      [scores.length, "Played"], [avg, "Avg pts"], [current, "Streak"], [max, "Best"],
    ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");

    const buckets = [[17, 20], [13, 16], [9, 12], [5, 8], [0, 4]];
    const counts = buckets.map(([lo, hi]) => scores.filter((s) => s >= lo && s <= hi).length);
    const peak = Math.max(1, ...counts);
    const mine = history[dayIndex];
    $("dist").innerHTML = buckets.map(([lo, hi], i) => {
      const isToday = mine !== undefined && mine >= lo && mine <= hi;
      return `<div class="row"><span>${lo}–${hi}</span>
        <span class="bar${isToday ? " today" : ""}" style="width:${Math.max(8, (counts[i] / peak) * 100)}%">${counts[i]}</span></div>`;
    }).join("");

    $("shareBtn").hidden = !done;
    $("statsDlg").showModal();
  }

  $("shareBtn").addEventListener("click", async () => {
    const text = `Bookdle #${dayIndex + 1} · ${totalScore()}/${PER_DAY * MAX_TRIES}\n${emojiRow()}\n${location.href.split("#")[0]}`;
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard");
    } catch {
      if (navigator.share) navigator.share({ text }).catch(() => {});
      else toast("Couldn't copy, sorry");
    }
  });

  function tick() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    let s = Math.max(0, Math.floor((midnight - now) / 1000));
    if (s === 0) return location.reload();
    const pad = (n) => String(n).padStart(2, "0");
    const str = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
    $("countdown").textContent = str;
    $("countdownFoot").textContent = `next in ${str}`;
  }

  // ---------- Modals ----------
  document.querySelectorAll("dialog").forEach((d) => {
    d.addEventListener("click", (e) => {
      if (e.target === d || e.target.closest("[data-close]")) d.close();
    });
  });
  $("helpBtn").addEventListener("click", () => $("helpDlg").showModal());
  $("statsBtn").addEventListener("click", openStats);

  // ---------- Boot ----------
  $("puzzleNo").textContent = `No. ${dayIndex + 1}`;
  render();
  tick();
  setInterval(tick, 1000);
  if (!store.get("bookdle-seen", false)) {
    store.set("bookdle-seen", true);
    $("helpDlg").showModal();
  }
})();
