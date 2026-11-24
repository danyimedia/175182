(function () {
  "use strict";

  var W = JSON.parse(document.getElementById("wrap").textContent);
  var STORE = "vault.key", PENDING = "vault.pending", TOKEN = "vault.token", BANNER = "vault.banner.hidden";
  var KEY = null, DB = null, ALL = [], E = new Map(), P = new Map(), PROJECTS = [];
  // SHARE is set when the page was opened from a share link: one project's board, view only, no password. { key, prefix, project }
  var SHARE = null, MAC = null;
  var S = { lib: { type: "all", shelf: null, tag: null, check: false }, proj: {}, q: "", base: "#/ideas", back: "#/ideas", drawn: null, dirty: false, keepScroll: false };
  var STATUSES = ["spark", "developing", "ready", "made", "parked"];
  var LABEL = { idea: "Idea", reference: "Reference", tool: "Tool", note: "Note" };
  var DAY = 864e5;
  var PLATFORM = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", vimeo: "Vimeo", x: "X", twitter: "X", facebook: "Facebook", pinterest: "Pinterest", behance: "Behance", dribbble: "Dribbble", reddit: "Reddit", threads: "Threads", linkedin: "LinkedIn" };

  // ------------------------------------------------------------ small helpers
  function $(s, r) { return (r || document).querySelector(s); }
  function h(tag, attrs) {
    var el = document.createElement(tag), k, v;
    if (attrs) for (k in attrs) {
      v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") Object.assign(el.style, v);
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, k === "href" && SHARE && String(v).charAt(0) === "#" ? there(v) : v);
    }
    put(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }
  // append that accepts nested arrays and skips empty values
  function put(el) { flat(Array.prototype.slice.call(arguments, 1)).forEach(function (kid) { el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }); return el; }
  function flat(a) { return a.flat(Infinity).filter(function (x) { return x != null && x !== false && x !== ""; }); }
  var ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
    grid: '<rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="3" width="8" height="6" rx="1.5"/><rect x="3" y="15" width="8" height="6" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    out: '<path d="M14 5h5v5M19 5l-8 8M11 7H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5"/>',
    back: '<path d="m14 6-6 6 6 6"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>'
  };
  function icon(n) { var t = document.createElement("template"); t.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + "</svg>"; return t.content.firstChild; }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  function safe(u) { return /^https?:\/\//i.test(u || "") ? u : null; }
  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function day(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  function cid() { var u = new Uint8Array(6); crypto.getRandomValues(u); return Array.prototype.map.call(u, function (b) { return (b % 36).toString(36); }).join("") + Date.now().toString(36).slice(-3); }
  function titleFrom(note) { var w = (note || "").replace(/^idea:\s*/i, "").trim().split(/\s+/).slice(0, 6).join(" "); return w ? w[0].toUpperCase() + w.slice(1) : "Untitled"; }
  function toast(msg) { var t = $("#toast"); if (!t) return; t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("on"); }, 2600); }
  // In a shared board every address keeps the link's key in front ("#s/<key>/e/<id>"), so a reload or a copied address
  // still opens. here() is the address without it; there() puts it back. A shared board has two places: the board and an entry.
  function here() {
    if (!SHARE) return location.hash;
    var rest = location.hash.indexOf(SHARE.prefix) === 0 ? location.hash.slice(SHARE.prefix.length) : "";
    return /^\/e\//.test(rest) ? "#" + rest : "#/p/" + SHARE.project;
  }
  function there(hash) { return SHARE ? SHARE.prefix + hash.slice(1) : hash; }
  function go(hash) { if (here() === hash) route(); else location.hash = there(hash); }

  // ------------------------------------------------------------ password gate
  function bytes(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function text(u) { var s = ""; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }
  async function unlock(password) {
    var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    var lock = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: bytes(W.salt), iterations: W.iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(W.iv) }, lock, bytes(W.wk)));
  }
  function decrypt(buf) { var u = new Uint8Array(buf); return crypto.subtle.decrypt({ name: "AES-GCM", iv: u.subarray(0, 12) }, KEY, u.subarray(12)); }

  (function gate() {
    var form = $("#login"), pw = $("#pw"), remember = $("#remember"), btn = $("#go"), msg = $("#msg");
    function say(words, show) { msg.textContent = words; msg.className = show ? "note" : "vh"; }
    if (!window.crypto || !crypto.subtle) { say("This browser can only open it over a secure (https) connection.", true); btn.disabled = true; return; }
    if (/[?&]forget\b/.test(location.search)) { set(STORE, null); history.replaceState(null, "", location.pathname); }
    var shared = /^#s\/([A-Za-z0-9_-]{43})(\/|$)/.exec(location.hash);
    if (shared) {
      form.hidden = true;
      startShare(shared[1]).catch(function (err) {
        var gone = err && (err.gone || err.name === "OperationError");
        $("#gate").replaceChildren(h("div", { class: "gate-card" }, h("div", { class: "gate-msg" }, gone ? "This link is no longer active." : "Could not load. Check the connection and try again.")));
      });
      return;
    }
    var remembered = get(STORE);
    if (remembered) {
      form.hidden = true;
      start(bytes(remembered)).catch(function (err) { form.hidden = false; if (err && err.name === "OperationError") set(STORE, null); else say("Could not load. Check the connection and try again.", true); });
    }
    pw.addEventListener("input", function () { pw.classList.remove("bad"); say("", false); });
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      pw.classList.remove("bad"); say("", false); btn.disabled = true;
      var raw;
      try { raw = await unlock(pw.value); }
      catch (err) { btn.disabled = false; pw.classList.add("bad"); say("That password does not open it.", false); pw.select(); return; }
      try { await start(raw); if (remember.checked) set(STORE, text(raw)); }
      catch (err) { btn.disabled = false; say("Could not load. Check the connection and try again.", true); }
    });
  })();

  async function start(raw) {
    KEY = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    MAC = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    var r = await fetch("db.enc", { cache: "no-store" });
    if (!r.ok) throw new Error("db " + r.status);
    DB = JSON.parse(new TextDecoder().decode(await decrypt(await r.arrayBuffer())));
    enter();
  }
  // A share link carries its own key in the address ("#s/<key>"), which browsers never send to the server. That key opens
  // one small file: the board, its entries and the keys of their media. The rest of the vault stays locked to it.
  async function startShare(k) {
    var raw = bytes(k.replace(/-/g, "+").replace(/_/g, "/") + "=");
    var sum = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("vault-share:" + k)));
    var name = Array.prototype.map.call(sum, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("").slice(0, 28);
    var key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    var r = await fetch("s/" + name + ".enc", { cache: "no-store" });
    if (r.status === 404) { var gone = new Error("gone"); gone.gone = true; throw gone; }
    if (!r.ok) throw new Error("share " + r.status);
    var u = new Uint8Array(await r.arrayBuffer());
    DB = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.subarray(0, 12) }, key, u.subarray(12))));
    SHARE = { key: k, prefix: "#s/" + k, project: DB.projects[0].id };
    S.base = S.back = "#/p/" + SHARE.project;
    document.documentElement.dataset.share = "1";
    document.title = DB.projects[0].title;
    enter();
  }
  function enter() {
    rebuild();
    $("#gate").remove();
    $("#app").hidden = false;
    shell();
    window.addEventListener("hashchange", route);
    window.addEventListener("resize", layoutAll);
    route();
  }

  // ------------------------------------------------------------ encrypted media
  var mediaCache = new Map(), videos = [], waiting = [], running = 0, fileKeys = new Map();
  // Every media file has its own key. The owner's key works it out from the file's name; a shared board carries the keys of its own files.
  function keyFor(name) {
    if (!fileKeys.has(name)) fileKeys.set(name, (SHARE ? Promise.resolve(bytes((DB.keys || {})[name] || "")) : crypto.subtle.sign("HMAC", MAC, new TextEncoder().encode("file:" + name)))
      .then(function (raw) { return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]); }));
    return fileKeys.get(name);
  }
  function unseal(name, buf) { return keyFor(name).then(function (k) { var u = new Uint8Array(buf); return crypto.subtle.decrypt({ name: "AES-GCM", iv: u.subarray(0, 12) }, k, u.subarray(12)); }); }
  function mediaURL(name, mime, keep) {
    if (mediaCache.has(name)) return mediaCache.get(name);
    var p = new Promise(function (resolve, reject) { waiting.push({ name: name, mime: mime, resolve: resolve, reject: reject }); pump(); });
    mediaCache.set(name, p);
    p.catch(function () { mediaCache.delete(name); });
    if (mime === "video/mp4" && !keep) {
      videos.push(name);
      if (videos.length > 14) { var old = videos.shift(); var q = mediaCache.get(old); mediaCache.delete(old); if (q) q.then(function (u) { URL.revokeObjectURL(u); }, function () {}); }
    }
    return p;
  }
  function pump() {
    while (running < 6 && waiting.length) {
      var job = waiting.shift(); running++;
      (function (job) {
        fetch(job.name).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(function (buf) { return unseal(job.name, buf); })
          .then(function (plain) { job.resolve(URL.createObjectURL(new Blob([plain], { type: job.mime }))); }, job.reject)
          .then(function () { running--; pump(); });
      })(job);
    }
  }
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (list) {
    list.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); loadImg(en.target); } });
  }, { rootMargin: "700px" }) : null;
  function loadImg(img) { mediaURL(img.dataset.m, "image/webp").then(function (u) { img.onload = function () { img.classList.add("in"); }; img.src = u; }, function () {}); }
  function lazyImg(name) { var img = h("img", { class: "lazy", alt: "", decoding: "async" }); img.dataset.m = name; if (io) io.observe(img); else loadImg(img); return img; }
  function posterOf(e) { return e.clips && e.clips[0] ? e.clips[0].poster : e.image ? e.image.file : null; }

  // ------------------------------------------------------------ data
  function loadPending() { try { return JSON.parse(get(PENDING) || "[]"); } catch (e) { return []; } }
  function savePending(ops) { set(PENDING, ops.length ? JSON.stringify(ops) : null); }
  function priority(i) {
    var refs = (i.links || []).filter(function (id) { var o = E.get(id); return o && (o.type === "reference" || o.type === "tool"); }).length;
    return (i.excitement || 3) * (6 - (i.effort || 3)) + 2 * (i.outlets || []).length + Math.min(refs, 3) + ((i.seen_in_wild || []).length ? 3 : 0);
  }
  function dusty(i) { return i.status !== "made" && i.status !== "parked" && Date.now() - Date.parse(i.touched || i.updated || i.created) > 30 * DAY; }
  function byNew(a, b) { return (b.created || "").localeCompare(a.created || ""); }
  function byPri(a, b) { return b.priority - a.priority || byNew(a, b); }

  // The site's own data plus whatever was typed here and is still waiting to be filed.
  function rebuild() {
    var folded = new Set(DB.folded || []);
    var ops = SHARE ? [] : loadPending().filter(function (o) { return !folded.has(o.cid); });
    if (!SHARE) savePending(ops);
    PROJECTS = DB.projects.map(function (p) { return Object.assign({}, p); });
    ALL = DB.entries.map(function (e) { return Object.assign({}, e); });
    E = new Map(ALL.map(function (e) { return [e.id, e]; }));
    ops.forEach(function (o) {
      if (o.kind === "project") PROJECTS.push({ id: "new-" + o.cid, title: o.payload.title, about: o.payload.about || "", pending: true, status: "active" });
      else if (o.kind === "add") {
        var p = o.payload, e = { id: "new-" + o.cid, cid: o.cid, pending: true, sent: o.sent || null, type: p.type, title: titleFrom(p.note), raw_note: p.note, source_url: p.url || null,
          clip_hint: p.clip || null, shelf: p.shelf || null, folder: p.folder || null, projects: p.project ? [p.project] : [], status: "spark", outlets: [], created: o.at, updated: o.at, touched: o.at };
        ALL.unshift(e); E.set(e.id, e);
      } else if (o.kind === "edit") { var t = E.get(o.id); if (t) { Object.assign(t, o.changes); t.edited = true; } }
    });
    P = new Map(PROJECTS.map(function (p) { return [p.id, p]; }));
    ALL.forEach(function (e) {
      if (e.type === "idea") e.priority = priority(e);
      e.hay = [e.title, e.juice, e.how, e.note, e.raw_note, e.transcript, e.caption, e.pitch, e.audience, (e.sections || []).map(function (s) { return [s.title, s.text, (s.points || []).join(" ")].join(" "); }).join(" "), e.tool_name, e.use_when, e.shelf, e.folder, e.author, LABEL[e.type], (e.tags || []).join(" "), (e.outlets || []).join(" "),
        (e.projects || []).map(function (id) { return (P.get(id) || {}).title; }).join(" ")].filter(Boolean).join(" \n ").toLowerCase();
    });
  }
  function match(e, q) { return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (t) { return e.hay.indexOf(t) >= 0; }); }

  function pushOp(op) { var ops = loadPending(); ops.push(op); savePending(ops); }
  function edit(id, changes) {
    var e = E.get(id);
    if (!e || e.pending || SHARE) return;
    if (e.type === "idea") changes.touched = new Date().toISOString();
    var ops = loadPending(), op = ops.find(function (o) { return o.kind === "edit" && o.id === id && !o.sent; });
    if (op) Object.assign(op.changes, changes); else ops.push({ cid: cid(), kind: "edit", id: id, at: new Date().toISOString(), changes: changes });
    savePending(ops);
    refresh();
  }
  function refresh() { rebuild(); S.dirty = true; S.keepScroll = true; updateSync(); route(); }

  // ------------------------------------------------------------ handing changes to GitHub
  function opTitle(o) {
    if (o.kind === "project") return "New project: " + o.payload.title;
    if (o.kind === "add") return "New " + o.payload.type + ": " + (o.payload.note || o.payload.url || "").replace(/\s+/g, " ").slice(0, 70);
    var e = E.get(o.id);
    return "Edit " + (e ? e.title : o.id) + " (" + Object.keys(o.changes).filter(function (k) { return k !== "touched"; }).join(", ") + ")";
  }
  function issueFor(ops) {
    var data = ops.map(function (o) { return { cid: o.cid, kind: o.kind, at: o.at, id: o.id, changes: o.changes, payload: o.payload }; });
    return { title: ops.length === 1 ? opTitle(ops[0]) : ops.length + " changes from the site",
      body: ops.map(function (o) { return "- " + opTitle(o); }).join("\n") + "\n\n```vault\n" + JSON.stringify(data) + "\n```\n" };
  }
  function mark(batch, how) {
    var ids = new Set(batch.map(function (o) { return o.cid; }));
    savePending(loadPending().map(function (o) { if (ids.has(o.cid)) { o.sent = how; o.sentAt = new Date().toISOString(); } return o; }));
    rebuild(); S.dirty = true; updateSync();
  }
  function sendPending() {
    var ops = loadPending().filter(function (o) { return !o.sent; });
    if (!ops.length) return;
    var repo = DB.settings.inbox_repo, token = get(TOKEN), is;
    if (!repo) { toast("Saved on this device"); return; }
    if (token) {
      is = issueFor(ops);
      fetch("https://api.github.com/repos/" + repo + "/issues", { method: "POST", headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
        body: JSON.stringify({ title: is.title, body: is.body, labels: ["inbox"] }) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); mark(ops, "api"); toast("Saved to GitHub"); if ($("#sheet")) route(); })
        .catch(function () { toast("GitHub didn't take it. Still saved on this device."); });
      return;
    }
    // No token on this device: hand it over through GitHub's own new-issue page, in a batch that fits in a link.
    var batch = ops.slice(), link;
    for (;;) {
      is = issueFor(batch);
      link = "https://github.com/" + repo + "/issues/new?labels=inbox&title=" + encodeURIComponent(is.title) + "&body=" + encodeURIComponent(is.body);
      if (link.length < 7000 || batch.length === 1) break;
      batch.pop();
    }
    if (link.length >= 7000) {
      if (navigator.clipboard) navigator.clipboard.writeText(is.body).catch(function () {});
      link = "https://github.com/" + repo + "/issues/new?labels=inbox&title=" + encodeURIComponent(is.title) + "&body=" + encodeURIComponent("Paste here: the details were copied to your clipboard.");
    }
    window.open(link, "_blank", "noopener");
    mark(batch, "link");
  }
  function updateSync() {
    var pill = $("#sync"); if (!pill) return;
    var ops = loadPending(), unsent = ops.filter(function (o) { return !o.sent; }).length;
    pill.hidden = !ops.length;
    pill.className = "pill" + (unsent ? " hot" : "");
    pill.textContent = unsent ? unsent + " to send" : ops.length + " waiting";
  }

  // ------------------------------------------------------------ frame and routing
  var searchInput;
  function shell() {
    function tab(name, label) { return h("a", { href: "#/" + name, "data-tab": name }, h("span", null, label)); }
    function btab(name, label, ic) { return h("a", { href: "#/" + name, "data-tab": name }, icon(ic), label); }
    if (SHARE) {
      $("#app").append(
        h("header", { class: "top" }, h("div", { class: "bar" }, h("span", { class: "brand" }, "VAULT"), h("div", { class: "grow" }), h("span", { class: "viewonly" }, "Shared board, view only"))),
        h("main", { id: "view" }), h("div", { id: "toast", role: "status" }));
      return;
    }
    searchInput = h("input", { type: "search", placeholder: "Search notes, tags, tools…", "aria-label": "Search", autocomplete: "off", oninput: onSearch });
    $("#app").append(
      h("header", { class: "top vaultskin" },
        h("div", { class: "bar" },
          h("a", { class: "brand", href: "#/ideas" }, "VAULT"),
          h("div", { class: "grow" }),
          h("div", { class: "search" }, icon("search"), searchInput),
          h("button", { class: "pill", id: "sync", hidden: true, onclick: function () { go("#/inbox"); } }),
          h("a", { class: "btn primary small add", href: "#/add" }, icon("plus"), "Add"),
          h("a", { class: "icon-btn", href: "#/settings", "aria-label": "Settings" }, icon("dots"))),
        // the three sections sit in their own row, sharing the full width; each has its own page colour (see app.css)
        h("nav", { class: "tabs" }, tab("ideas", "Ideas"), tab("library", "Library"), tab("projects", "Projects"))),
      h("main", { id: "view" }),
      h("nav", { class: "bottom vaultskin" }, btab("ideas", "Ideas", "bolt"), btab("library", "Library", "grid"),
        h("a", { class: "plus", href: "#/add", "aria-label": "Add" }, h("span", null, icon("plus"))),
        btab("projects", "Projects", "folder"), btab("search", "Search", "search")),
      h("div", { id: "toast", role: "status" }));
    updateSync();
  }
  function parse(hash) { var seg = (hash || "").replace(/^#\/?/, "").split("/"); return { name: seg[0] || "ideas", arg: seg[1] ? decodeURIComponent(seg[1]) : "" }; }
  var SHEETS = { e: entrySheet, edit: editSheet, add: addSheet, inbox: inboxSheet, settings: settingsSheet, newproject: projectSheet };
  function route() {
    // a share link opened in a tab that already has the vault open: load it afresh, as the person receiving it would see it
    if (!SHARE && location.hash.indexOf("#s/") === 0) { location.reload(); return; }
    var hash = here() || "#/ideas", r = parse(hash);
    if (SHEETS[r.name]) {
      if (S.drawn == null) draw(S.base);
      openSheet(SHEETS[r.name](r.arg));
      return;
    }
    closeSheet();
    if (S.drawn !== hash || S.dirty) {
      var same = S.drawn === hash, y = window.scrollY;
      S.base = hash; draw(hash);
      window.scrollTo(0, same ? y : 0);
    }
  }
  var VIEWS = { ideas: viewIdeas, f: viewFolder, library: viewLibrary, projects: viewProjects, p: viewProject, search: viewSearch };
  function draw(hash) {
    var r = parse(hash), name = VIEWS[r.name] ? r.name : "ideas";
    document.body.dataset.route = name;
    applyTheme(name === "p" ? P.get(r.arg) : null);
    var on = name === "p" ? "projects" : name === "f" ? "ideas" : name;
    // search keeps the colour of the section it was opened from
    if (on === "ideas" || on === "library" || on === "projects") document.documentElement.dataset.zone = on;
    document.querySelectorAll("[data-tab]").forEach(function (a) { a.classList.toggle("on", a.dataset.tab === on); });
    var view = $("#view");
    view.textContent = "";
    flat([banner(), VIEWS[name](r.arg)]).forEach(function (n) { view.append(n); });
    S.drawn = hash; S.dirty = false;
    layoutAll();
    if (name === "search" && !searchInput.value && window.innerWidth < 860) setTimeout(function () { searchInput.focus(); }, 60);
  }
  function redraw() { var y = window.scrollY; draw(S.base); window.scrollTo(0, y); }
  function openSheet(node) {
    var old = $("#sheet"), keep = 0;
    if (old) { keep = $(".panel", old).scrollTop; old.remove(); }
    var panel = h("div", { class: "panel" + (node.dataset.narrow ? " narrow" : ""), role: "dialog", "aria-modal": "true" },
      h("button", { class: "x", type: "button", "aria-label": "Close", onclick: closeRoute }, icon("x")), node);
    document.body.append(h("div", { id: "sheet" }, h("div", { class: "scrim", onclick: closeRoute }), panel));
    document.body.style.overflow = "hidden";
    panel.scrollTop = S.keepScroll ? keep : 0;
    S.keepScroll = false;
  }
  function closeSheet() {
    var sh = $("#sheet");
    if (sh) { sh.querySelectorAll("video").forEach(function (v) { v.pause(); }); sh.remove(); }
    document.body.style.overflow = "";
  }
  function closeRoute() { location.hash = there(S.base); }
  function onSearch() {
    S.q = searchInput.value;
    if (parse(S.base).name !== "search") { if (!S.q.trim()) return; S.back = S.base; location.hash = "#/search"; }
    else if (!S.q.trim() && window.innerWidth >= 860) location.hash = S.back;
    else redraw();
  }
  document.addEventListener("keydown", function (ev) {
    if (!DB) return;
    if (SHARE) { if (ev.key === "Escape" && $("#sheet")) closeRoute(); return; }
    var t = ev.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    if (ev.key === "Escape") { if ($("#sheet")) closeRoute(); else if (typing) t.blur(); return; }
    if (typing || ev.metaKey || ev.ctrlKey || ev.altKey || $("#sheet")) return;
    if (ev.key === "/") { ev.preventDefault(); if (window.innerWidth < 860) location.hash = "#/search"; searchInput.focus(); }
    else if (ev.key === "n") { ev.preventDefault(); location.hash = "#/add"; }
    else if (/^[0-9]$/.test(ev.key) && document.body.dataset.route === "library") {
      var shelves = DB.taxonomy.shelves.filter(function (s) { return ALL.some(function (e) { return e.shelf === s; }); });
      S.lib.shelf = ev.key === "0" ? null : shelves[Number(ev.key) - 1] || S.lib.shelf; S.lib.tag = null; redraw();
    }
  });

  // ------------------------------------------------------------ shared pieces
  function head(title, sub, extra) { return h("div", { class: "head" }, h("div", { class: "grow" }, h("h1", null, title), sub ? h("p", null, sub) : null), extra); }
  function sec(title, sub) { return h("div", { class: "sec" }, h("h2", null, title), sub ? h("span", null, sub) : null); }
  function banner() {
    var n = ALL.filter(function (e) { return e.sample; }).length;
    if (!n || get(BANNER)) return null;
    return h("div", { class: "banner" }, h("span", null, h("b", null, "Demo data. "), n + " sample items show how the layout works. They go when your real captures come in."),
      h("button", { type: "button", "aria-label": "Hide", onclick: function () { set(BANNER, "1"); this.parentNode.remove(); } }, icon("x")));
  }
  function seg(options, current, onPick) {
    var el = h("div", { class: "seg", role: "tablist" });
    options.forEach(function (o) {
      el.append(h("button", { type: "button", class: o[0] === current ? "on" : "", onclick: function () {
        el.querySelectorAll("button").forEach(function (b) { b.classList.remove("on"); }); this.classList.add("on"); onPick(o[0]);
      } }, o[1]));
    });
    return el;
  }
  function waitChip(e) { return h("span", { class: "chip wait" }, e.sent ? "waiting for Claude" : "not sent yet"); }
  function projChips(e, linked) {
    return (e.projects || []).map(function (id) { var p = P.get(id); return p ? h(linked ? "a" : "span", { class: "chip proj", href: linked ? "#/p/" + encodeURIComponent(id) : null }, p.title) : null; });
  }
  function badges(e) {
    var c = e.clips && e.clips[0];
    return h("div", { class: "badges" },
      e.type === "tool" && !e.group ? h("span", { class: "badge b-tool" }, "Tool") : null,
      e.confidence === "low" ? h("span", { class: "badge b-check" }, "Check me") : null,
      e.needs_trim ? h("span", { class: "badge b-check" }, "Needs trim") : null,
      e.tier === 2 ? h("span", { class: "badge b-tier" }, "2nd tier") : null,
      e.sample ? h("span", { class: "badge" }, "Sample") : null,
      c ? h("span", { class: "badge b-dur" }, c.gif ? "GIF" : fmt(c.dur || c.out - c.in)) : null);
  }
  var playing = null;
  function hoverPlay(target, media, c) {
    var v = null, on = false;
    function play() {
      on = true;
      if (playing && playing !== stop) playing();
      playing = stop;
      if (!v) {
        v = h("video", { loop: true, playsinline: true, preload: "none" }); v.muted = true; media.append(v);
        mediaURL(c.file, "video/mp4").then(function (u) { v.src = u; if (on) show(); }, function () {});
      } else show();
    }
    function show() { var p = v.play(); if (p) p.then(function () { v.classList.add("in"); }, function () {}); media.classList.add("playing"); }
    function stop() { on = false; if (v) { v.pause(); v.classList.remove("in"); try { v.currentTime = 0; } catch (err) { /* not loaded yet */ } } media.classList.remove("playing"); if (playing === stop) playing = null; }
    if (window.matchMedia("(hover: hover)").matches) { target.addEventListener("mouseenter", play); target.addEventListener("mouseleave", stop); }
    else media.addEventListener("click", function (ev) { if (!on) { ev.preventDefault(); play(); } });
  }
  // Nothing in the grid moves by itself: GIFs and clips alike play only under the pointer (or after a tap on a phone),
  // because many of these loops flicker and a wall of them playing at once is hard to look at.
  // A card for anything: media when it has some, text when it doesn't. Returns the element and its rough height for the masonry.
  function card(e) {
    var c = e.clips && e.clips[0], m = c || e.image;
    if (!m) {
      var body = e.type === "idea" ? e.pitch || e.note || e.raw_note : e.juice || e.use_when || e.note || e.raw_note;
      var t = h("a", { class: "card text t-" + e.type + (e.pending ? " pending" : ""), href: "#/e/" + e.id },
        h("span", { class: "kick" }, LABEL[e.type]), e.type === "note" && !(e.sections || []).length ? null : h("h3", null, e.type === "tool" && e.tool_name ? e.tool_name : e.title), h("p", null, body),
        e.pending || e.sample ? h("div", { class: "chips" }, e.pending ? waitChip(e) : null, e.sample ? h("span", { class: "chip sample" }, "sample") : null) : null);
      return { el: t, ratio: 0.5 + Math.min(String(body || "").length, 240) / 300 };
    }
    var ratio = Math.min(m.h / m.w, c ? 1.78 : 1.3);
    var media = h("div", { class: "media" + (c ? "" : " page"), style: { aspectRatio: "1 / " + ratio.toFixed(3), background: e.color || "" } }, lazyImg(c ? c.poster : e.image.file), badges(e),
      c ? h("span", { class: "tap" + (c.full ? " always" : "") }, icon("play")) : null);
    var a = h("a", { class: "card", href: "#/e/" + e.id }, media, h("div", { class: "meta" }, h("h3", null, e.title), e.juice ? h("p", null, e.juice) : null));
    if (c && !c.full) hoverPlay(a, media, c);
    return { el: a, ratio: ratio + 0.34 };
  }
  function masonry(items) { var w = h("div", { class: "masonry" }); w._items = items; return w; }
  function layout(w) {
    var width = w.clientWidth || $("#view").clientWidth - 32;
    var n = Math.max(2, Math.min(6, Math.floor(width / 240)));
    if (w._n === n) return;
    w._n = n; w.textContent = "";
    var cols = [], hts = [], i;
    for (i = 0; i < n; i++) { cols.push(h("div", { class: "col" })); hts.push(0); w.append(cols[i]); }
    w._items.forEach(function (it) { var k = hts.indexOf(Math.min.apply(null, hts)); cols[k].append(it.el); hts[k] += it.ratio; });
  }
  function layoutAll() { document.querySelectorAll(".masonry").forEach(layout); }

  // ------------------------------------------------------------ Ideas
  function ideaCard(i) {
    var refs = (i.links || []).map(function (id) { return E.get(id); }).filter(function (o) { return o && posterOf(o); });
    return h("a", { class: "idea" + (dusty(i) ? " dusty" : "") + (i.pending ? " pending" : ""), href: "#/e/" + i.id },
      h("div", { class: "score" }, h("b", null, i.pending ? "–" : i.priority), h("span", null, "score")),
      h("div", { class: "body" },
        h("h3", null, i.title),
        h("p", null, i.pitch || i.note || i.raw_note),
        h("div", { class: "chips" },
          i.pending ? waitChip(i) : null,
          h("span", { class: "chip status s-" + i.status }, i.status),
          (i.seen_in_wild || []).length ? h("span", { class: "chip clock" }, icon("clock"), "clock's ticking") : null,
          (i.outlets || []).map(function (o) { return h("span", { class: "chip" }, o); }),
          projChips(i),
          i.sample ? h("span", { class: "chip sample" }, "sample") : null),
        refs.length ? h("div", { class: "thumbs" },
          refs.slice(0, 5).map(function (o) { return h("div", { class: "th", style: { background: o.color || "" } }, lazyImg(posterOf(o))); }),
          refs.length > 5 ? h("div", { class: "th more" }, "+" + (refs.length - 5)) : null) : null));
  }
  // Ideas live in folders (taxonomy.json: idea_folders). The Ideas page shows the folders; each one opens its own ranked list.
  function folders() { return (DB.taxonomy.idea_folders || []).slice(); }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
  function ideaLists(ideas) {
    var done = ideas.filter(function (i) { return i.status === "made" || i.status === "parked"; });
    var live = ideas.filter(function (i) { return done.indexOf(i) < 0; });
    return { all: ideas, done: done, dust: live.filter(dusty).sort(byPri), next: live.filter(function (i) { return !dusty(i); }).sort(byPri) };
  }
  function ideaSections(l) {
    return [
      h("div", { class: "ideas" }, l.next.map(ideaCard)),
      l.dust.length ? [sec("Gathering dust", "untouched for 30 days or more"), h("div", { class: "ideas" }, l.dust.map(ideaCard))] : null,
      l.done.length ? [sec("Made and parked"), h("div", { class: "ideas" }, l.done.map(ideaCard))] : null
    ];
  }
  function viewIdeas() {
    var names = folders(), ideas = ALL.filter(function (e) { return e.type === "idea"; });
    var loose = ideas.filter(function (i) { return names.indexOf(i.folder) < 0; });
    var concepts = loose.filter(function (i) { return (i.projects || []).length; }), filed = ideas.length - loose.length;
    loose = loose.filter(function (i) { return concepts.indexOf(i) < 0; });
    var recent = ALL.filter(function (e) { return e.type !== "idea"; }).sort(byNew).slice(0, 12);
    return [
      head("Ideas", ideas.length ? plural(filed, "idea") + " in " + plural(names.length, "folder") + (concepts.length ? ", " + plural(concepts.length, "project concept") : "") : "No ideas yet. Send one to Claude and say which folder it's for, or use Add."),
      h("div", { class: "folders" }, names.map(function (name) {
        var l = ideaLists(ideas.filter(function (i) { return i.folder === name; })), top = l.next[0];
        return h("a", { class: "fcard", href: "#/f/" + encodeURIComponent(name) },
          h("div", { class: "ico" }, icon("folder")),
          h("div", { class: "grow" }, h("h3", null, name), h("p", null, l.all.length ? plural(l.all.length, "idea") + (top ? ". Next up: " + top.title : "") : "No ideas yet")));
      })),
      loose.length ? [sec("Not in a folder yet"), ideaSections(ideaLists(loose))] : null,
      concepts.length ? [sec("Project concepts", "ideas that belong to a project"), ideaSections(ideaLists(concepts))] : null,
      recent.length ? [sec("Recently added to the library"), h("div", { class: "row" }, recent.map(function (e) { return card(e).el; }))] : null
    ];
  }
  function viewFolder(name) {
    var back = h("a", { class: "back", href: "#/ideas" }, icon("back"), "Ideas");
    if (folders().indexOf(name) < 0) return [back, head("Not found")];
    var l = ideaLists(ALL.filter(function (e) { return e.type === "idea" && e.folder === name; }));
    return [
      back,
      head(name, l.next.length ? plural(l.next.length, "idea") + ", ranked by excitement, effort and reach" : l.all.length ? "Nothing waiting to be made." : "No ideas here yet. Send one to Claude and say it's for " + name + ".",
        h("a", { class: "btn primary", href: "#/add/f:" + encodeURIComponent(name) }, icon("plus"), "Add idea")),
      ideaSections(l)
    ];
  }

  // ------------------------------------------------------------ Library and Toolbox
  function viewLibrary() {
    var L = S.lib;
    var pool = ALL.filter(function (e) { return e.type === "reference" || e.type === "tool"; });
    var typed = L.type === "all" ? pool : pool.filter(function (e) { return e.type === L.type; });
    var shelves = DB.taxonomy.shelves.map(function (s) { return [s, typed.filter(function (e) { return e.shelf === s; }).length]; }).filter(function (x) { return x[1]; });
    var loose = typed.filter(function (e) { return !e.shelf; }).length;
    if (L.shelf && L.shelf !== "?" && !shelves.some(function (x) { return x[0] === L.shelf; })) L.shelf = null;
    if (L.shelf === "?" && !loose) L.shelf = null;
    var onShelf = typed.filter(function (e) { return !L.shelf || (L.shelf === "?" ? !e.shelf : e.shelf === L.shelf); });
    var count = {};
    onShelf.forEach(function (e) { (e.tags || []).forEach(function (t) { count[t] = (count[t] || 0) + 1; }); });
    var tags = Object.keys(count).sort(function (a, b) { return count[b] - count[a] || a.localeCompare(b); }).slice(0, 18);
    if (L.tag && !count[L.tag]) L.tag = null;
    var flagged = function (e) { return e.confidence === "low" || e.needs_trim; };
    var nFlag = onShelf.filter(flagged).length;
    if (!nFlag) L.check = false;
    var shown = onShelf.filter(function (e) { return (!L.tag || (e.tags || []).indexOf(L.tag) >= 0) && (!L.check || flagged(e)); }).sort(byNew);
    function pick(k, v) { return function () { L[k] = L[k] === v ? null : v; if (k === "shelf") L.tag = null; redraw(); }; }
    function f(label, n, on, fn, cls) { return h("button", { type: "button", class: "f" + (cls || "") + (on ? " on" : ""), onclick: fn }, label, n != null ? h("i", null, n) : null); }
    var nRef = pool.filter(function (e) { return e.type === "reference"; }).length, nTool = pool.length - nRef;
    return [
      head("Library", pool.length ? nRef + " references and " + nTool + " tools on " + shelves.length + " shelves" : "Nothing saved yet. Send Claude a link and say what's good about it."),
      h("div", { class: "filters" },
        seg([["all", "Everything"], ["reference", "References"], ["tool", "Toolbox"]], L.type, function (t) { L.type = t; L.tag = null; redraw(); }),
        h("div", { class: "scroller" },
          f("All shelves", typed.length, !L.shelf, function () { L.shelf = null; L.tag = null; redraw(); }),
          shelves.map(function (x) { return f(x[0], x[1], L.shelf === x[0], pick("shelf", x[0])); }),
          loose ? f("Unshelved", loose, L.shelf === "?", pick("shelf", "?")) : null),
        tags.length || nFlag ? h("div", { class: "scroller" },
          nFlag ? f("Check me", nFlag, L.check, function () { L.check = !L.check; redraw(); }, " tag") : null,
          tags.map(function (t) { return f("#" + t, count[t], L.tag === t, pick("tag", t), " tag"); })) : null),
      !shown.length ? h("div", { class: "empty" }, "Nothing here yet.") : L.type === "tool" ? toolbox(shown) : masonry(shown.map(card))
    ];
  }
  function toolbox(tools) {
    var out = [], groups = {};
    tools.forEach(function (t) { (groups[t.shelf || "Unshelved"] = groups[t.shelf || "Unshelved"] || []).push(t); });
    DB.taxonomy.shelves.concat(["Unshelved"]).forEach(function (s) {
      if (!groups[s]) return;
      out.push(h("div", { class: "shelf-h" }, s));
      groups[s].forEach(function (t) {
        var c = t.clips && t.clips[0], p = posterOf(t), url = safe(t.tool_url);
        var media = h("div", { class: "media" + (c ? "" : " page"), style: { background: t.color || "" } }, p ? lazyImg(p) : null);
        var row = h("a", { class: "tool", href: "#/e/" + t.id }, media,
          h("div", null, h("b", null, t.tool_name || t.title), t.cost ? h("span", { class: "cost" }, t.cost) : null, h("p", null, t.use_when || t.juice || t.note || t.raw_note)),
          url ? h("span", { class: "btn small", role: "link", onclick: function (ev) { ev.preventDefault(); window.open(url, "_blank", "noopener"); } }, "Open", icon("out")) : null);
        if (c && !c.full) hoverPlay(row, media, c);
        out.push(row);
      });
    });
    return out;
  }

  // ------------------------------------------------------------ Projects
  // A project can set the order of its board ("order": entry ids, best first); anything not listed follows, newest first.
  function pinsOf(id) {
    var order = (P.get(id) || {}).order || [];
    var rank = function (e) { var k = order.indexOf(e.id); return k < 0 ? order.length : k; };
    return ALL.filter(function (e) { return (e.projects || []).indexOf(id) >= 0; }).sort(function (a, b) { return rank(a) - rank(b) || byNew(a, b); });
  }
  function forWhom(e) { return "For " + e.audience.charAt(0).toLowerCase() + e.audience.slice(1); }
  // A project note, in the row of its own that the project page gives notes. One with a write-up (sections) has a title.
  function noteCard(e) {
    return h("a", { class: "concept" + (e.pending ? " pending" : ""), href: "#/e/" + e.id }, h("div", { class: "cbody" },
      h("span", { class: "cno" }, "Note", e.private ? h("i", null, "Not on the shared board") : null), (e.sections || []).length ? h("h3", null, e.title) : null, h("p", null, e.juice || e.note || e.raw_note),
      e.pending ? h("div", { class: "chips" }, waitChip(e)) : null));
  }
  function earlyCard(i) {
    return h("a", { class: "concept" + (i.pending ? " pending" : ""), href: "#/e/" + i.id }, h("div", { class: "cbody" },
      h("span", { class: "cno" }, "Idea"), h("h3", null, i.title), h("p", null, i.pitch || i.note || i.raw_note)));
  }
  // A concept is an idea pinned to a project. The project page lists them, oldest first, above its board.
  // A concept's primary reference ("primary": an entry id on the idea) is shown large: as the cover of its card here,
  // and beside the write-up when the concept is opened.
  function primaryOf(i) { var o = i.primary ? E.get(i.primary) : null; return o && o.clips && o.clips.length ? o : null; }
  function conceptCard(i, k) {
    var prim = primaryOf(i), pc = prim && prim.clips[0];
    var refs = (i.links || []).map(function (id) { return E.get(id); }).filter(function (o) { return o && o !== prim && posterOf(o); });
    var cover = pc ? h("div", { class: "media ccover", style: { background: prim.color || "" } }, lazyImg(pc.poster), h("span", { class: "badge" }, "Primary reference")) : null;
    // a parked concept stays on the board, dimmed, until the pointer is on it
    var a = h("a", { class: "concept" + (i.pending ? " pending" : "") + (i.status === "parked" ? " parked" : ""), href: "#/e/" + i.id },
      cover,
      h("div", { class: "cbody" },
        h("span", { class: "cno" }, "Concept " + (k < 9 ? "0" : "") + (k + 1), i.audience ? h("i", null, forWhom(i)) : null),
        h("h3", null, i.title),
        h("p", null, i.pitch || i.note || i.raw_note),
        h("div", { class: "chips" }, i.pending ? waitChip(i) : null, h("span", { class: "chip status s-" + i.status }, i.status)),
        refs.length ? h("div", { class: "thumbs" }, refs.slice(0, 5).map(function (o) { return h("div", { class: "th", style: { background: o.color || "" } }, lazyImg(posterOf(o))); })) : null));
    if (pc && !pc.full) hoverPlay(a, cover, pc);
    return a;
  }
  // A project can carry its own look ("theme" in its file): the colours, fonts and shapes of the brand it is for.
  // It shows while that project's board is open, and always on a shared board. vars are CSS custom properties,
  // fonts a Google Fonts stylesheet, blocks the colours its brief cards cycle through.
  var themed = null;
  function applyTheme(p) {
    var next = p && p.theme ? p : null, root = document.documentElement, k;
    if ((themed && themed.id) === (next && next.id)) return;
    if (themed) { for (k in themed.theme.vars || {}) root.style.removeProperty(k); delete root.dataset.look; }
    themed = next;
    if (!next) return;
    for (k in next.theme.vars || {}) if (/^--[a-z0-9-]+$/.test(k)) root.style.setProperty(k, next.theme.vars[k]);
    root.dataset.look = next.theme.look || "paper";
    if (/^https:\/\/fonts\.googleapis\.com\//.test(next.theme.fonts || "") && !document.querySelector("link[data-look-fonts]")) document.head.append(h("link", { rel: "stylesheet", href: next.theme.fonts, "data-look-fonts": "1" }));
  }
  // a look may set the last word of the title in italics, the way its brand sets a headline
  function titleOf(p) {
    var w = p.title.split(" ");
    return p.theme && p.theme.emphasis === "last" && w.length > 1 ? [w.slice(0, -1).join(" ") + " ", h("em", null, w[w.length - 1])] : p.title;
  }
  function copyLink(p) {
    var link = location.origin + location.pathname + "#s/" + p.share.key;
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(function () { toast("Share link copied"); }, function () { window.prompt("Share link", link); });
    else window.prompt("Share link", link);
  }
  function viewProjects() {
    return [
      head("Projects", PROJECTS.length ? "Boards for the work that's already moving" : "No projects yet."),
      h("div", { class: "projects" },
        PROJECTS.map(function (p) {
          var pins = pinsOf(p.id), pics = pins.filter(posterOf).slice(0, 3);
          var n = function (t) { return pins.filter(function (e) { return e.type === t; }).length; };
          return h("a", { class: "pcard", href: "#/p/" + encodeURIComponent(p.id) },
            pics.length ? h("div", { class: "cover" }, [0, 1, 2].map(function (k) { var e = pics[k]; return h("div", { style: { background: e ? e.color || "" : "" } }, e ? lazyImg(posterOf(e)) : null); }))
              : h("div", { class: "cover none" }, "Nothing pinned yet"),
            h("div", { class: "meta" }, h("h3", null, p.title), p.about ? h("p", null, p.about) : null,
              h("div", { class: "chips" }, p.pending ? h("span", { class: "chip wait" }, "waiting for Claude") : null,
                [["idea", "concept"], ["reference", "ref"], ["tool", "tool"], ["note", "note"]].map(function (x) { return n(x[0]) ? h("span", { class: "chip" }, n(x[0]) + " " + x[1] + (n(x[0]) === 1 ? "" : "s")) : null; }))));
        }),
        h("a", { class: "pcard new", href: "#/newproject" }, h("span", null, icon("plus"), h("br"), "New project")))
    ];
  }
  function viewProject(id) {
    var p = P.get(id);
    if (!p) return [h("a", { class: "back", href: "#/projects" }, icon("back"), "Projects"), head("Not found")];
    var all = pinsOf(id), kind = S.proj[id] || "all";
    var byOld = function (a, b) { return (a.created || "").localeCompare(b.created || ""); };
    var concepts = all.filter(function (e) { return e.type === "idea" && !e.early; }).sort(byOld);
    // an idea he has called "not a concept yet" ("early": true) waits in its own row under the concepts
    var early = all.filter(function (e) { return e.type === "idea" && e.early; }).sort(byOld);
    var notes = all.filter(function (e) { return e.type === "note"; });
    // an entry with a "group" (such as "Competitors") sits in a section of that name under the board, not on the board itself
    var groups = [], inGroup = {};
    all.forEach(function (e) { if (e.group && e.type !== "idea" && e.type !== "note") { if (!inGroup[e.group]) { inGroup[e.group] = []; groups.push(e.group); } inGroup[e.group].push(e); } });
    var pins = all.filter(function (e) { return e.type !== "idea" && e.type !== "note" && !e.concept_only && !e.group; });
    var shown = kind === "all" ? pins : pins.filter(function (e) { return e.type === kind; });
    var label = pins.every(function (e) { return e.type === "reference"; }) ? "References" : "Pinned";
    var blocks = (p.theme && p.theme.blocks) || [], blk = 0;
    // second-tier references ("tier": 2 on the entry) sit in their own section under the main ones
    var first = shown.filter(function (e) { return e.tier !== 2; }), second = shown.filter(function (e) { return e.tier === 2; });
    var opts = [["all", "All " + pins.length]].concat([["reference", "References"], ["tool", "Tools"], ["note", "Notes"]].filter(function (o) { return pins.some(function (e) { return e.type === o[0]; }); }));
    return [
      SHARE ? null : h("a", { class: "back", href: "#/projects" }, icon("back"), "Projects"),
      head(titleOf(p), p.about, SHARE ? null : h("div", { class: "head-actions" },
        // a board that is shared by link: anyone with the link sees this board, view only, with no password
        p.share ? h("button", { type: "button", class: "btn", title: "Anyone with the link can view this board", onclick: function () { copyLink(p); } }, icon("out"), "Copy share link") : null,
        h("a", { class: "btn primary", href: "#/add/" + encodeURIComponent(id) }, icon("plus"), "Add to this"))),
      // the project's brief, in his words: titled lists kept in the project's own file ("brief": [{ title, points }])
      // a block marked "plain" is a longer list: quiet cards, not the look's blocks of colour
      (p.brief || []).map(function (b) { return h("div", { class: "brief" + (b.plain ? " plain" : "") }, h("div", { class: "lbl" }, b.title),
        h("ol", b.plain ? { "data-cols": Math.ceil(b.points.length / Math.ceil(b.points.length / 4)) } : null, (b.points || []).map(function (t) { return h("li", blocks.length && !b.plain ? { style: { background: blocks[blk++ % blocks.length] } } : null, t); }))); }),
      concepts.length ? h("div", { class: "brief" }, h("div", { class: "lbl" }, "Concepts"), h("div", { class: "concepts" }, concepts.map(conceptCard))) : null,
      early.length ? h("div", { class: "brief" }, h("div", { class: "lbl" }, "Ideas, not concepts yet"), h("div", { class: "concepts" }, early.map(earlyCard))) : null,
      notes.length ? h("div", { class: "brief" }, h("div", { class: "lbl" }, "Notes"), h("div", { class: "concepts" }, notes.map(noteCard))) : null,
      pins.length && ((p.brief || []).length || concepts.length || notes.length) ? h("div", { class: "lbl", style: { marginTop: "4px" } }, label) : null,
      opts.length > 2 ? h("div", { class: "filters" }, seg(opts, kind, function (k) { S.proj[id] = k; redraw(); })) : null,
      shown.length ? [first.length ? masonry(first.map(card)) : null,
        second.length ? [sec("Second tier", "supporting references"), masonry(second.map(card))] : null]
        : concepts.length || early.length || notes.length || groups.length ? null : h("div", { class: "empty" }, SHARE ? "Nothing here yet." : "Nothing pinned yet. Send Claude a link and say it's for " + p.title + "."),
      groups.map(function (g) { return [sec(g, String(inGroup[g].length)), masonry(inGroup[g].map(card))]; })
    ];
  }

  // ------------------------------------------------------------ Search
  function viewSearch() {
    var q = S.q.trim();
    if (!q) {
      var count = {};
      ALL.forEach(function (e) { (e.tags || []).forEach(function (t) { count[t] = (count[t] || 0) + 1; }); });
      var tags = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; }).slice(0, 30);
      return [head("Search", "Your notes, tags, tools, captions and write-ups, all at once."),
        h("div", { class: "chips" }, tags.map(function (t) { return h("button", { type: "button", class: "f tag", onclick: function () { searchInput.value = t; onSearch(); } }, "#" + t, h("i", null, count[t])); }))];
    }
    var hits = ALL.filter(function (e) { return match(e, q); });
    var ideas = hits.filter(function (e) { return e.type === "idea"; }).sort(byPri), rest = hits.filter(function (e) { return e.type !== "idea"; }).sort(byNew);
    var projs = PROJECTS.filter(function (p) { return (p.title + " " + (p.about || "") + " " + (p.brief || []).map(function (b) { return b.title + " " + (b.points || []).join(" "); }).join(" ")).toLowerCase().indexOf(q.toLowerCase()) >= 0; });
    return [
      head(hits.length + projs.length ? hits.length + projs.length + " found" : "Nothing found", "for “" + q + "”"),
      projs.length ? h("div", { class: "chips" }, projs.map(function (p) { return h("a", { class: "chip proj", href: "#/p/" + encodeURIComponent(p.id) }, p.title); })) : null,
      ideas.length ? [sec("Ideas"), h("div", { class: "ideas" }, ideas.map(ideaCard))] : null,
      rest.length ? [sec("References, tools and notes"), masonry(rest.map(card))] : null
    ];
  }

  // ------------------------------------------------------------ entry sheet
  function player(e, quiet) {
    var video = h("video", { controls: true, loop: true, playsinline: true });
    video.muted = true;
    var stage = h("div", { class: "stage" }, video), bar = h("i"), lab = h("span"), sel = h("div", { class: "clipsel" });
    function load(k) {
      var c = e.clips[k], total = Math.max(e.source_duration || 0, c.out);
      stage.style.aspectRatio = c.w + " / " + c.h;
      stage.style.maxWidth = "calc(" + (c.w / c.h).toFixed(4) + " * min(72vh, 660px))";
      mediaURL(c.poster, "image/webp").then(function (u) { video.poster = u; }, function () {});
      video.loop = !c.full; video.muted = !c.full;
      mediaURL(c.file, "video/mp4").then(function (u) {
        video.src = u;
        var p = video.play();
        // a browser may refuse to start with sound; then start silent and leave the sound button to the viewer
        if (p) p.catch(function () { video.muted = true; var q = video.play(); if (q) q.catch(function () {}); });
      }, function () {});
      bar.style.left = (100 * c.in) / total + "%";
      bar.style.width = Math.max(1.5, (100 * (c.out - c.in)) / total) + "%";
      lab.textContent = c.full ? "Whole video, " + fmt(total) + ", with sound" : fmt(c.in) + " to " + fmt(c.out) + " of " + fmt(total);
      sel.querySelectorAll("button").forEach(function (b, n) { b.classList.toggle("on", n === k); });
    }
    if (e.clips.length > 1) e.clips.forEach(function (c, k) { sel.append(h("button", { type: "button", onclick: function () { load(k); } }, c.full ? "Full video" : c.gif ? "Preview" : "Clip " + (k + 1))); });
    // when the whole video is there, that is what the entry opens on; the card keeps the first clip as its preview
    var first = e.clips.findIndex(function (c) { return c.full; });
    load(quiet || first < 0 ? 0 : first);
    return h("div", { class: "show" }, stage, h("div", { class: "rangebar" }, h("div", { class: "track" }, bar), h("div", { class: "lab" }, lab, e.clips.length > 1 ? sel : null)));
  }
  function primaryShow(o) {
    var s = player(o, true);
    s.append(h("a", { class: "primlink", href: "#/e/" + o.id }, h("span", null, "Primary reference"), o.title, icon("out")));
    return s;
  }
  function pageShot(e) {
    var img = h("img", { alt: "" });
    mediaURL(e.image.file, "image/webp").then(function (u) { img.src = u; }, function () {});
    return h("div", { class: "show" }, h("div", { class: "stage page", style: { maxHeight: "min(78vh, 760px)", background: e.color || "" } }, img));
  }
  function mini(list) {
    return h("div", { class: "mini" }, list.map(function (o) {
      var p = posterOf(o);
      return h("a", { href: "#/e/" + o.id }, p ? h("div", { class: "th", style: { background: o.color || "" } }, lazyImg(p)) : h("div", { class: "th txt" }, LABEL[o.type]), h("span", null, o.tool_name || o.title));
    }));
  }
  function dots(e, key, hint) {
    return h("div", { class: "dots" }, [1, 2, 3, 4, 5].map(function (n) {
      var c = {}; c[key] = n;
      return h("button", { type: "button", class: (e[key] || 0) >= n ? "on" : "", disabled: !!e.pending, "aria-label": key + " " + n, onclick: function () { edit(e.id, c); } }, n);
    }), h("span", { class: "hint" }, hint));
  }
  // A longer write-up, as titled parts: { title, text } for a paragraph, { title, points } for a numbered list, { title, links } for sources.
  function sections(e) {
    return (e.sections || []).map(function (s) {
      return [h("div", { class: "lbl" }, s.title), s.text ? h("p", { class: "body" }, s.text) : null,
        (s.points || []).length ? h("ol", { class: "steps" }, s.points.map(function (t) { return h("li", null, t); })) : null,
        (s.links || []).length ? h("div", { class: "linklist" }, s.links.map(function (l) {
          var u = safe(l.url);
          return u ? h("a", { href: u, target: "_blank", rel: "noopener" }, h("span", null, l.label || l.url), h("small", null, u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0])) : null;
        })) : null];
    });
  }
  function entrySheet(id) {
    var e = E.get(id);
    if (!e) { var gone = h("div", { class: "form" }, h("h2", null, "Not here any more"), h("p", { class: "help" }, "This entry was filed, renamed or removed.")); gone.dataset.narrow = "1"; return gone; }
    var isIdea = e.type === "idea", prim = isIdea ? primaryOf(e) : null;
    var hasMedia = !!((e.clips && e.clips.length) || e.image || prim);
    var linked = (e.links || []).map(function (x) { return E.get(x); }).filter(Boolean);
    var ideas = linked.filter(function (o) { return o.type === "idea"; }), others = linked.filter(function (o) { return o.type !== "idea" && o !== prim; });
    var main = others.filter(function (o) { return o.tier !== 2; }), second = others.filter(function (o) { return o.tier === 2; });
    var src = safe(e.source_url), tool = safe(e.tool_url);
    var d = h("div", { class: "detail" + (hasMedia ? "" : " solo") },
      h("div", { class: "kicker" }, h("span", { class: "k-" + e.type }, e.type === "idea" && (e.projects || []).length && !e.early ? "Concept" : e.group || LABEL[e.type]), e.audience ? h("span", null, forWhom(e)) : null, e.private ? h("span", null, "Not on the shared board") : null, e.tool_name && e.tool_name !== e.title ? h("span", null, e.tool_name) : null, e.shelf ? h("span", null, e.shelf) : null, e.author ? h("span", null, "@" + String(e.author).replace(/^@/, "")) : null, e.tier === 2 ? h("span", null, "Second tier") : null, e.sample ? h("span", null, "Sample") : null),
      e.type === "note" && !(e.sections || []).length ? null : h("h2", null, e.title),
      h("div", { class: "flags" },
        e.pending ? h("div", { class: "flag wait" }, icon("clock"), e.sent ? "Sent to GitHub. Claude files it properly the next time you ask." : "Saved on this device only. Send it to GitHub from the pill at the top.") : null,
        e.edited ? h("div", { class: "flag wait" }, icon("clock"), "You changed this here. The change is kept on this device until Claude files it.") : null,
        e.confidence === "low" ? h("div", { class: "flag" }, icon("flag"), "Check me: Claude wasn't sure about this write-up.") : null,
        e.needs_trim ? h("div", { class: "flag" }, icon("flag"), "Needs trim: no timestamp came with it, so this is the first 8 seconds.") : null));

    if (isIdea) {
      var refs = (e.links || []).filter(function (x) { var o = E.get(x); return o && o.type !== "idea" && o.type !== "note"; }).length;
      put(d,
        e.pitch ? h("p", { class: "juice" }, e.pitch) : null,
        sections(e),
        SHARE || e.pending ? null : h("div", { class: "scoreline" }, h("b", null, e.priority),
          h("span", null, (e.excitement || 3) + " × (6 − " + (e.effort || 3) + ") + 2 × " + (e.outlets || []).length + " outlets + " + Math.min(refs, 3) + " refs" + ((e.seen_in_wild || []).length ? " + 3 clock" : ""))),
        SHARE ? null : h("div", { class: "two" },
          h("div", null, h("div", { class: "lbl" }, "Excitement"), dots(e, "excitement", "how much you want it")),
          h("div", null, h("div", { class: "lbl" }, "Effort"), dots(e, "effort", "1 is an afternoon"))),
        !SHARE && folders().length ? [h("div", { class: "lbl" }, "Folder"),
          h("div", { class: "toggles" }, folders().map(function (f) { return h("button", { type: "button", class: e.folder === f ? "on" : "", disabled: !!e.pending, onclick: function () { edit(e.id, { folder: e.folder === f ? "" : f }); } }, f); }))] : null,
        SHARE ? null : h("div", { class: "lbl" }, "Status"),
        SHARE ? null : h("div", { class: "toggles" }, STATUSES.map(function (s) { return h("button", { type: "button", class: e.status === s ? "on" : "", disabled: !!e.pending, onclick: function () { edit(e.id, { status: s }); } }, s); })),
        SHARE ? null : h("div", { class: "lbl" }, "Where it could live"),
        SHARE ? null : h("div", { class: "toggles" }, (DB.settings.outlets || []).concat((e.outlets || []).filter(function (o) { return (DB.settings.outlets || []).indexOf(o) < 0; })).map(function (o) {
          var has = (e.outlets || []).indexOf(o) >= 0;
          return h("button", { type: "button", class: has ? "on" : "", disabled: !!e.pending, onclick: function () { edit(e.id, { outlets: has ? e.outlets.filter(function (x) { return x !== o; }) : (e.outlets || []).concat([o]) }); } }, o);
        })));
    } else if (e.type !== "note" || (e.sections || []).length) {
      put(d,
        e.juice ? h("p", { class: "juice" }, e.juice) : null,
        e.use_when ? [h("div", { class: "lbl" }, "Reach for this when"), h("p", { class: "body" }, e.use_when)] : null,
        e.cost ? [h("div", { class: "lbl" }, "Cost"), h("p", { class: "body" }, e.cost)] : null,
        e.how ? [h("div", { class: "lbl" }, "How it's done"), h("p", { class: "body" }, e.how)] : null,
        sections(e));
    }
    put(d,
      // `note` is a one-line summary of anything useful he said. His raw words are instructions to Claude, so they show
      // only when they are all the entry has: typed on the site and not filed yet, or saved as text because a download failed.
      e.note ? [h("div", { class: "lbl" }, "Note"), h("blockquote", { class: "mine" }, e.note)]
        : e.raw_note ? [h("div", { class: "lbl" }, "My note"), h("blockquote", { class: "mine" }, e.raw_note)] : null,
      e.clip_hint ? [h("div", { class: "lbl" }, "Seconds"), h("p", { class: "body" }, e.clip_hint)] : null,
      (e.seen_in_wild || []).length ? [h("div", { class: "lbl" }, "Seen in the wild"), h("div", { class: "linklist" }, e.seen_in_wild.map(function (s) {
        var u = safe(s.url);
        return h(u ? "a" : "div", u ? { href: u, target: "_blank", rel: "noopener" } : { class: "op" }, h("span", null, s.note || s.url), h("small", null, s.date ? day(s.date) : ""));
      }))] : null,
      (e.projects || []).length || (e.tags || []).length ? [h("div", { class: "lbl" }, "Filed under"), h("div", { class: "chips" }, projChips(e, true),
        (e.tags || []).map(function (t) { return SHARE ? h("span", { class: "chip tag" }, t) : h("a", { class: "chip tag", href: "#/library", onclick: function () { S.lib = { type: "all", shelf: null, tag: t, check: false }; S.dirty = true; } }, t); }))] : null,
      isIdea && main.length ? [h("div", { class: "lbl" }, "References for this"), mini(main)] : null,
      isIdea && second.length ? [h("div", { class: "lbl" }, "Secondary references"), mini(second)] : null,
      !isIdea && ideas.length ? [h("div", { class: "lbl" }, "Feeds these ideas"), h("div", { class: "linklist" }, ideas.map(function (o) { return h("a", { href: "#/e/" + o.id }, icon("bolt"), o.title, SHARE ? null : h("small", null, "score " + o.priority)); }))] : null,
      !isIdea && others.length ? [h("div", { class: "lbl" }, "Related"), mini(others)] : null,
      isIdea && ideas.length ? [h("div", { class: "lbl" }, "Related ideas"), h("div", { class: "linklist" }, ideas.map(function (o) { return h("a", { href: "#/e/" + o.id }, icon("bolt"), o.title); }))] : null,
      h("div", { class: "actions" },
        tool ? h("a", { class: "btn primary", href: tool, target: "_blank", rel: "noopener" }, e.tool_name ? "Open " + e.tool_name : "Open tool", icon("out")) : null,
        src && src.replace(/\/$/, "") !== (tool || "").replace(/\/$/, "") ? h("a", { class: "btn", href: src, target: "_blank", rel: "noopener" }, PLATFORM[e.platform] ? "Open on " + PLATFORM[e.platform] : "Open source", icon("out")) : null,
        e.pending ? h("button", { type: "button", class: "btn ghost", onclick: function () { savePending(loadPending().filter(function (o) { return o.cid !== e.cid; })); rebuild(); S.dirty = true; updateSync(); closeRoute(); } }, "Remove")
          : SHARE ? null : h("a", { class: "btn ghost", href: "#/edit/" + e.id }, icon("edit"), "Edit")),
      h("div", { class: "lbl" }, "Added " + day(e.created)));
    return h("div", { class: "entry" + (hasMedia ? " has-media" : "") }, e.clips && e.clips.length ? player(e) : e.image ? pageShot(e) : prim ? primaryShow(prim) : null, d);
  }

  // ------------------------------------------------------------ forms
  function field(label, control, hint) { return h("label", null, label, hint ? h("span", null, hint) : null, control); }
  function editSheet(id) {
    var e = E.get(id);
    if (!e || e.pending) return entrySheet(id);
    var isIdea = e.type === "idea", isTool = e.type === "tool", isNote = e.type === "note";
    var f = {
      title: h("input", { type: "text", value: e.title || "" }),
      pitch: h("textarea", null, e.pitch || ""),
      juice: h("textarea", null, e.juice || ""),
      how: h("textarea", null, e.how || ""),
      tool_name: h("input", { type: "text", value: e.tool_name || "" }),
      tool_url: h("input", { type: "url", value: e.tool_url || "" }),
      use_when: h("input", { type: "text", value: e.use_when || "" }),
      cost: h("input", { type: "text", value: e.cost || "" }),
      shelf: h("select", null, h("option", { value: "" }, "No shelf"), DB.taxonomy.shelves.map(function (s) { return h("option", { value: s, selected: e.shelf === s }, s); })),
      tags: h("input", { type: "text", value: (e.tags || []).join(", "), autocapitalize: "off" })
    };
    var picked = new Set(e.projects || []);
    var projs = h("div", { class: "toggles" }, PROJECTS.filter(function (p) { return !p.pending; }).map(function (p) {
      return h("button", { type: "button", class: picked.has(p.id) ? "on" : "", onclick: function () { if (picked.has(p.id)) picked.delete(p.id); else picked.add(p.id); this.classList.toggle("on"); } }, p.title);
    }));
    var form = h("form", { class: "form", onsubmit: function (ev) {
      ev.preventDefault();
      var ch = {}, v;
      ["title", "pitch", "juice", "how", "tool_name", "tool_url", "use_when", "cost", "shelf"].forEach(function (k) { if (!f[k].isConnected) return; v = f[k].value.trim(); if (v !== (e[k] || "")) ch[k] = v; });
      v = f.tags.value.split(",").map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
      if (f.tags.isConnected && v.join("|") !== (e.tags || []).join("|")) ch.tags = v;
      v = Array.from(picked);
      if (v.slice().sort().join("|") !== (e.projects || []).slice().sort().join("|")) ch.projects = v;
      if (Object.keys(ch).length) { edit(e.id, ch); toast("Changed here. Send it from the pill at the top."); }
      location.hash = "#/e/" + e.id;
    } },
      h("h2", null, "Edit"),
      isNote ? null : field("Title", f.title),
      isIdea ? field("Pitch", f.pitch, "the idea in plain words") : null,
      isTool ? h("div", { class: "cols" }, field("Tool name", f.tool_name), field("Cost", f.cost)) : null,
      isTool ? field("Tool link", f.tool_url) : null,
      isTool ? field("Reach for this when", f.use_when) : null,
      isIdea || isNote ? null : field("What's good about it", f.juice),
      isIdea || isNote ? null : field("How it's done", f.how),
      isNote ? null : h("div", { class: "cols" }, field("Shelf", f.shelf), field("Tags", f.tags, "comma separated")),
      PROJECTS.length ? h("div", null, h("div", { class: "lbl" }, "Projects"), projs) : null,
      h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, "Save"), h("a", { class: "btn ghost", href: "#/e/" + e.id }, "Cancel")));
    form.dataset.narrow = "1";
    return form;
  }
  function addSheet(arg) {
    var folderPre = /^f:/.test(arg || "") ? arg.slice(2) : "", projectId = folderPre ? "" : arg;
    var st = { type: projectId ? "reference" : "idea" };
    var folder = h("select", null, h("option", { value: "" }, "Let Claude choose"), folders().map(function (f) { return h("option", { value: f, selected: f === folderPre }, f); }));
    var lFolder = field("Folder", folder);
    var url = h("input", { type: "url", inputmode: "url", placeholder: "https://", autocapitalize: "off", autocomplete: "off" });
    var note = h("textarea", { required: true });
    var clip = h("input", { type: "text", placeholder: "11  or  3-7", autocomplete: "off" });
    var proj = h("select", null, h("option", { value: "" }, "No project"), PROJECTS.map(function (p) { return h("option", { value: p.id, selected: p.id === projectId }, p.title); }));
    var shelf = h("select", null, h("option", { value: "" }, "Let Claude choose"), DB.taxonomy.shelves.map(function (s) { return h("option", { value: s }, s); }));
    var lUrl = field("Link", url), lClip = field("Seconds that matter", clip), lShelf = field("Shelf", shelf), lProj = field("Project", proj);
    var hints = { idea: "The idea, as roughly as you like. Dictation works here.", reference: "What's good about it, in your own words.", tool: "What it's for, and when you'd reach for it.", note: "A thought for the project." };
    function sync() {
      lUrl.hidden = st.type === "note"; lClip.hidden = st.type === "idea" || st.type === "note"; lShelf.hidden = st.type === "note";
      lFolder.hidden = st.type !== "idea" || !folders().length;
      note.placeholder = hints[st.type];
    }
    var token = get(TOKEN);
    var form = h("form", { class: "form", onsubmit: function (ev) {
      ev.preventDefault();
      var text = note.value.trim();
      if (!text) { note.focus(); return; }
      if (st.type === "note" && !proj.value) { toast("Pick the project this note is for"); proj.focus(); return; }
      var p = { type: st.type, note: text };
      if (!lUrl.hidden && url.value.trim()) p.url = url.value.trim();
      if (!lClip.hidden && clip.value.trim()) p.clip = clip.value.trim();
      if (!lShelf.hidden && shelf.value) p.shelf = shelf.value;
      if (proj.value) p.project = proj.value;
      if (!lFolder.hidden && folder.value) p.folder = folder.value;
      pushOp({ cid: cid(), kind: "add", at: new Date().toISOString(), payload: p });
      rebuild(); S.dirty = true;
      sendPending();
      updateSync();
      toast(token ? "Saving…" : "Kept here. Press Create on the GitHub page to file it.");
      location.hash = proj.value ? "#/p/" + encodeURIComponent(proj.value) : st.type === "idea" ? (p.folder ? "#/f/" + encodeURIComponent(p.folder) : "#/ideas") : "#/library";
    } },
      h("h2", null, "Add"),
      seg([["idea", "Idea"], ["reference", "Reference"], ["tool", "Tool"], ["note", "Project note"]], st.type, function (t) { st.type = t; sync(); }),
      lUrl, field("Note", note), lFolder, h("div", { class: "cols" }, lClip, lProj), lShelf,
      h("p", { class: "help" }, token ? "Saves straight to your GitHub inbox. Claude files it the next time you ask."
        : "Saving keeps it on this device and opens GitHub with it filled in. Press Create there and it can't be lost. Claude files it the next time you ask."),
      h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, "Save")));
    sync();
    form.dataset.narrow = "1";
    setTimeout(function () { if (window.innerWidth >= 860) note.focus(); }, 80);
    return form;
  }
  function projectSheet() {
    var title = h("input", { type: "text", required: true, placeholder: "Project name" }), about = h("input", { type: "text", placeholder: "One line on what it is" });
    var form = h("form", { class: "form", onsubmit: function (ev) {
      ev.preventDefault();
      if (!title.value.trim()) return;
      pushOp({ cid: cid(), kind: "project", at: new Date().toISOString(), payload: { title: title.value.trim(), about: about.value.trim() } });
      rebuild(); S.dirty = true; sendPending(); updateSync();
      location.hash = "#/projects";
    } }, h("h2", null, "New project"), field("Name", title), field("About", about), h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, "Create")));
    form.dataset.narrow = "1";
    return form;
  }
  function inboxSheet() {
    var ops = loadPending(), unsent = ops.filter(function (o) { return !o.sent; });
    var box = h("div", { class: "form" },
      h("h2", null, "Typed here"),
      h("p", { class: "help" }, ops.length ? "Everything you add or change on the site waits here until Claude files it. Sent items are safe on GitHub; unsent ones live only in this browser." : "Nothing waiting. Everything typed here has been filed."),
      h("div", { class: "oplist" }, ops.map(function (o) {
        return h("div", { class: "op" }, h("div", null, h("b", null, opTitle(o)), h("small", null, o.sent ? "Sent " + day(o.sentAt) + ", waiting for Claude" : "Not sent yet")),
          o.sent ? h("button", { type: "button", onclick: function () { savePending(loadPending().map(function (x) { if (x.cid === o.cid) x.sent = null; return x; })); sendPending(); route(); } }, "Send again") : null,
          h("button", { type: "button", "aria-label": "Remove", onclick: function () { savePending(loadPending().filter(function (x) { return x.cid !== o.cid; })); rebuild(); S.dirty = true; updateSync(); route(); } }, icon("x")));
      })),
      unsent.length ? h("div", { class: "actions" }, h("button", { type: "button", class: "btn primary", onclick: function () { sendPending(); route(); } }, "Send " + unsent.length + " to GitHub")) : null);
    box.dataset.narrow = "1";
    return box;
  }
  function settingsSheet() {
    var n = function (t) { return DB.entries.filter(function (e) { return e.type === t; }).length; };
    var tok = h("input", { type: "password", placeholder: "github_pat_…", autocomplete: "off", value: get(TOKEN) || "" });
    var box = h("div", { class: "form" },
      h("h2", null, "Vault"),
      h("p", { class: "help" }, n("idea") + " ideas, " + n("reference") + " references, " + n("tool") + " tools, " + n("note") + " notes, " + DB.projects.length + " projects. Last updated " + day(DB.built) + "."),
      h("p", { class: "help" }, "On a keyboard: / searches, n adds, 1 to 9 pick a shelf in the Library, Esc closes."),
      field("GitHub token for this device", tok, "optional: with one, Add saves straight to GitHub without opening it"),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "btn", onclick: function () { set(TOKEN, tok.value.trim() || null); toast(tok.value.trim() ? "Token kept on this device" : "Token removed"); } }, "Save token"),
        h("button", { type: "button", class: "btn ghost", onclick: function () { set(STORE, null); location.href = location.pathname; } }, "Lock this device")));
    box.dataset.narrow = "1";
    return box;
  }
})();
