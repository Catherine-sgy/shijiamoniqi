/* ============================================================
 * 百年宗谱 · 界面层（页签式：家宅 / 田庄 / 商事 / 仕学）
 * ============================================================ */
(function () {
  "use strict";
  const Game = window.Game;
  const { clamp } = Game.U;
  const $ = (id) => document.getElementById(id);
  const TAB_KEY = "shijia-tab-v1";
  const CF_KEY = "shijia-contacts-filter-v1";
  const CS_KEY = "shijia-contacts-sort-v1";
  let contactsFilter = "all";   /* all | marriageable | royal */
  let contactsSort = "favor";    /* favor | family | apt */
  try {
    contactsFilter = localStorage.getItem(CF_KEY) || "all";
    contactsSort = localStorage.getItem(CS_KEY) || "favor";
  } catch (e) {}

  /* 报错喇叭：页面JS报错就浮条+记编年，免得静默崩面板还找不到 */
  Game._errSeen = {};
  window.addEventListener("error", (e) => {
    try {
      const msg = String((e && e.message) || e);
      const now = Date.now();
      if (Game._errSeen.msg === msg && now - Game._errSeen.t < 5000) return;
      Game._errSeen = { msg, t: now };
      if (Game.toast) Game.toast("页面报错：" + (msg.length > 80 ? msg.slice(0, 80) + "…" : msg));
      Game.log("【报错】" + msg, "bad");
    } catch (_) {}
  });
  const TITLE_NAME = {
    xiucai: "秀才", juren: "举人", gongshi: "贡士", jinshi: "进士",
    wuxiucai: "武秀才", wujuren: "武举人", wujinshi: "武进士"
  };
  const titleName = (k) => TITLE_NAME[k] || "";

  /* 灰按钮点得动：条件未足时不禁用，只置暗并给出原因（data-why），点之即浮提示，避免“按钮失灵” */
  Game.dis = function (cond, reason) {
    return cond ? ` data-why="${String(reason || "条件未足").replace(/"/g, "”")}"` : "";
  };
  Game.toast = function (msg) {
    try {
      let el = document.getElementById("toast");
      if (!el) {
        el = document.createElement("div");
        el.id = "toast";
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.classList.add("show");
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove("show"), 2300);
    } catch (e) {}
  };

  /* ---------------- 日志 ---------------- */
  /* 结算期（度月/度年内部）的坏消息只记编年不打扰；玩家亲手点的，当场浮条说明 */
  Game.log = function (text, cls) {
    const g = Game.G;
    if (g) { g.logs.push({ t: text, c: cls || "" }); if (g.logs.length > 240) g.logs.shift(); }
    if (cls === "bad" && !Game._inSettle && Game.toast) Game.toast(text);
    const el = $("logArea");
    if (!el) return;
    const p = document.createElement("p");
    p.className = cls || "";
    p.textContent = text;
    el.appendChild(p);
    el.scrollTop = el.scrollHeight;
  };

  function renderLogs() {
    const el = $("logArea");
    el.innerHTML = "";
    (Game.G.logs || []).forEach(({ t, c }) => {
      const p = document.createElement("p");
      p.className = c || "";
      p.textContent = t;
      el.appendChild(p);
    });
    el.scrollTop = el.scrollHeight;
  }

  /* 官职全称 */
  function officeText(off) {
    if (!off) return "";
    const posts = off.track === "civil" ? Game.CIVIL_POSTS : Game.MILITARY_POSTS;
    return `${Game.GRADES[off.grade]}${posts[off.grade]}`;
  }
  /* 族人身份：官身 > 功名 > 营生 > 在学 / 幼 */
  function personStatus(p) {
    if (p.palace) return { text: "宫中·" + Game.palaceName(p), cls: "office" };
    if (p.office) return { text: officeText(p.office), cls: "office" };
    if (p.title) return { text: titleName(p.title), cls: "title" };
    if (p.out === "married") return { text: "已出阁", cls: "mute" };
    if (p.age < 3) return { text: "襁褓", cls: "mute" };
    if (p.age < 16) return { text: "在学蒙童", cls: "mute" };
    const j = Game.jobInfo(p.job);
    return { text: j ? j.name : "闲居", cls: "job" };
  }

  /* 四维先天资质（学习倍率）行 */
  function aptRows(p) {
    if (!p.apt) return "";
    return ["体力", "智力", "武力", "魅力"].map(k => {
      const v = p.apt[k];
      const tier = v >= 82 ? "hi" : v >= 68 ? "mid" : v <= 32 ? "lo" : "";
      return `<span class="apt-item ${tier}">${k}<b>${v}</b><em>×${(v / 100).toFixed(2)}</em></span>`;
    }).join("");
  }

  /* 词条 chip：稀有金色、负面灰红、寻常墨色 */
  function traitChip(key, gender) {
    const d = Game.traitDef(key);
    if (!d) return "";
    const cls = d.bad ? "tr-bad" : d.rarity >= 3 ? "tr-rare" : d.rarity === 2 ? "tr-fine" : "tr-common";
    const star = d.rarity >= 3 ? " ◆" : d.rarity === 2 ? " ◇" : "";
    return `<span class="trait-chip ${cls}" title="${d.desc}">${Game.traitName(key, gender)}${star}</span>`;
  }
  function traitChips(p) {
    if (!p.traits || !p.traits.length) return '<span class="muted">禀赋平常</span>';
    return p.traits.map(k => traitChip(k, p.gender)).join("");
  }
  /* 名册卡片上只点出最拿得出手 / 最拖累的一两条禀赋 */
  function memberTraitTag(p) {
    if (!p.traits || !p.traits.length) return "";
    const ranked = p.traits
      .map(Game.traitDef).filter(Boolean)
      .sort((a, b) => b.rarity - a.rarity || Math.abs(b.power) - Math.abs(a.power));
    const d = ranked[0];
    if (!d || d.rarity < 2) return "";
    const cls = d.bad ? "tr-bad" : "tr-rare";
    return `<span class="mc-trait ${cls}">${Game.traitName(d.key, p.gender)}</span>`;
  }

  /* ---------------- 主渲染 ---------------- */
  /* 分面板隔离：哪个面板渲染崩了只跳过它，不连累后面的面板空白 */
  Game.safePanel = function (name, fn) {
    try { fn(); }
    catch (e) {
      Game.log(`【${name}显示失败，已跳过（${e && e.message ? e.message : e}）】`, "bad");
    }
  };
  Game.refresh = function () {
    const g = Game.G;
    if (!g) return;
    const c = g.char;

    $("familyName").textContent = g.surname;
    $("genInfo").textContent = `第${g.gen}代`;
    $("charInfo").textContent =
      `${c.name} · ${c.gender} · ${c.age}岁${c.title ? " · " + titleName(c.title) : ""}`;
    $("dateInfo").textContent = `第${g.year}年 ${g.month}月`;
    const vt = $("verTag"); if (vt) vt.textContent = Game.VERSION || "";
    $("rankTag").textContent = Game.rankName();

    /* 常驻家产条 */
    $("moneyInfo").textContent = Math.round(g.money);
    $("landInfo").textContent = g.land;
    const totalPnl = g.shops.reduce((s, x) => s + (x.lastProfit || 0), 0);
    $("bizInfo").innerHTML = g.shops.length
      ? `${g.shops.length}间<em>上月${totalPnl >= 0 ? "盈" : "亏"}${Math.abs(totalPnl)}两</em>`
      : `无<em>—</em>`;
    $("repInfo").textContent = g.family.reputation;
    $("repFill").style.width = Math.min(100, g.family.reputation / 6) + "%";
    const residents = Game.householdMembers().length;
    const cap = Game.houseCapacity();
    $("houseInfo").innerHTML = `${g.house.rooms}间<em>${residents}/${cap}人${residents > cap ? " · 逼仄" : ""}</em>`;
    $("tierInfo").innerHTML = `${Game.livingTier().name}<em id="livingNum"></em>`;

    Game.safePanel("renderStats", () => { renderStats(); });
    Game.safePanel("renderActions", () => { renderActions(); });
    Game.safePanel("renderCareer", () => { renderCareer(); });
    Game.safePanel("renderExams", () => { renderExams(); });
    Game.safePanel("renderHouse", () => { renderHouse(); });
    Game.safePanel("renderMembers", () => { renderMembers(); });
    if (typeof renderGenPoem === "function") Game.safePanel("renderGenPoem", () => { renderGenPoem(); });
    Game.safePanel("renderSteward", () => { renderSteward(); });
    Game.safePanel("renderLandUse", () => { renderLandUse(); });
    Game.safePanel("renderGranaryMarket", () => { renderGranaryMarket(); });
    Game.safePanel("renderHouseholdReport", () => { renderHouseholdReport(); });
    Game.safePanel("renderShops", () => { renderShops(); });
    if (typeof renderBank === "function") Game.safePanel("renderBank", () => { renderBank(); });
    Game.safePanel("renderAcademy", () => { renderAcademy(); });
    Game.safePanel("renderMarriage", () => { renderMarriage(); });
    if (typeof renderKin === "function") Game.safePanel("renderKin", () => { renderKin(); });
    if (document.activeElement !== $("autoLandInput")) $("autoLandInput").value = g.autoLand || "";
    $("nextBtn").disabled = !c.alive || g.locked;
    if ($("nextYearBtn")) $("nextYearBtn").disabled = !c.alive || g.locked;
  };

  /* ---------------- 己身属性 ---------------- */
  function renderStats() {
    const c = Game.G.char, max = Game.maxSta();
    $("statsArea").innerHTML = ["体力", "智力", "武力", "魅力"].map(k => {
      const v = c.stats[k];
      const low = (k === "体力" && v < 30);
      const shown = k === "体力" ? `${v}<span class="muted">/${max}</span>` : v;
      const mul = c.apt ? `<span class="stat-mul" title="先天资质${c.apt[k]}，该项进境倍率">×${(c.apt[k] / 100).toFixed(2)}</span>` : "";
      return `<div class="stat-row">
        <span class="stat-name">${k}</span>
        <div class="bar"><div class="bar-fill ${low ? "low" : ""}" style="width:${(k === "体力" ? v / max : v / 100) * 100}%"></div></div>
        <span class="stat-val">${shown}${mul}</span>
      </div>`;
    }).join("");

    const status = [];
    if (c.isSick) status.push('<span class="bad">抱病在身</span>');
    if (c.office) status.push(`现任 ${officeText(c.office)}（月俸${Game.SALARY(c.office.grade)}两）`);
    else {
      if (c.retired) status.push("致仕在乡");
      /* 白丁家主兼业糊口，人人有饭吃 */
      const hj = Game.jobInfo(c.job);
      if (!c.office && c.age >= 16 && hj) status.push(`兼${hj.name}（月入${Game.personSalary(c)}两）`);
      else if (!c.office && !c.retired) status.push("白身布衣");
    }
    $("statusLine").innerHTML = (status.join("　") || "白身布衣") +
      `<span class="hero-traits">${traitChips(c)}</span>`;

    $("apPips").innerHTML = [0, 1].map(i =>
      `<span class="ap-pip ${i < (Game.G.ap || 0) ? "on" : ""}"></span>`).join("");
    if ($("genCharBadge")) $("genCharBadge").textContent = Game.G.family.genChar || "未定";
  }

  function renderActions() {
    const g = Game.G, c = g.char;
    const noAp = (g.ap || 0) <= 0 || g.locked || !c.alive;
    const keys = c.office
      ? ["study", "martial", "social", "office", "charity", "rest"]
      : ["study", "martial", "social", "work", "charity", "rest"];
    $("actionGrid").innerHTML = keys.map(k => {
      const info = Game.ACTION_INFO[k];
      return `<button class="btn act-btn" data-act="${k}" ${(!c.alive || g.locked) ? "disabled" : Game.dis((g.ap || 0) <= 0, "本月精力已尽，且待下月")}>
        <span class="act-label">${info.label}</span>
        <span class="act-hint">${info.hint}</span>
      </button>`;
    }).join("");
    /* 自动度月：复刻上月 / 精力全投一项 / 一键连度 */
    (function () {
      const box = $("autoRow");
      if (!box) return;
      const au = g.auto || {};
      const focusKeys = keys;
      const fbtn = (k) => {
        const info = Game.ACTION_INFO[k];
        const on = au.mode === "focus" && au.key === k;
        return `<button class="btn btn-xs${on ? " btn-primary" : ""}" data-auto-focus="${k}" ${(!c.alive || g.locked) ? "disabled" : ""}>${on ? "●" : "○"}${info.label}</button>`;
      };
      box.innerHTML = `
        <span class="muted">自动：</span>
        <button class="btn btn-xs${au.mode === "repeat" ? " btn-primary" : ""}" data-auto-repeat="1" ${(!c.alive || g.locked) ? "disabled" : ""} title="每月自动复刻上月的行动安排">${au.mode === "repeat" ? "●" : "○"}复刻上月</button>
        ${focusKeys.map(fbtn).join("")}
        <span class="muted" style="font-size:12px;">设好后点“度月/度年”即自动执行</span>`;
    })();
  }

  /* ---------------- 宅院（兼容旧档：无宅邸数据也照常显示） ---------------- */
  function renderHouse() {
    const g = Game.G;
    const residents = Game.householdMembers().length;
    const cap = Game.houseCapacity();
    const cost = Game.buildRoomCost(g.house.rooms);
    const manor = Game.manorInfo ? Game.manorInfo(g.manor || "hut") : { key: "hut", name: "宅院", maxRooms: 99, upkeep: 0, maxRank: 5, desc: "" };
    const manorList = Game.MANORS || [{ key: "hut", name: "宅院", maxRooms: 99, upkeep: 0, maxRank: 5, desc: "" }];
    const manorIdx = manorList.findIndex(m => m.key === (g.manor || "hut"));
    const next = manorList[(manorIdx < 0 ? 0 : manorIdx) + 1];
    $("houseHint").textContent = manor.desc
      ? `现居${manor.name}（至多${manor.maxRooms}间），${manor.desc}；宅邸限门第上限，欲晋大族须先乔迁。`
      : `现居${manor.name}（至多${manor.maxRooms}间）；宅邸限门第上限，欲晋大族须先乔迁。`;
    $("houseArea").innerHTML = `
      <div class="house-rooms">
        ${Array.from({ length: g.house.rooms }).map((_, i) =>
          `<span class="room-dot ${i * Game.ROOM_CAP < residents ? "used" : ""}"></span>`).join("")}
      </div>
      <p class="muted" style="margin:6px 0 10px;">${g.house.rooms} 间厢房 · 可容 ${cap} 人${residents > cap ? "　<b style='color:var(--vermilion)'>已拥挤</b>" : ""}</p>
      <p class="muted">现居 <b>${manor.name}</b> · 上限${manor.maxRooms}间 · 月耗${manor.upkeep}两</p>
      <button class="btn" data-buildroom="1" ${Game.dis(g.money < cost, `起一间厢房需银${cost}两，囊中不足`) + Game.dis(g.house.rooms >= manor.maxRooms, `${manor.name}至多容${manor.maxRooms}间，须营造更高宅邸`)}>
        鸠工起一间厢房 <em class="t-cost">${cost}两</em>
      </button>
      ${next ? `<button class="btn" data-manor="${next.key}" ${(() => { const _m = []; if (g.money < next.cost) _m.push(`银差${Math.round((next.cost - g.money) * 10) / 10}两`); if (g.family.reputation < next.needRep) _m.push(`声望差${next.needRep - g.family.reputation}`); return Game.dis(_m.length > 0, `营造${next.name}条件未足：` + _m.join("、")); })()}>营造${next.name} <em class="t-cost">${next.cost}两 · 需声望${next.needRep}</em></button><p class="muted" style="font-size:12px;">${next.desc}，可至${["布衣","耕读","乡绅","望族","名门","世家"][next.maxRank]}，月耗${next.upkeep}两。</p>` : `<p class="muted">已居极品府邸。</p>`}`;
  }

  /* ---------------- 全家名册 ---------------- */
  function memberId(m) {
    if (m.role === "head") return "head";
    if (m.role === "spouse") return "sp-" + m.person.id;
    if (m.role === "inlaw") return "il-" + m.person.id;
    return m.person.id;
  }
  function relBadge(m) {
    if (m.role === "head") return '<span class="rel-badge head">家主</span>';
    if (m.role === "spouse") return `<span class="rel-badge spouse">${m.rel}</span>`;
    if (m.role === "inlaw") return `<span class="rel-badge kin">${m.rel}</span>`;
    return `<span class="rel-badge kin">${m.rel}</span>`;
  }
  function renderAutoDoctor() {
    const g = Game.G;
    const host = $("autoDoctorRow");
    if (!host) return;
    const cur = g.autoDoctor;
    const btn = (key, label) => `<button class="btn btn-xs" data-autodoctor="${key}" ${cur === key || (!cur && key === "off") ? "disabled" : ""}>${label}</button>`;
    host.innerHTML = `<span class="muted">自动延医：</span>`
      + btn("off", "不自动")
      + (Game.DOCTORS || []).map(d => btn(d.key, `${d.name}${d.fee}两${d.needRep ? "(望族)" : ""}`)).join("")
      + `<span class="muted" style="margin-left:6px;">定档后每月自动请该医生给抱病家人看诊，有钱才请。</span>`;
  }
  function renderMembers() {
    const g = Game.G;
    if (Game.renderHeirRow) Game.renderHeirRow();
    renderAutoDoctor();
    const members = Game.householdMembers();
    $("membersArea").innerHTML = members.map(m => {
      const p = m.person, st = personStatus(p);
      return `<button class="member-card" data-member="${memberId(m)}">
        <span class="mc-top">
          <span class="mc-name">${p.name}</span>
          ${relBadge(m)}
        </span>
        <span class="mc-sub">${p.gender} · ${p.age}岁 · ${(p.bm || 1)}月生${p.isSick ? " · <b style='color:var(--vermilion)'>抱病</b>" : ""}</span>
        <span class="mc-status ${st.cls}">${st.text}</span>
        ${memberTraitTag(p)}
        ${p.isSick ? '<span class="mc-trait tr-bad">需延医</span>' : ''}
      </button>`;
    }).join("");
  }

  /* 某人的子女：在籍活着的；家主夫妻看子辈，其余看parentId（入门亲眷找其婚配子女） */
  /* 第几辈：家主夫妻为第g.gen代，伯叔姑减一，子侄辈加一，孙辈加二 */
  function genOf(m) {
    const g = Game.G;
    if (!m || !m.person) return g.gen;
    if (m.role === "head" || m.role === "spouse") return g.gen;
    const r = m.person.relation;
    if (r === "孙" || r === "孙女") return g.gen + 2;
    if (r === "伯" || r === "叔" || r === "姑") return g.gen - 1;
    if (r === "子" || r === "女" || r === "侄子" || r === "侄女" || r === "媳" || r === "赘婿") return g.gen + 1;
    return g.gen;
  }

  function kidsOf(m) {
    const g = Game.G;
    if (!m || !m.person) return [];
    if (m.role === "head" || m.role === "spouse") {
      return (g.children || []).filter(x => x.alive && (x.parentId === g.char.id || (!x.parentId && (x.relation === "子" || x.relation === "女"))));
    }
    let pid = m.person.id;
    if (m.role === "inlaw") {
      const owner = (g.children || []).find(x => x.spouse && x.spouse.id === m.person.id);
      if (owner) pid = owner.id;
    }
    return (g.children || []).filter(x => x.alive && x.parentId === pid);
  }

  function showMember(id) {
    const m = Game.getMember(id);
    if (!m) return;
    const p = m.person;
    const st = personStatus(p);
    const income = m.role === "head"
      ? (p.office ? Game.SALARY(p.office.grade) : 0)
      : (p.age >= 16 ? Game.personSalary(p) : 0);
    const isTeacher = Game.G.academy.teacher && Game.G.academy.teacher.id === p.id;
    const statRows = ["体力", "智力", "武力", "魅力"].map(k => {
      const v = (p.stats || {})[k] || 0;
      const apt = p.apt ? `<em class="dt-apt">资${p.apt[k]} ×${(p.apt[k] / 100).toFixed(2)}</em>` : "";
      return `<div class="dt-stat"><span>${k}</span><b>${v}</b>${apt}</div>`;
    }).join("");
    const talent = `<div class="dt-aptblock">
        <p class="muted dt-aptcap">先天资质（决定该项进境快慢，天赋÷100 即学习倍率）</p>
        <div class="apt-row">${aptRows(p)}</div>
        <div class="trait-row">${traitChips(p)}</div>
        ${(p.traits || []).length ? `<div class="trait-desc">${p.traits.map(k => { const d = Game.traitDef(k); return d ? `<p><b>${Game.traitName(k, p.gender)}</b>·${d.desc}</p>` : ""; }).join("")}</div>` : ""}
      </div>`;
    /* 婚嫁与入宫：子娶妻入门 / 女出嫁离家或招赘留家 / 女儿另有宫中线 */
    let marryBtn = "";
    if (m.role === "child" && !p.married && !p.palace && !p.out && p.age >= 15) {
      if (p.gender === "男") {
        marryBtn = `<button class="btn" data-marry-child="${p.id}" style="margin-top:6px;">为其娶妻（媳入门同居）</button>`;
      } else {
        marryBtn = `<button class="btn" data-marry-child="${p.id}" style="margin-top:6px;">许嫁出阁（收彩礼离家）</button>`
          + `<button class="btn" data-uxori-child="${p.id}" style="margin-top:6px;">招赘留家（婿入门从家姓）</button>`
          + (((Game.G.family.reputation || 0) >= 100 || (p.spouseFamily || 0) >= 80)
            ? `<p class="muted" style="font-size:12px;">无子之家招赘最宜：婿入门同居，子嗣从${Game.G.surname}姓，来日可承祧。</p>` : "");
      }
    }
    let palaceBtn = "";
    if (m.role === "child" && p.gender === "女" && !p.married && !p.out && !p.palace) {
      if (Game.palaceEligible && Game.palaceEligible(p))
        palaceBtn += `<button class="btn" data-palace-send="${p.id}" style="margin-top:6px;">送入宫为宫女（10两打点）</button>`;
      if (Game.draftEligible && Game.draftEligible(p))
        palaceBtn += `<button class="btn" data-palace-draft="${p.id}" style="margin-top:6px;">应选秀（博妃嫔之位）</button>`;
    }
    if (m.role === "child" && p.palace) {
      palaceBtn += `<button class="btn" data-palace-leave="${p.id}" style="margin-top:6px;">赎归出宫</button>`;
    }
    if (m.role === "child" && p.married && (!p.out || p.out === "married")) {
      marryBtn += `<button class="btn" data-divorce-child="${p.id}" style="margin-top:6px;">和离（可再议亲）</button>`;
    }
    if (m.role === "child" && p.betrothed && !p.married) {
      marryBtn += `<p class="muted" style="font-size:12px;margin-top:6px;">已与${p.betrothed.name}（门户${p.betrothed.family}）定亲，十五岁自动完婚。</p>`;
    }
    if (m.role === "child" && Game.branchEligible && Game.branchEligible(p)) {
      marryBtn += `<button class="btn" data-branch-out="${p.id}" style="margin-top:6px;">分家另过（携妻儿单过，需40两）</button>`;
    }
    if (m.role === "child" && p.alive && !p.out) {
      if (Game.G.heirId === p.id)
        marryBtn += `<button class="btn" data-clear-heir="1" style="margin-top:6px;">撤嗣位</button>`;
      else
        marryBtn += `<button class="btn" data-set-heir="${p.id}" style="margin-top:6px;">立为继承人</button>`;
      if (p.age >= 15)
        marryBtn += `<button class="btn" data-abdicate="${p.id}" style="margin-top:6px;">传位给他</button>`;
    }
    /* 入门亲眷卡上也能办和离：找得到其婚配的子女即可 */
    if (m.role === "inlaw") {
      const owner = (Game.G.children || []).find(x => x.spouse && x.spouse.id === p.id && x.married);
      if (owner) marryBtn += `<button class="btn" data-divorce-child="${owner.id}" style="margin-top:6px;">和离（${owner.name}与${p.name}拆伙，可再议亲）</button>`;
    }
    /* 入门亲属注脚 */
    const inlawNote = m.role === "inlaw"
      ? `<p class="modal-text">入门亲眷，同居理家，月入 ${p.age >= 16 ? Game.personSalary(p) : 0} 两。</p>` : "";
    const spouseNote = (m.role === "child" && p.spouse && p.spouse.joined)
      ? `<p class="modal-text">${p.gender === "男" ? "妻" : "赘夫"}：${p.spouse.name}（门户${p.spouse.family}）同居家中。</p>` : "";
    const sickBlock = p.isSick ? `
      <div class="dt-sick" style="margin-top:10px;border-top:1px dashed #ccc;padding-top:8px;">
        <p class="modal-text" style="color:var(--vermilion-dk)">抱病在身，久病伤身还减半饷，抱病应考-8分，宜速延医。</p>
        <div class="btn-row">${(Game.DOCTORS || []).map(d => {
          const locked = (d.needRep || 0) > Game.G.family.reputation;
          return `<button class="btn btn-xs" data-doctor-member="${id}" data-doctor-kind="${d.key}" ${Game.dis(locked, `${d.name}非望族不请（需声望${d.needRep}）`) + Game.dis(Game.G.money < d.fee, `请${d.name}需诊金${d.fee}两，囊中不足`)}>${d.name} ${d.fee}两（愈${Math.round(d.cure * 100)}%）</button>`;
        }).join("")}</div>
        <p class="muted" style="font-size:12px;">游方便宜但看运气，圣手几乎包好还补身子（需声望120）。</p>
      </div>` : "";
    const isBirthMonth = (p.bm || 1) === Game.G.month;
    const birthdayBlock = (p.age >= 40 && p.alive) ? `
      <div class="dt-birth" style="margin-top:10px;border-top:1px dashed #ccc;padding-top:8px;">
        <p class="modal-text">寿宴祝寿${p.age >= 50 && p.age % 10 === 0 ? "（今年整寿，声望1.5倍）" : ""}，花钱换声望还收贺礼回血。${isBirthMonth ? `<b style="color:var(--vermilion-dk)">本月正值${p.name}生辰（${p.bm || 1}月），可办！</b>` : `生辰在${p.bm || 1}月（本月${Game.G.month}月），须生辰月再办。`}</p>
        ${isBirthMonth ? `<div class="btn-row">${(Game.BANQUETS || []).map(b => {
          const locked = (b.needRep || 0) > Game.G.family.reputation;
          return `<button class="btn btn-xs" data-birth-member="${id}" data-birth-kind="${b.key}" ${Game.dis(locked, `${b.name}非乡绅不敢举（需声望${b.needRep}）`) + Game.dis(Game.G.money < b.cost, `办${b.name}需银${b.cost}两，囊中不足`)}>${b.name} ${b.cost}两</button>`;
        }).join("")}</div>` : ""}
      </div>` : "";
    openModal(`
      <h3 class="modal-title">${p.name} <span class="muted" style="font-size:14px;">· ${m.rel} · 第${genOf(m)}代</span></h3>
      <p class="modal-text">${p.gender} · ${p.age}岁　${Game.birthTxt ? Game.birthTxt(p) : ""}　身份：<b class="ms-${st.cls}">${st.text}</b>${isTeacher ? "　·　族学西席" : ""}${p.married ? "　·　已婚" : ""}</p>
      <div class="dt-stats">${statRows}</div>
      <p class="modal-text" style="margin-top:10px;">
        功名：${p.title ? titleName(p.title) : "无"}${p.honor ? `　·　<b style="color:var(--vermilion-dk)">${p.honor}${p.honor === "进士" ? "" : (p.title === "jinshi" ? "·进士及第" : "")}</b>` : ""}　·　月入：${income} 两${p.age < 16 ? "　·　尚在蒙岁，月耗减半" : ""}
      </p>
      <p class="modal-text">父：${p.fatherName || "不详"}　母：${p.motherName || "不详"}</p>
      <p class="modal-text">生育：${Game.fertilityOf ? Game.fertilityOf(p) : 50}（${Game.fertilityWord ? Game.fertilityWord(p) : ""}）${p.infertile ? " · 已难再孕" : ""}</p>
      <p class="modal-text">子女：${(() => { const ks = kidsOf(m); return ks.length ? ks.map(k => `<button class="btn btn-xs" data-member="${k.id}">${k.name}（${k.gender}·${k.age}岁）</button>`).join(" ") : "暂无"; })()}</p>
      ${talent}
      ${sickBlock}
      ${birthdayBlock}
      ${(m.role === "head" || m.role === "child") ? `
      <div class="dt-rename">
        <p class="muted" style="margin:8px 0 4px;">改名（主控改姓则全家从新姓，子孙随家姓）</p>
        <div class="rename-row">
          <input type="text" id="renameInput" maxlength="5" value="${p.name}" placeholder="输入新名字">
          <button class="btn btn-xs" data-reroll-name="${id}">随机</button>
          <button class="btn btn-xs" data-rename-confirm="${id}">改名</button>
        </div>
      </div>` : ""}
      ${inlawNote}
      ${spouseNote}
      <div class="dt-foot">${marryBtn}${palaceBtn}<button class="btn modal-close" data-close="1">掩卷</button></div>`);
    const layer = $("modalLayer");
    layer.querySelector("[data-close]").addEventListener("click", closeModal);
    const mb = layer.querySelector("[data-marrymember]");
    if (mb) mb.addEventListener("click", () => { closeModal(); Game.marryChild(p.id); });
  }

  /* ---------------- 仕途履历 ---------------- */
  function renderCareer() {
    const g = Game.G, c = g.char;
    const panel = $("careerPanel");
    if (!c.office) { panel.hidden = true; return; }
    panel.hidden = false;
    if (Game.ensureOfficeState) Game.ensureOfficeState(g);
    const o = c.office;
    const posts = o.track === "civil" ? Game.CIVIL_POSTS : Game.MILITARY_POSTS;
    const thr = Game.PROMO_MERIT(o.grade);
    const meritPct = Math.min(100, Math.round((o.merit || 0) / thr * 100));
    $("careerHint").textContent = `现任 ${Game.GRADES[o.grade]}${posts[o.grade]}（月俸${Game.SALARY(o.grade)}两）。政绩积足 ${thr}，岁考方得升迁。`;
    $("careerBody").innerHTML = `
      <div class="career-merit">
        <div class="cm-head"><b>政绩</b><span>${o.merit || 0} / ${thr}</span></div>
        <div class="cm-track"><div class="cm-fill" style="width:${meritPct}%"></div></div>
      </div>
      <p class="muted panel-hint">唯政绩论升迁：政绩攒足，岁考即迁。宗族事看族亲页宗族情分。</p>`;
  }

  /* ---------------- 行动 ---------------- */
  /* ---------------- 科举 ---------------- */
  function renderExams() {
    const g = Game.G, c = g.char;
    const monthNames = { 3: "三月春闱", 4: "四月", 8: "八月秋闱", 9: "九月武闱" };
    $("examArea").innerHTML = Game.EXAMS.map(ex => {
      const done = c.title === ex.key || isPast(ex, c.title);
      const avail = Game.examAvailable(ex);
      const now = ex.month !== null && g.month === ex.month && ex.need === c.title;
      let btn;
      if (done) btn = `<span class="ec-badge">已及第</span>`;
      else if (ex.need && c.title !== ex.need)
        btn = `<button class="btn btn-xs" disabled>需先中「${titleName(ex.need)}」</button>`;
      else if (ex.month !== null && g.month !== ex.month)
        btn = `<button class="btn btn-xs" disabled>${monthNames[ex.month]}方开科</button>`;
      else {
        let examWhy = "";
        if (!avail) {
          if (c.age < 16) examWhy = `年方${c.age}岁，须年满十六方可下场`;
          else if (g.money < ex.fee) examWhy = `应考需盘缠${ex.fee}两，囊中不足`;
          else if (c.stats.体力 < 10) examWhy = "体弱难支（体力不足10），先养好身子再入场";
          else examWhy = "此科暂未开考";
        }
        btn = `<button class="btn btn-xs" data-exam="${ex.key}" ${Game.dis(!avail, examWhy)}>${ex.fee ? `赴考 ${ex.fee}两` : "入殿对策"}</button>`;
      }
      return `<div class="exam-card ${done ? "done" : ""}">
        <div class="ec-top"><b>${ex.name}</b><span class="ec-month">${ex.month === null ? "随时" : monthNames[ex.month]}</span></div>
        <span class="ec-desc">${ex.desc}</span>
        ${btn}${now && !done ? '<span class="ec-badge">本月正是考期</span>' : ""}
      </div>`;
    }).join("");

    $("examHint").textContent = c.office
      ? (c.age >= 55 ? "年逾古稀尚可乞骸骨致仕，归乡荣养。" : "食君之禄，年末由考绩定升迁。")
      : "文重智力、武重武力；声望可添几分卷面气运。";
    if (c.office && c.age >= 55) {
      $("examArea").insertAdjacentHTML("beforeend",
        `<div class="exam-card"><b>致仕归乡</b><span class="ec-desc">辞去官职，保全令名</span><button class="btn btn-xs" data-retire="1">上表乞骸骨</button></div>`);
    }
    /* 捐纳：有钱人的另一条路 */
    if (!c.office) {
      const donations = (Game.DONATIONS || []).map(d => {
        let disabled = g.money < d.cost ? `需${d.cost}两` : d.desc;
        if (d.key === "jian" && c.title) disabled = "已有功名";
        if (d.key === "office" && !(c.title === "xiucai" || c.title === "juren" || c.title === "gongshi")) disabled = "需秀才出身";
        if ((d.needRep || 0) > g.family.reputation) disabled = `需声望${d.needRep}`;
        const can = !disabled.startsWith("需") && disabled === d.desc;
        return `<div class="exam-card donate-card">
          <div class="ec-top"><b>${d.name}</b><span class="ec-month">${d.cost}两</span></div>
          <span class="ec-desc">${disabled}</span>
          <button class="btn btn-xs" data-donate="${d.key}" ${Game.dis(!can, disabled)}>纳银捐纳</button>
        </div>`;
      }).join("");
      $("examArea").insertAdjacentHTML("beforeend", donations);
    }
  }
  function isPast(ex, title) {
    const orderC = ["xiucai", "juren", "gongshi", "jinshi"];
    const orderM = ["wuxiucai", "wujuren", "wujinshi"];
    const seq = ex.track === "civil" ? orderC : orderM;
    return seq.indexOf(title) > seq.indexOf(ex.key);
  }

  /* ---------------- 商事铺号 ---------------- */
  function renderShops() {
    const g = Game.G;
    const cap = Game.shopCap();
    const atLimit = g.shops.length >= cap;
    $("bizInfo2").textContent = `已开张 ${g.shops.length} 间 · 阖族功名官身可撑 ${cap} 间${atLimit ? "（额度已满）" : ""}`;
    if ($("upgradeAllBtn")) {
      const upC = g.shops.filter(x => (x.level || 1) < 3);
      const upMin = upC.length ? Math.min.apply(null, upC.map(x => Game.upgradeCost(x))) : 0;
      const upWhy = !g.shops.length ? "尚无铺面可升" : !upC.length ? "间间都是老字号，无需再升" : (g.money < upMin ? `最便宜的升级也要${upMin}两，囊中不足（经营/口碑未足者亦须再养）` : "");
      if (upWhy) $("upgradeAllBtn").setAttribute("data-why", upWhy); else $("upgradeAllBtn").removeAttribute("data-why");
    }
    if ($("hireAllBtn")) {
      const hireWhy = !g.shops.length ? "尚无铺面可雇人" : (!g.shops.some(x => (x.clerks || 0) < 2) ? "间间铺子伙计都满了（2人），无需再雇" : "");
      if (hireWhy) $("hireAllBtn").setAttribute("data-why", hireWhy); else $("hireAllBtn").removeAttribute("data-why");
    }

    const trendTxt = (key) => {
      const tr = (g.trends && g.trends[key]) || 1;
      const pct = Math.round((tr - 1) * 100);
      const arrow = pct > 5 ? "涨↗" : pct < -5 ? "跌↘" : "平→";
      return `行市${tr.toFixed(2)}（${arrow}${Math.abs(pct)}%）`;
    };
    $("shopOpenRow").innerHTML = Object.entries(Game.SHOP_TYPES).map(([key, t]) => {
      const afford = g.money >= t.cost;
      const trc = ((g.trends && g.trends[key]) || 1) >= 1 ? "var(--moss)" : "var(--vermilion-dk)";
      const openWhy = atLimit ? `额度已满（功名官身只撑${cap}间，须族人博取功名）` : (!afford ? `开张${t.name}需本钱${t.cost}两，囊中不足` : "");
      return `<button class="btn" data-open="${key}" ${Game.dis(atLimit || !afford, openWhy)}>
        <span class="so-name">${t.name}</span>
        <span class="so-cost">${afford ? `本金${t.cost}两` : `需${t.cost}两`} · ${t.tag}</span>
        <span class="so-cost" style="color:${trc}">${trendTxt(key)}</span>
      </button>`;
    }).join("");

    /* 额度来源：列出有功名官身、为商事之额撑腰的家人 */
    const patrons = Game.householdMembers()
      .filter(m => Game.personShopCap(m.person) > 0)
      .map(m => `${m.rel === "家主" ? "家主" : m.person.name}（${personStatus(m.person).text} ＋${Game.personShopCap(m.person)}）`);
    const capNote = atLimit
      ? `<p class="muted shop-cap-note">额度已满。铺数不设死限，而系于阖族功名官身：令族人多中科第、出仕为官，商事之额自增。</p>`
      : `<p class="muted shop-cap-note">小家本可开 ${Game.SHOP_CAP_BASE} 间；功名官身另添额度${patrons.length ? "：" + patrons.join("、") : "，眼下阖族尚是白丁，宜先课子读书博取功名"}。</p>`;

    if (!g.shops.length) {
      $("shopList").innerHTML = capNote +
        '<p class="muted" style="font-size:12.5px;">铺号口碑自三十起步，诚信经营、打折酬宾皆可攒口碑；口碑越高，月流水越丰，连招牌带铺底盘出也越值钱。各类际遇还会令口碑浮沉。</p>';
      return;
    }
    $("shopList").innerHTML = g.shops.map(s => {
      const t = Game.SHOP_TYPES[s.type];
      const mul = Game.fameMul(s.fame);
      const price = Game.shopPrice(s);
      const pnl = s.lastProfit || 0;
      const lv = s.level || 1;
      const tr = (g.trends && g.trends[s.type]) || 1;
      const upCost = lv < 3 ? Game.upgradeCost(s) : null;
      const upNeedM = lv === 1 ? 6 : 12, upNeedF = lv === 1 ? 50 : 70;
      const upOk = lv < 3 && (s.months || 0) >= upNeedM && (s.fame || 0) >= upNeedF && g.money >= upCost;
      const upWhy = lv >= 3 ? "" : ((s.months || 0) < upNeedM ? `经营${s.months || 0}/${upNeedM}月` : (s.fame || 0) < upNeedF ? `口碑${s.fame}/${upNeedF}` : `需${upCost}两`);
      return `<div class="shop-card ${s.discount ? "discounting" : ""}">
        <div class="shop-head">
          <b>${t.name}·${Game.shopLevelName(lv)}</b>
          <span class="shop-pnl ${pnl >= 0 ? "up" : "down"}">上月 ${pnl >= 0 ? "+" : ""}${pnl}两</span>
        </div>
        <div class="shop-fame">
          <div class="mini-bar"><i style="width:${s.fame}%;background:linear-gradient(90deg,var(--moss),#7a9a58);"></i></div>
          <span class="fame-num">口碑 ${s.fame}</span>
          <span class="fame-mul">×${mul.toFixed(2)}</span>
        </div>
        <div class="muted" style="font-size:12px;margin:2px 0;">本行行市 ×${tr.toFixed(2)}${tr >= 1 ? "（顺风）" : "（逆风）"} · 伙计${s.clerks || 0}/2人（工钱${(s.clerks || 0) * 2}两/月，流水+${(s.clerks || 0) * 10}%）</div>
        <div class="shop-foot">
          <span class="muted">${t.tag} · 月用度${t.upkeep}两</span>
          ${s.discount ? '<span class="shop-tag-disc">本月打折</span>' : ""}
          <span class="btn-row">
            <button class="btn btn-xs" data-discount="${s.id}">${s.discount ? "停止打折" : "打折酬宾"}</button>
            <button class="btn btn-xs" data-hire-clerk="${s.id}" ${Game.dis((s.clerks || 0) >= 2, "这间铺子伙计已满（2人）")}>雇伙计</button>
            ${(s.clerks || 0) > 0 ? `<button class="btn btn-xs" data-dismiss-clerk="${s.id}">辞伙计</button>` : ""}
            ${upCost != null ? `<button class="btn btn-xs" data-upgrade-shop="${s.id}" ${Game.dis(!upOk, (s.months || 0) < upNeedM ? `${Game.shopName(s)}才开张${s.months || 0}个月，根基未稳（需满${upNeedM}个月）` : (s.fame || 0) < upNeedF ? `${Game.shopName(s)}口碑${s.fame}，街坊还认不得（需口碑${upNeedF}）` : `升${Game.shopLevelName(lv + 1)}需银${upCost}两，囊中不足`)}>升${Game.shopLevelName(lv + 1)}${upWhy}</button>` : `<span class="muted">三级老字号</span>`}
            <button class="btn btn-xs" data-sellshop="${s.id}">盘出约${price}两</button>
          </span>
        </div>
      </div>`;
    }).join("") + capNote;
  }

  /* ---------------- 钱庄 ---------------- */
  function renderBank() {
    const g = Game.G;
    const host = $("bankArea");
    if (!host) return;
    if (!g.bank) g.bank = { deposit: 0, loan: 0 };
    host.innerHTML = `
      <p>庄存 <b>${g.bank.deposit}</b> 两（月息一分）　欠账 <b style="color:${g.bank.loan > 0 ? "var(--vermilion-dk)" : "inherit"}">${g.bank.loan}</b> 两（月息五分）</p>
      <div class="land-deal">
        <input type="number" id="bankAmt" min="1" step="1" placeholder="银两">
        <button class="btn btn-xs" data-bank="deposit">存入</button>
        <button class="btn btn-xs" data-bank="withdraw">取出</button>
        <button class="btn btn-xs" data-bank="borrow">借入</button>
        <button class="btn btn-xs" data-bank="repay">还欠</button>
      </div>
      <p class="muted" style="font-size:12px;">存款每月自动结息；欠账每月自动扣息，记得还本。</p>`;
  }

  /* ---------------- 族学 ---------------- */
  function renderAcademy() {
    const g = Game.G;
    const t = g.academy.teacher;
    const pupils = g.children.filter(x => x.alive && x.age >= 3 && x.age <= 15).length;
    $("academyHint").textContent = pupils
      ? `族中现有 ${pupils} 名蒙童在学之年，西席学力越高，子弟岁课进益越快。`
      : "延师开馆，蒙童满三岁便可入学；眼下虽无学生，亦可先备师资。";

    $("academyCurrent").innerHTML = t ? `
      <div class="ac-current">
        <div class="ac-cur-main">
          <b>${t.name}</b> <span class="muted">${t.age}岁 · 学力${t.skill}</span>
          <p class="ac-cur-desc">${t.desc}</p>
        </div>
        <span class="ac-cur-meta">${t.stipend ? `月支束脩 ${t.stipend} 两` : "不支束脩"}</span>
        <button class="btn btn-xs" data-dismiss-t="1">${t.kind === "self" ? "停课" : "辞馆"}</button>
      </div>` : "";

    const hasT = !!t, c = g.char;
    const kin = Game.familyTeacherCandidates().filter(r => r.stats.智力 >= 35);
    $("familyTeacherRow").innerHTML =
      `<button class="btn" data-teach="self" ${Game.dis(hasT, "族学已有西席，先辞旧人再聘") + " " + Game.dis(c.stats.智力 < 40, "家主智力不足40，自家经史工夫尚浅，恐误人子弟")}>
         <span>家主亲授</span><em class="t-cost">${c.stats.智力 < 40 ? "智力不足40" : "免束脩 · 分心耗神"}</em>
       </button>` +
      (kin.map(r => `<button class="btn" data-teach="${r.id}" ${Game.dis(hasT, "族学已有西席，先辞旧人再聘")}>
         <span>${r.name}（${r.relation}）</span><em class="t-cost">智力${r.stats.智力} · 月1两</em>
       </button>`).join("") || "");
    if (!kin.length) {
      $("familyTeacherRow").insertAdjacentHTML("beforeend",
        '<p class="muted" style="font-size:12px;">族中尚无学问够格的成年子弟。</p>');
    }

    $("visitTeacherRow").innerHTML = Game.TEACHERS.map(tp => {
      const locked = g.family.reputation < tp.needRep || g.land < tp.needLand;
      const reason = g.family.reputation < tp.needRep
        ? `需声望${tp.needRep}`
        : (g.land < tp.needLand ? `需田产${tp.needLand}亩` : `聘金${tp.gift}两 · 月${tp.stipend}两`);
      const visitWhy = hasT ? "族学已有西席，先辞旧人再聘" : "";
       return `<button class="btn" data-visit="${tp.kind}" ${Game.dis(locked, `${tp.name}：${reason}`) + " " + Game.dis(hasT, visitWhy)}>
        <span>${tp.name}</span><em class="t-cost">${reason}</em>
      </button>`;
    }).join("");

    const list = g.academyCandidates || [];
    $("teacherCandidates").innerHTML = list.length ? `
      <p class="ac-sub" style="margin-top:12px;">寻访所得，择一延聘</p>
      <div class="tc-list">
        ${list.map(tc => `
          <div class="tc-card">
            <div class="tc-head"><b>${tc.name}</b><span class="tc-skill">学力 ${tc.skill} · ${tc.age}岁</span></div>
            <p class="tc-desc">${tc.desc}</p>
            <div class="tc-foot">
              <span class="muted">聘金 ${tc.gift} 两　每月束脩 ${tc.stipend} 两</span>
              <span class="btn-row">
                <button class="btn btn-xs" data-hire-t="${tc.id}">延请入馆</button>
              </span>
            </div>
          </div>`).join("")}
      </div>
      <div class="btn-row" style="margin-top:8px;"><button class="btn btn-xs" data-close-tc="1">暂且不聘</button></div>` : "";
    /* 子弟游学：6-15岁一年一次，有先生指点加成 */
    const tourKids = g.children.filter(x => x.alive && x.age >= 6 && x.age <= 15);
    if (tourKids.length) {
      const tourHtml = `<p class="ac-sub" style="margin-top:12px;">子弟游学（一年一次${g.academy.teacher ? " · 有先生指点，事半功倍" : ""}）</p>
      <div class="tc-list">${tourKids.map(ch => `
        <div class="tc-card">
          <div class="tc-head"><b>${ch.name}</b><span class="tc-skill">${ch.age}岁 · ${ch.lastTourYear === g.year ? "今年已游" : "待游"}</span></div>
          <div class="btn-row">${(Game.TOURS || []).map(t => {
            const okAge = ch.age >= t.minAge && ch.age <= t.maxAge;
            const okRep = (t.needRep || 0) <= g.family.reputation;
            const can = okAge && okRep && ch.lastTourYear !== g.year && g.money >= t.cost;
            const reason = !okAge ? `${t.minAge}-${t.maxAge}岁` : !okRep ? `需声望${t.needRep}` : ch.lastTourYear === g.year ? "今年已游" : `${t.cost}两`;
            const tourWhy = !okAge ? `${ch.name}年${ch.age}岁，不宜${t.name}（宜${t.minAge}-${t.maxAge}岁）` : !okRep ? `${t.name}需声望${t.needRep}（今${g.family.reputation}）方可成行` : ch.lastTourYear === g.year ? `${ch.name}今年已游学过，来年再去` : `${t.name}需盘缠${t.cost}两，囊中不足`;
            return `<button class="btn btn-xs" data-tour-child="${ch.id}" data-tour-kind="${t.key}" ${Game.dis(!can, tourWhy)}>${t.name} ${reason}</button>`;
          }).join("")}</div>
        </div>`).join("")}</div>`;
      $("teacherCandidates").insertAdjacentHTML("beforeend", tourHtml);
    }
  }

  /* ---------------- 姻亲 ---------------- */
  function renderMarriage() {
    const g = Game.G;
    const aliveKids = g.children.filter(x => x.alive).length;
    if (g.spouse && (g.spouse.favor == null)) g.spouse.favor = 65;
    let txt = g.spouse
      ? `${g.char.gender === "男" ? "妻" : "赘夫"}：${g.spouse.name}（${g.spouse.age}岁·${g.spouse.bm || 1}月生）　子嗣 ${aliveKids} 人`
      : "尚未婚配";
    if (g.spouse && g.pregnancy) {
      txt += `　·　有孕${g.pregnancy.month}月（还${g.pregnancy.total - g.pregnancy.month + 1}月临盆）`;
    } else if (g.spouse && (g.cooldown || 0) > 0) {
      txt += `　·　产后调养`; 
    }
    $("marriageStatus").textContent = txt;
    /* 夫妻相处盒：好感条 + 陪伴/赠礼/和离，离婚后可再议亲 */
    let host = document.querySelector('[data-candidate-host]');
    if (host) {
      let sb = document.getElementById("spouseBox");
      if (sb) sb.remove();
      if (g.spouse) {
        const s = g.spouse;
        const tip = s.favor >= 80 ? "恩爱和美，易得子" : s.favor >= 50 ? "相敬如宾" : s.favor >= 30 ? "渐生龃龉，恐难受孕" : "同床异梦，恐出走";
        host.insertAdjacentHTML("afterbegin", `<div class="spouse-box" id="spouseBox">
          <div class="spouse-head"><b>${s.name}</b><span class="muted">${g.char.gender === "男" ? "妻" : "赘夫"} · ${s.age}岁 · ${(s.bm || 1)}月生 · 门户${s.family || "?"}</span></div>
          <div class="rel-track"><i style="width:${s.favor}%"></i></div>
          <p class="muted">夫妻好感 ${s.favor}/100 · ${tip}（每月-1，多陪伴可增；好感高更易添丁，过低配偶可能出走）</p>
          <p class="muted">子嗣缘：你${Game.fertilityOf ? Game.fertilityOf(g.char) : "?"} · ${s.name}${Game.fertilityOf ? Game.fertilityOf(s) : "?"}${s.infertile || g.char.infertile ? "（一方已难再孕，添丁无望）" : ""}</p>
          <div class="btn-row">
            <button class="btn btn-xs" data-spouse-care="1" ${Game.dis((g.ap || 0) <= 0, "本月精力已尽，且待下月")}>陪伴(1精力)</button>
            <button class="btn btn-xs" data-spouse-gift="small" ${Game.dis(g.money < 5, "赠点心需5两，囊中不足")}>赠点心5两</button>
            <button class="btn btn-xs" data-spouse-gift="mid" ${Game.dis(g.money < 20, "赠绸缎需20两，囊中不足")}>赠绸缎20两</button>
            <button class="btn btn-xs" data-spouse-gift="big" ${Game.dis(g.money < 60, "赠首饰需60两，囊中不足")}>赠首饰60两</button>
            <button class="btn btn-xs" data-divorce="1">和离</button>
          </div>
        </div>`);
      }
    }
    document.querySelectorAll("[data-mm]").forEach(btn => {
      btn.disabled = g.locked || !g.char.alive;
    });
    renderCandidate();
    renderContacts();
  }
  function renderContacts() {
    const g = Game.G;
    const list = g.contacts || [];
    const kids = g.children.filter(x => x.alive && !x.married && !x.palace && !x.out && !x.betrothed && x.age >= 15);
    const youngKids = g.children.filter(x => x.alive && !x.married && !x.palace && !x.out && !x.betrothed && x.age < 15);
    const sortList = (arr) => arr.slice().sort((a, b) => {
      if (contactsSort === "family") return (b.family || 0) - (a.family || 0);
      if (contactsSort === "apt") return ((b.apt && b.apt.智力) || 0) - ((a.apt && a.apt.智力) || 0);
      return (b.favor || 0) - (a.favor || 0);   /* 默认好感降序 */
    });
    const marriageable = sortList(list.filter(x => (x.favor || 0) >= 80));
    const royals = sortList(list.filter(x => x.type === "royal"));
    const others = sortList(list.filter(x => (x.favor || 0) < 80 && x.type !== "royal"));
    let view = [];
    if (contactsFilter === "marriageable") view = marriageable;
    else if (contactsFilter === "royal") view = royals;
    else view = list.length ? sortList(list) : [];
    const card = (ct) => `
        <div class="tc-card" style="margin-top:6px;">
          <div class="tc-head"><b>${ct.name}</b><span class="muted">${ct.typeName} · ${ct.gender}·${ct.age}岁·门户${ct.family}</span></div>
          <div class="apt-row">${aptRows(ct)}</div>
          <div class="trait-row">${traitChips(ct)}</div>
          <div class="rel-track" style="margin:4px 0;"><i style="display:block;height:6px;background:linear-gradient(90deg,#c86,#a52);width:${ct.favor}%"></i></div>
          <p class="muted">${ct.favor >= 80
            ? `好感 ${ct.favor}/100 · <b style="color:var(--vermilion-dk)">已可提亲！</b>`
            : `好感 ${ct.favor}/100 · 距提亲还差 <b>${80 - ct.favor}</b>（约拜访${Math.ceil((80 - ct.favor) / 6)}次或厚礼${Math.ceil((80 - ct.favor) / 11)}次）· 若不走动约${ct.favor}月后淡忘（每月-1）`}</p>
          <div class="btn-row">
            <button class="btn btn-xs" data-visit-ct="${ct.id}" ${Game.dis((g.ap || 0) <= 0, "本月精力已尽，且待下月")}>拜访(1精力+3两)</button>
            <button class="btn btn-xs" data-gift-ct="${ct.id}" data-level="small" ${Game.dis(g.money < 5, "薄礼需5两，囊中不足")}>薄礼5两</button>
            <button class="btn btn-xs" data-gift-ct="${ct.id}" data-level="mid" ${Game.dis(g.money < 20, "厚礼需20两，囊中不足")}>厚礼20两</button>
            <button class="btn btn-xs" data-gift-ct="${ct.id}" data-level="big" ${Game.dis(g.money < 60, "珠宝需60两，囊中不足")}>珠宝60两</button>
            ${(!g.spouse && g.char.gender !== ct.gender) ? `<button class="btn btn-xs" data-propose-ct="${ct.id}" ${Game.dis(ct.favor < 80, `${ct.name}好感${ct.favor}，距提亲还差${80 - ct.favor}（多拜访、备厚礼）`)}>提亲迎娶</button>` : ""}
            ${kids.length && ct.favor >= 80 ? `<button class="btn btn-xs" data-match-contact="${ct.id}">为族人说亲（${kids.length}位可选）</button>` : ""}
            ${youngKids.filter(k => k.gender !== ct.gender).map(k => `<button class="btn btn-xs" data-betroth-ct="${ct.id}" data-child="${k.id}" ${Game.dis(ct.favor < 80, `${ct.name}好感${ct.favor}，距定亲还差${80 - ct.favor}（多拜访、备厚礼）`)}>为${k.name}(${k.age}岁)定亲</button>`).join("")}
            <button class="btn btn-xs" data-dismiss-ct="${ct.id}">断交</button>
          </div>
        </div>`;
    /* 主阵地：人际页（分组 + 好感排序） */
    const main = document.getElementById("contactsArea");
    if (main) {
      const fBtn = (key, label, n) => `<button class="btn btn-xs" data-cfilter="${key}" ${contactsFilter === key ? "disabled" : ""}>${label}(${n})</button>`;
      const sBtn = (key, label) => `<button class="btn btn-xs" data-csort="${key}" ${contactsSort === key ? "disabled" : ""}>${label}${contactsSort === key ? "↓" : ""}</button>`;
      const controls = `<div class="btn-row" style="margin-bottom:8px;">
        ${fBtn("all", "已结识", list.length)}
        ${fBtn("marriageable", "可提亲", marriageable.length)}
        ${fBtn("royal", "皇亲", royals.length)}
        <span class="muted" style="margin-left:6px;">排序：</span>
        ${sBtn("favor", "好感")}${sBtn("family", "门户")}${sBtn("apt", "天赋")}
      </div>
      <div class="btn-row" style="margin-bottom:8px;">
        <span class="muted">名帖（${list.length}/8）· 高门另有阖族好感，每月-2，更难维持</span>
      </div>`;
    /* 高门世家：固定五姓，旧时王谢堂前燕 */
    const clanCard = (t) => {
      const f = Game.clanFavorOf(Game.G, t.key);
      const needM = Math.max(0, 85 - f), needR = Math.max(0, 90 - f);
      const canOffice = !!(Game.G.char.office);
      const recCd = Game.G.clanRec && Game.G.clanRec[t.key] === Game.G.year;
      const kin = Game.clanKinOf ? Game.clanKinOf(Game.G, t.key) : null;
      return `
        <div class="tc-card" style="margin-top:6px;border-left:3px solid var(--gold);">
          <div class="tc-head"><b>${t.name}</b><span class="muted">${t.motto} · ${t.desc}</span></div>
          <p class="muted">门户约${t.family[0]}–${t.family[1]} · 子弟天赋更佳（${t.tilt}突出），聘礼约为门户两倍，嫁女须倒贴嫁妆（+声望、耗人情）</p>
          <div class="rel-track" style="margin:4px 0;"><i style="display:block;height:6px;background:linear-gradient(90deg,#c9a227,#8a6d1f);width:${f}%"></i></div>
          <p class="muted">阖族好感 ${f}/100${kin ? `（姻亲不断·女${kin.name}在堂，好感不减）` : "（每月-2，更难维持）"}${f >= 85 ? ' · <b style="color:var(--vermilion-dk)">可提亲！</b>' : ` · 距提亲还差 <b>${needM}</b>`}${f >= 90 ? ' · <b style="color:var(--vermilion-dk)">可举荐！</b>' : ` · 距举荐还差 <b>${needR}</b>`}</p>
          <div class="btn-row">
            <button class="btn btn-xs" data-visit-clan="${t.key}" ${Game.dis((Game.G.ap || 0) <= 0, "本月精力已尽，且待下月")}>拜访(1精力+8两)</button>
            <button class="btn btn-xs" data-gift-clan="${t.key}" ${Game.dis(Game.G.money < 30, "高门厚礼需30两，囊中不足（高门眼界高，薄礼不收）")}>厚礼30两</button>
            ${(!Game.G.spouse) ? `<button class="btn btn-xs" data-propose-clan="${t.key}" ${Game.dis(f < 85, `${t.name}好感${f}，距提亲还差${85 - f}（多拜访走动）`)}>提亲迎娶/入赘</button>` : ""}
            ${kids.length && f >= 85 ? `<button class="btn btn-xs" data-match-clan="${t.key}">为族人说亲（${kids.length}位可选）</button>` : ""}
            ${canOffice ? `<button class="btn btn-xs" data-recommend-clan="${t.key}" ${Game.dis(f < 90, `${t.name}好感${f}，距举荐还差${90 - f}（高门举荐须好感90）`) + " " + Game.dis(recCd, `${t.name}今年已为你美言，好事须待来年`)}>${recCd ? "今年已举荐" : "求举荐(直升一级)"}</button>` : `<span class="muted">举荐需先有官身</span>`}
          </div>
        </div>`;
    };
    const clanHtml = `<p class="muted" style="margin:4px 0;">旧时王谢堂前燕——高门五姓，阖族一个好感，比寻常往来难维持，可娶可嫁可举荐。</p>` + (Game.GREAT_CLANS || []).map(clanCard).join("");

      const section = (title, arr) => arr.length ? `<p class="ac-sub" style="margin-top:10px;">${title}（${arr.length}人）</p>${arr.map(card).join("")}` : "";
      let body = "";
      if (!list.length) {
        body = '<p class="muted">尚无往来。元宵、七夕、中秋多度月走走，或有奇遇（名帖最多8人）。</p>';
      } else if (contactsFilter === "all") {
        body = section("可提亲", marriageable) + section("皇亲贵胄", royals.filter(x => x.favor < 80)) + section("其他往来", others);
        if (!body) body = view.map(card).join("");
      } else {
        body = view.length ? view.map(card).join("") : '<p class="muted">此组暂无。好感80可提亲，多拜访赠礼；皇亲需声望220多度月。</p>';
      }
      main.innerHTML = controls + clanHtml + body;
    }
    /* 姻亲页只留个引子，避免两边重复按钮 */
    let host = document.querySelector('[data-candidate-host]');
    if (host) {
      let old = document.getElementById("contactsBox");
      if (old) old.remove();
      const hint = list.length
        ? `已结识${list.length}人，最高好感${Math.max(...list.map(x => x.favor))}，往人际页走动提亲。`
        : `尚无往来，往人际页走动。`;
      host.insertAdjacentHTML("beforeend", `<div class="candidate-card" id="contactsBox" style="margin-top:8px;"><p><b>人际往来</b> <span class="muted">${hint}</span></p></div>`);
    }
  }
  Game.showCandidate = function () { renderCandidate(); };
  function renderCandidate() {
    const g = Game.G;
    const host = document.querySelector('[data-candidate-host]');
    let slot = $("candidateSlot");
    const list = g.candidates && g.candidates.length ? g.candidates : (g.candidate ? [g.candidate] : null);
    if (!list) { if (slot) slot.remove(); return; }
    const card = (c, i) => {
      const st = c.stats || {};
      return `
      <div class="tc-card" style="margin-top:6px;">
        <p><span class="cc-name">${c.name}</span>　<span class="muted">${c.gender} · ${c.age}岁 · 门户${c.family}</span></p>
        <p class="muted">体力${st.体力 || "?"}　智力${st.智力 || "?"}　武力${st.武力 || "?"}　魅力${st.魅力 || "?"}</p>
        <div class="apt-row cc-apt">${aptRows(c)}</div>
        <div class="trait-row">${traitChips(c)}</div>
        <p>聘礼 <b style="color:var(--vermilion-dk)">${c.gift}</b> 两</p>
        <div class="btn-row"><button class="btn btn-xs" data-propose="${i}">相中TA，下聘</button></div>
      </div>`;
    };
    const html = `<div class="candidate-card" id="candidateSlot">
      <p><b>说亲对象（${list.length}位）</b> <span class="muted">中意便下聘，全不中意就婉拒，下个月再请媒</span></p>
      ${list.map(card).join("")}
      <div class="btn-row"><button class="btn btn-xs" data-reject="1">三位都婉拒</button></div>
    </div>`;
    if (slot) slot.outerHTML = html;
    else host.insertAdjacentHTML("beforeend", html);
  }

  /* ---------------- 字辈诗 ---------------- */
  function renderGenPoem() {
    const g = Game.G;
    const host = $("genPoemRow");
    if (!host) return;
    const poem = g.family.genPoem;
    const presets = (Game.GEN_POEMS || []).map((t, i) =>
      `<button class="btn btn-xs" data-genpoem-use="${i}" title="${t.chars}">${t.name}</button>`).join("");
    host.innerHTML = poem
      ? `<p class="muted" style="font-size:12px;margin:4px 0;">现行字辈诗（${poem.length}字循环）：<b>${poem.length > 24 ? poem.slice(0, 24) + "……" : poem}</b></p>
         <div class="genchar-row"><input type="text" id="genPoemEdit" style="width:150px" placeholder="粘贴整首另立新诗"><button class="btn btn-xs" data-genpoem-set="1">另立</button><button class="btn btn-xs" data-genpoem-clear="1">撤诗</button></div>`
      : `<p class="muted" style="font-size:12px;margin:4px 0;">未立字辈诗（单字顺进）。可用现成三首，或自填整首：</p>
         <div class="btn-row">${presets}</div>
         <div class="genchar-row"><input type="text" id="genPoemEdit" style="width:150px" placeholder="如：忠孝传家远诗书继世长"><button class="btn btn-xs" data-genpoem-set="1">立此诗</button></div>`;
  }

  /* ---------------- 田庄：庄头 ---------------- */
  function renderSteward() {
    const g = Game.G;
    const host = $("stewardArea");
    if (!host) return;
    if (!g.steward) {
      host.innerHTML = `<div class="btn-row">${(Game.STEWARDS || []).map(t => {
        const ok = g.family.reputation >= (t.needRep || 0);
        const stWhy = !ok ? `${t.name}非声望${t.needRep}之家不就` : (g.money < t.wage ? "连首月工钱都开不出" : "");
        return `<button class="btn btn-xs" data-hire-steward="${t.kind}" ${Game.dis(!ok || g.money < t.wage, stWhy)}>聘${t.name} ${t.wage}两/月${t.bonus ? "·收成+" + Math.round(t.bonus * 100) + "%" : ""}${t.needRep ? "·需声望" + t.needRep : ""}</button>`;
      }).join("")}</div>
      <p class="muted" style="font-size:12px;margin-top:4px;">${(Game.STEWARDS || []).map(t => `${t.name}：${t.desc}`).join("；")}。</p>`;
      return;
    }
    const st = g.steward;
    host.innerHTML = `
      <p><b>${st.name}</b> <span class="muted">月钱${st.wage}两${st.bonus ? " · 收成+" + Math.round(st.bonus * 100) + "%" : ""}</span>
      <button class="btn btn-xs" data-dismiss-steward="1">辞退</button></p>
      <p class="muted" style="font-size:12px;">当季自动把分派田种满，种子工本照支，钱不够则量力少种；分派多少就种多少，不用你再点。</p>
      ${Game.FOOD_KEYS.map(k => {
        const crop = Game.cropInfo(k);
        const standing = Game.standingMu(g, k);
        return `<div class="grain-row"><span class="gr-name">${crop.name}</span>
          <span class="muted">分派${g.landUse[k] || 0}亩 · 在田${standing}亩</span></div>`;
      }).join("")}`;
  }
  /* ---------------- 田庄：田亩分派 ---------------- */
  /* 近三月均价 + 走势小条 */
  function sparkHtml(arr) {
    if (!arr || arr.length < 2) return '<span class="muted">数据尚少</span>';
    const mn = Math.min(...arr), mx = Math.max(...arr);
    const bars = "▁▂▃▄▅▆▇";
    return '<span class="spark">' + arr.slice(-6).map(v => {
      const i = mx === mn ? 3 : Math.round((v - mn) / (mx - mn) * 6);
      const up = v >= arr[0];
      return `<em class="${up ? "up" : "dn"}">${bars[i]}</em>`;
    }).join("") + "</span>";
  }
  function trendHtml(arr, unit) {
    const avg = Game.avg3 ? Game.avg3(arr) : null;
    if (avg == null) return "";
    return `近三月均价 <b>${avg}</b> ${unit} ${sparkHtml(arr)}`;
  }
  const useName = (k) => { const u = Game.LAND_USES.find(x => x.key === k); return u ? u.name : k; };
  const mrange = (arr) => arr.length === 1 ? `${arr[0]}月` : `${arr[0]}–${arr[arr.length - 1]}月`;
  function renderLandUse() {
    const g = Game.G, u = g.landUse;
    const allocated = Game.landAllocated();
    $("landAllocInfo").textContent = `共 ${g.land} 亩，已分派 ${allocated} 亩 · 今为${g.month}月`;
    $("landPriceInfo").textContent = g.landPrice;
    const lpTrend = trendHtml(g.priceHist && g.priceHist.land, "两/亩");
    if (lpTrend && !$("landTrend")) {
      const el = document.createElement("span");
      el.id = "landTrend"; el.className = "muted"; el.style.marginLeft = "8px";
      $("landPriceInfo").after(el);
    }
    if ($("landTrend")) $("landTrend").innerHTML = lpTrend;

    $("landUseList").innerHTML = Game.LAND_USES.map(use => {
      const mu = u[use.key] || 0;
      if (use.key === "rent") {
        return `<div class="landuse-row">
          <span class="lu-name">${use.name}</span>
          <b>${mu}</b><em>亩</em>
          <span class="lu-extra muted">招佃分收，6月夏租、11月秋租</span>
        </div>`;
      }
      const crop = Game.cropInfo(use.key);
      const standing = Game.standingMu(g, use.key);
      const free = Game.freeMu(g, use.key);
      const f = (g.fields && g.fields[use.key]) || { lots: [] };
      const termTxt = crop.perennial ? "岁一采，种后经年" : `岁${crop.seasons.length}熟`;
      const seasonTxt = crop.seasons.map(s => `${mrange(s.sow)}播·${mrange(s.harvest)}收`).join("；");
      const lotTxt = f.lots.length
        ? f.lots.map(l => l.bear
            ? `${l.mu}亩成林`
            : `${l.mu}亩${l.hy > g.year ? "来年" : ""}${l.hm}月收`).join("、")
        : "无在田之稼";
      const now = Game.sowSeasonNow(crop, g.month);
      const sowCtl = (now && free > 0)
        ? `<div class="lu-sow">
             <span class="sow-tag">正当播期</span>
             <input type="number" min="1" step="1" placeholder="亩" id="sowIn_${use.key}">
             <button class="btn btn-xs" data-sow="${use.key}">播种（${crop.seed}两/亩）</button>
           </div>`
        : `<div class="lu-sow muted">${now ? "地已种满" : "今月非播期"}</div>`;
      return `<div class="landuse-row landuse-crop">
        <div class="lu-head">
          <span class="lu-name">${use.name}</span>
          <b>${mu}</b><em>亩</em>
          <span class="lu-extra muted">在田${standing} · 空闲${free}</span>
        </div>
        <div class="lu-meta muted">${termTxt}，亩产约${crop.yield}斗 · 平市${crop.price}两/斗</div>
        <div class="lu-meta muted">农时：${seasonTxt}</div>
        <div class="lu-lots">在田：${lotTxt}</div>
        ${mu > 0 ? sowCtl : ""}
      </div>`;
    }).join("");

    const opts = Game.LAND_USES.map(x => `<option value="${x.key}">${x.name}</option>`).join("");
    if ($("allocFrom").options.length !== Game.LAND_USES.length) {
      $("allocFrom").innerHTML = opts;
      $("allocTo").innerHTML = opts;
      $("allocTo").value = "rice";
    }
  }

  /* ---------------- 田庄：粮仓与集市 ---------------- */
  function renderGranaryMarket() {
    const g = Game.G;
    $("granaryList").innerHTML = Game.FOOD_KEYS.map(k => {
      const amount = Math.round(g.granary[k]);
      return `<div class="grain-row">
        <span class="gr-name">${Game.FOOD_NAME[k]}</span>
        <b>${amount}</b><em>斗</em>
        <span class="gr-price muted">市 ${g.market[k]} 两/斗</span>
      </div>`;
    }).join("");

    $("marketList").innerHTML = Game.FOOD_KEYS.map(k => {
      const use = Game.LAND_USES.find(x => x.key === k);
      const tr = trendHtml(g.priceHist && g.priceHist[k], "两/斗");
      return `<div class="market-row">
        <div class="mr-head">
          <b>${Game.FOOD_NAME[k]}粮</b>
          <span class="muted">${use ? use.desc : ""}</span>
          <span class="mr-price">${g.market[k]} 两/斗</span>
        </div>
        ${tr ? `<div class="muted price-trend">${tr}</div>` : ""}
        <div class="mr-deal">
          <input type="number" min="1" step="1" placeholder="斗数" id="foodIn_${k}">
          <button class="btn btn-xs" data-buyfood="${k}">籴入</button>
          <button class="btn btn-xs" data-sellfood="${k}">粜出</button>
        </div>
      </div>`;
    }).join("");
  }

  /* ---------------- 田庄：本月家计 ---------------- */
  function renderHouseholdReport() {
    const g = Game.G;
    const h = g._lastHousehold;
    const rows = [];
    rows.push(["佃租收入", g._lastRent ? "+" + g._lastRent + " 两" : "—"]);
    const yld = Game.FOOD_KEYS.filter(k => g["_yield_" + k]).map(k =>
      `${Game.FOOD_NAME[k]}${g["_yield_" + k]}斗`);
    rows.push(["诸色出产", yld.length ? yld.join("、") : "—"]);
    rows.push(["族人月钱", g._lastSalaries ? "+" + g._lastSalaries + " 两" : "—"]);
    if (g._lastPalaceRemit > 0) rows.push(["宫中寄俸", "+" + g._lastPalaceRemit + " 两"]);
    if (g.steward) rows.push(["庄头工钱", "−" + g.steward.wage + " 两（含宅修应酬）"]);
    if (g._lastBill && g._lastBill.seedCost) rows.push(["种子工本", "−" + g._lastBill.seedCost + " 两"]);
    if (g._lastBill && g._lastBill.doctorCost) rows.push(["延医药费", "−" + g._lastBill.doctorCost + " 两"]);
    if (g._lastBill && g._lastBill.bankDepInt) rows.push(["钱庄利息", "+" + g._lastBill.bankDepInt + " 两"]);
    if (g._lastBill && g._lastBill.bankLoanInt) rows.push(["借贷利息", "−" + g._lastBill.bankLoanInt + " 两"]);
    if (h) {
      rows.push(["口粮采买", h.foodCost ? "−" + h.foodCost + " 两" : "仓粮自给"]);
      rows.push(["门第日用", "−" + h.living + " 两（" + h.tier + "）"]);
      rows.push(["居住", `${h.residents}/${h.cap} 人` + (h.crowded ? " · 拥挤" : "")]);
    }
    if (g._lastTax && g._lastTax.total > 0) {
      rows.push(["赋税徭役", `−${g._lastTax.total}两（田${g._lastTax.landTax}/商${g._lastTax.shopTax}/丁${g._lastTax.poll}）`]);
    }
    if (g._lastUpkeep && g._lastUpkeep.total > 0) {
      const u = g._lastUpkeep;
      const parts = [];
      if (u.keep > 0) parts.push(`修缮${u.keep}`);
      if (u.social > 0) parts.push(`应酬${u.social}`);
      if (u.manorKeep > 0) parts.push(`邸${u.manorKeep}`);
      rows.push(["宅修应酬", "−" + u.total + "两（" + parts.join("、") + "）"]);
    }
    const blessTxt = g.riteBuff
      ? `祖佑：科举+${g.riteBuff.examBonus || 0}（${g.riteBuff.exam}月）·收成×${g.riteBuff.harvestMul || 1.1}（${g.riteBuff.harvest}月）`
      : "列祖未显灵——办场祭祖求庇佑";
    const prayTxt = g.blessing && g.blessing.months > 0
      ? `香火庇佑（${g.blessing.months}月）：稀有天赋×${(Game.PRAY_TIER_MUL || [])[g.blessing.tier] || 1}·天赋+${(Game.PRAY_TIER_APT || [])[g.blessing.tier] || 0}·易孕`
      : "佛门未许愿——去寺庙祈福求贵子";
    const caraTxt = (g.caravans && g.caravans.length)
      ? g.caravans.map(v => `${v.name}${v.left}月归`).join("、")
      : "暂无在途商队";
    $("householdReport").innerHTML =
      '<p class="muted panel-hint">上月度月所结，今月行情看田庄各项。</p>' +
      (g._lastBill ? '<div class="btn-row" style="margin-bottom:6px;"><button class="btn btn-xs" data-bill="1">查看上月账单</button></div>' : "") +
      '<ul class="report-list">' +
      rows.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join("") +
      "</ul>" +
      `<p class="muted panel-hint">${blessTxt}</p>` +
      `<div class="btn-row" style="margin:6px 0;">${(Game.RITES || []).map(r =>
        `<button class="btn btn-xs" data-rite="${r.key}" ${Game.dis(g.money < r.cost, `办${r.name}需${r.cost}两，囊中不足`)}>${r.name} ${r.cost}两</button>`
      ).join("")}</div>` +
      `<p class="muted panel-hint">商队：${caraTxt}</p>` +
      `<div class="btn-row" style="margin:6px 0;">${(Game.CARAVANS || []).map(t =>
        `<button class="btn btn-xs" data-caravan="${t.key}" ${Game.dis(g.money < t.cost, `遣${t.name}需本钱${t.cost}两，囊中不足`) + " " + Game.dis((g.caravans || []).length >= 3, "在途商队已三支，人手尽出，待其归来再遣") + " " + Game.dis((t.needRep || 0) > g.family.reputation, `${t.name}需声望${t.needRep}（海商怕你无力赔付）`)}>遣${t.name} ${t.cost}两</button>`
      ).join("")}</div>` +
      `<p class="muted panel-hint">${prayTxt}</p>` +
      `<div class="btn-row" style="margin:6px 0;">${(Game.PRAYERS || []).map(t =>
        `<button class="btn btn-xs" data-pray="${t.key}" ${Game.dis(g.money < t.cost, `办${t.name}需${t.cost}两，囊中不足`)} title="${t.desc}">${t.name} ${t.cost}两</button>`
      ).join("")}</div>` +
      `<p class="muted panel-hint">祭祖换声望+祖佑，祈福求贵子结奇缘，商队以小博大，皆是花钱的去处；赋税修缮应酬每月照纳，钱再也不会堆着发霉。</p>`;
  }

  /* ---------------- 年度小结（度年收尾） ---------------- */
  Game.showYearSummary = function (start, steps, stopReason) {
    const g = Game.G;
    if (!g) return;
    const dMoney = Math.round((g.money - start.money) * 100) / 100;
    const dRep = g.family.reputation - start.rep;
    const kids = g.children.filter(x => x.alive).length;
    const lines = (g.logs || []).slice(start.logLen).filter(e => e.c !== "month");
    const notable = lines.filter(e => /诞下|诞生|高中|传胪|及第|状元|榜眼|探花|解元|会元|授|晋位|晋为|娶|嫁|招赘|入宫|选秀|逝|夭折|出宫|放出/.test(e.t)).slice(-8);
    openModal(`
      <h3 class="modal-title">年度小结 <span class="muted">第${start.year}年${start.month}月 → 第${g.year}年${g.month}月（凡${steps}月）</span></h3>
      <div class="bill-table">
        <div class="bill-row"><span>银两</span><b>${start.money} 两 → ${Math.round(g.money * 100) / 100} 两（${dMoney >= 0 ? "+" : ""}${dMoney}）</b></div>
        <div class="bill-row"><span>声望</span><b>${start.rep} → ${g.family.reputation}（${dRep >= 0 ? "+" : ""}${dRep}）</b></div>
        <div class="bill-row"><span>在册子嗣</span><b>${start.kids} → ${kids} 人</b></div>
        <div class="bill-row total"><span>仓廪今剩</span><b>${Game.FOOD_KEYS.map(k => `${Game.FOOD_NAME[k]}${Math.round(g.granary[k])}斗`).join("、")}</b></div>
      </div>
      ${notable.length ? `<p class="muted" style="margin:8px 0 4px;">年中大事记</p><ul class="bill-logs">${notable.map(e => `<li class="${e.c || ""}">${e.t}</li>`).join("")}</ul>`
        : `<p class="muted">这一年风平浪静——大事都记在家事编年里，月账单可回看。</p>`}
      ${stopReason === "sick" ? `<p style="color:var(--vermilion-dk)">家主抱病在身，度年在此停下——先去人物详情延医治病，再继续度年。</p>` : ""}
      <p class="muted" style="font-size:12px;">度年逢抉择、抱病、丧事会自动停下，细账见每月账单。</p>
      <div class="modal-choices"><button class="btn btn-primary" data-year-ok="1">知道了</button></div>`);
    $("modalLayer").querySelector("[data-year-ok]").addEventListener("click", () => { closeModal(); if (!Game.flushXibao() && Game.maybeHealthWarn) Game.maybeHealthWarn(); });
  };
  /* ---------------- 月度账单 ---------------- */
  Game.showBill = function () {
    const g = Game.G;
    const b = g && g._lastBill;
    if (!b) { if (Game.afterBill) Game.afterBill(); return; }
    const shopTxt = b.shops.length
      ? b.shops.map(x => `${(Game.SHOP_TYPES[x.type] || {}).name || x.type}${x.profit >= 0 ? "+" : ""}${x.profit}`).join("、")
      : "尚无铺号";
    const yldTxt = ["rice", "wheat", "veg", "fruit"].filter(k => b.yields[k]).map(k => `${Game.FOOD_NAME[k]}${b.yields[k]}斗`).join("、") || "本月无收成";
    const granTxt = ["rice", "wheat", "veg", "fruit"].map(k => `${Game.FOOD_NAME[k]}${Math.round(b.granary[k])}斗`).join("、");
    const logs = (b.monthLogs || []).map(e => `<li class="${e.c || ""}">${e.t}</li>`).join("");
    openModal(`
      <h3 class="modal-title">月度账单 <span class="muted">第${b.year}年${b.month}月</span></h3>
      <p class="muted">${b.weather ? "天时：" + b.weather + "。" : ""}月初银 ${b.moneyBefore} 两 → 月末银 ${b.moneyAfter} 两</p>
      <div class="bill-table">
        <div class="bill-row"><span>佃租</span><b>+${b.rent} 两</b></div>
        <div class="bill-row"><span>族人月钱</span><b>+${b.salaries} 两</b></div>
        <div class="bill-row"><span>铺号盈亏</span><b>${shopTxt}</b></div>
        <div class="bill-row"><span>田间出产</span><b>${yldTxt}</b></div>
      ${b.seedCost ? `<div class="bill-row"><span>种子工本</span><b>−${b.seedCost} 两</b></div>` : ""}
      ${b.doctorCost ? `<div class="bill-row"><span>延医药费</span><b>−${b.doctorCost} 两</b></div>` : ""}
      ${b.bankDepInt ? `<div class="bill-row"><span>钱庄利息</span><b>+${b.bankDepInt} 两</b></div>` : ""}
      ${b.bankLoanInt ? `<div class="bill-row"><span>借贷利息</span><b>−${b.bankLoanInt} 两</b></div>` : ""}
        <div class="bill-row"><span>口粮采买</span><b>−${b.foodCost} 两</b></div>
        <div class="bill-row"><span>门第日用</span><b>−${b.living} 两</b></div>
        <div class="bill-row"><span>赋税徭役</span><b>−${b.tax} 两</b></div>
        <div class="bill-row"><span>宅修应酬</span><b>−${b.upkeep} 两</b></div>
      ${b.stewardWage ? `<div class="bill-row"><span>庄头工钱</span><b>−${b.stewardWage} 两（含上）</b></div>` : ""}
        <div class="bill-row total"><span>仓廪今剩</span><b>${granTxt}</b></div>
      </div>
      ${logs ? `<p class="muted" style="margin:8px 0 4px;">本月际遇回放</p><ul class="bill-logs">${logs}</ul>` : `<p class="muted">本月平安无事，无甚际遇。</p>`}
      ${g.pendingEvent ? `<p class="muted">另有一桩抉择待你定夺……</p>` : ""}
      <div class="modal-choices"><button class="btn btn-primary" data-bill-close="1">知道了${g.pendingEvent ? "，看那桩事" : ""}</button></div>`);
    $("modalLayer").querySelector("[data-bill-close]").addEventListener("click", () => {
      closeModal();
      if (Game._heldEvent) { Game.G.pendingEvent = Game._heldEvent; Game._heldEvent = null; return; }
      if (Game.afterBill) Game.afterBill();
      if (Game.maybeHealthWarn) Game.maybeHealthWarn();
    });
  };
  Game.showBillSilent = function () {
    const g = Game.G;
    if (!g || !g._lastBill) return;
    /* 静默重看：暂扣抉择事件，看完只还原、不触发 */
    Game._heldEvent = g.pendingEvent || null;
    g.pendingEvent = null;
    Game.showBill();
  };

  /* ---------------- 子女说亲三选一 ---------------- */
  Game.showChildCandidates = function () {
    const g = Game.G;
    const cc = g && g.childCandidates;
    if (!cc) return;
    const c = g.children.find(x => x.id === cc.childId);
    if (!c) { g.childCandidates = null; return; }
    const verb = cc.mode === "uxori" ? "招赘（婿入门从家姓）" : (c.gender === "男" ? "娶妻（媳入门同居）" : "出嫁（收彩礼离家）");
    openModal(`
      <h3 class="modal-title">为${c.name}${verb}</h3>
      <p class="muted">三位候选，家世品貌全亮出来，中意便下聘，不中意就“以后再说”，下个月还有。</p>
      ${cc.list.map((p, i) => `
        <div class="tc-card">
          <div class="tc-head"><b>${p.name}</b><span class="muted">${p.gender}·${p.age}岁·门户${p.family}</span></div>
          <p class="muted" style="font-size:13px;">体力${p.stats.体力}　智力${p.stats.智力}　武力${p.stats.武力}　魅力${p.stats.魅力}</p>
          <div class="apt-row">${aptRows(p)}</div>
          <div class="trait-row">${traitChips(p)}</div>
          <p>${cc.mode === "uxori" || c.gender === "男" ? `聘礼 <b style="color:var(--vermilion-dk)">${p._cost}</b> 两` : `彩礼 <b style="color:var(--vermilion-dk)">+${p._gift}</b> 两`}</p>
          <div class="btn-row"><button class="btn btn-xs" data-child-pick="${i}">选TA</button></div>
        </div>`).join("")}
      <div class="modal-choices"><button class="btn" data-child-dismiss="1">以后再说</button></div>`);
    $("modalLayer").querySelector("[data-child-dismiss]").addEventListener("click", () => {
      closeModal();
      Game.dismissChildCandidates();
    });
    $("modalLayer").querySelectorAll("[data-child-pick]").forEach(btn => {
      btn.addEventListener("click", () => {
        closeModal();
        Game.confirmChildCandidate(Number(btn.dataset.childPick));
      });
    });
  };
  /* ---------------- 族亲（离家的人） ---------------- */
  function renderKin() {
    const g = Game.G;
    const host = $("kinArea");
    if (!host) return;
    const clan = (g.family.clan == null ? 50 : g.family.clan);
    let html = `<p class="muted">宗族情分 <b style="font-size:16px;color:${clan >= 90 ? "var(--moss)" : clan < 30 ? "var(--vermilion-dk)" : "inherit"}">${clan}</b>/100　${clan >= 90 ? "· 宗族和睦，年终添声望" : clan < 30 ? "· 离心离德，当心生事" : "· 祭祖、周济族人可加深"}${g.char.office && g.char.office.rel ? "（另有官场士绅百姓清望，在仕学仕途履历中查看）" : ""}</p>`;
    const branches = g.branches || [];
    const outDaus = g.children.filter(x => x.alive && x.out === "married");
    const palace = g.children.filter(x => x.alive && x.out === "palace");
    const canRecall = Game.malesAtHome ? Game.malesAtHome(g) === 0 : false;
    html += "<p class=\"ac-sub\">分家各支（" + branches.length + "支）</p>";
    if (!branches.length) {
      html += '<p class="muted">暂无分家。成年男丁可在其人物详情中“分家另过”（需40两安家银）。</p>';
    } else {
      html += branches.map(br => {
        const mems = g.children.filter(x => x.alive && x.branchId === br.id);
        const names = mems.map(x => `<button class="btn btn-xs" data-member="${x.id}">${x.name}</button><span class="muted" style="font-size:12px;">(${(x.relation || "族人")}·${x.age}岁)</span>`).join(" ") || br.headName;
        const ok = canRecall;
        return `<div class="tc-card"><div class="tc-head"><b>${br.headName}一支</b>`
          + `<span class="muted">第${g.year - br.sinceYear + 1}年分出 · ${mems.length}口</span></div>`
          + `<p class="muted" style="font-size:13px;">${names}</p>`
          + (ok ? `<div class="btn-row"><button class="btn btn-xs" data-recall="${br.id}">迎归宗（家中已无男丁）</button></div>`
            : `<p class="muted" style="font-size:12px;">分家各过各的；家中尚有男丁，不得喊回。</p>`) + "</div>";
      }).join("");
    }
    html += "<p class=\"ac-sub\" style=\"margin-top:10px;\">出阁女（" + outDaus.length + "人）</p>";
    html += outDaus.length
      ? outDaus.map(x => `<div class="tc-card"><div class="tc-head"><b>${x.name}</b><span class="muted">${x.age}岁 · ${(x.bm || 1)}月生 · 配${x.spouseName || "夫家"}</span></div><div class="btn-row"><button class="btn btn-xs" data-member="${x.id}">查看</button></div></div>`).join("")
      : '<p class="muted">暂无。</p>';
    html += "<p class=\"ac-sub\" style=\"margin-top:10px;\">宫中女（" + palace.length + "人）</p>";
    html += palace.length
      ? palace.map(x => `<div class="tc-card"><div class="tc-head"><b>${x.name}</b><span class="muted">${Game.palaceName(x)} · ${x.age}岁 · ${(x.bm || 1)}月生</span></div>`
        + `<p class="muted" style="font-size:12px;">${x.palace.track === "consort" ? "月俸自用；高位者逢年过节有宫中赏赐，体面得很，偶或需家中接济" : "月俸自给；熬出位分方有赏赐荫家"}${Game.topPalace && Game.topPalace(g) === x ? " · 现为家中最大奥援" : ""}</p><div class="btn-row"><button class="btn btn-xs" data-member="${x.id}">查看（可办出宫）</button></div></div>`).join("")
      : '<p class="muted">暂无。女儿入宫不寄家用；高位者有宫中赏赐、荫家开铺，偶或需家中接济。</p>';
    /* 宫中皇嗣：只报喜，不站队 */
    const rk = (g.royalKids || []).filter(x => x.alive);
    if (rk.length) {
      html += "<p class=\"ac-sub\" style=\"margin-top:10px;\">宫中皇嗣（阖宫同庆）</p>";
      html += rk.map(x => `<div class="tc-card"><div class="tc-head"><b>${x.name}</b><span class="muted">${x.gender === "男" ? "皇子" : "公主"} · ${x.age}岁 · ${(x.bm || 1)}月生 · 母${(() => { const m = (g.children || []).find(c => c.id === x.motherId); return m ? m.name : "宫中"; })()}</span></div></div>`).join("");
    }
    host.innerHTML = html;
  }
  Game.askRecall = function (list, onPick) {
    openModal(`
      <h3 class="modal-title">迎请归宗</h3>
      <p class="modal-text">家中已无男丁承祧，分出去的支中尚有男儿。请择一支迎归宗祧（举家同归）：</p>
      <div class="heir-list">
        ${list.map(h => `
          <button class="heir-card" data-recall-pick="${h.id}">
            <span class="heir-info"><b>${h.name}　${h.age}岁</b>
            <p>体${h.stats.体力} · 智${h.stats.智力} · 武${h.stats.武力} · 魅${h.stats.魅力}</p></span>
          </button>`).join("")}
      </div>`);
    $("modalLayer").querySelectorAll("[data-recall-pick]").forEach(btn => {
      btn.addEventListener("click", () => {
        const pick = list.find(x => x.id === btn.dataset.recallPick);
        closeModal();
        onPick(pick || null);
      });
    });
  };
  /* ---------------- 存档导入导出 ---------------- */
  Game.showExport = function () {
    const code = Game.exportSave ? Game.exportSave() : "";
    if (!code) { Game.log("暂无存档可导。", "bad"); return; }
    openModal(`
      <h3 class="modal-title">导出存档</h3>
      <p class="muted">复制下面这串码，换手机/换浏览器后在开始界面“导入存档”里粘贴即可。自己留个备份也行。</p>
      <textarea id="saveCodeBox" rows="5" style="width:100%;font-size:12px;" readonly>${code}</textarea>
      <div class="modal-choices">
        <button class="btn btn-primary" data-copy-save="1">复制存档码</button>
        <button class="btn" data-close="1">关上</button>
      </div>`);
    $("modalLayer").querySelector("[data-close]").addEventListener("click", closeModal);
    $("modalLayer").querySelector("[data-copy-save]").addEventListener("click", () => {
      const box = $("saveCodeBox");
      const done = () => Game.log("存档码已复制，请妥善保存。", "good");
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(box.value).then(done, () => { box.select(); document.execCommand && document.execCommand("copy"); done(); });
      else { box.select(); document.execCommand && document.execCommand("copy"); done(); }
    });
  };
  Game.showImport = function () {
    openModal(`
      <h3 class="modal-title">导入存档</h3>
      <p class="muted">把之前导出的存档码粘贴进来，点确认即可继续旧档（会覆盖当前这台机器上的存档）。</p>
      <textarea id="saveCodeIn" rows="5" style="width:100%;font-size:12px;" placeholder="粘贴存档码"></textarea>
      <p class="muted" id="importErr" style="color:var(--vermilion-dk)"></p>
      <div class="modal-choices">
        <button class="btn btn-primary" data-do-import="1">确认导入</button>
        <button class="btn" data-close="1">算了</button>
      </div>`);
    $("modalLayer").querySelector("[data-close]").addEventListener("click", closeModal);
    $("modalLayer").querySelector("[data-do-import]").addEventListener("click", () => {
      const r = Game.importSave($("saveCodeIn").value);
      if (!r.ok) { $("importErr").textContent = r.msg; return; }
      closeModal();
      start();
    });
  };

  /* ---------------- 说亲选人（一键收拢：列出全家未婚配者） ---------------- */
  Game.pickMatch = function (kind, key, id) {
    const g = Game.G;
    const eligible = (g.children || []).filter(x =>
      x.alive && !x.married && !x.palace && !x.out && !x.betrothed && x.age >= 15);
    if (!eligible.length) { Game.log("家中暂无年满十五的未婚子女。", "bad"); return; }
    openModal(`
      <h3 class="modal-title">为谁说亲</h3>
      <p class="muted">家中未婚配者（15岁以上）都在这里，点一位即与对方说合：</p>
      <div class="heir-list">
        ${eligible.map(x => `
          <button class="heir-card" data-match-pick="${x.id}">
            <span class="heir-info"><b>${x.name}　${x.gender} · ${x.age}岁 · ${(x.bm || 1)}月生</b>
            <p>体${x.stats.体力} · 智${x.stats.智力} · 武${x.stats.武力} · 魅${x.stats.魅力} · 生育${Game.fertilityOf ? Game.fertilityOf(x) : "?"}</p></span>
          </button>`).join("")}
      </div>
      <div class="modal-choices"><button class="btn" data-close="1">算了</button></div>`);
    $("modalLayer").querySelector("[data-close]").addEventListener("click", closeModal);
    $("modalLayer").querySelectorAll("[data-match-pick]").forEach(btn => {
      btn.addEventListener("click", () => {
        const cid = btn.dataset.matchPick;
        closeModal();
        if (kind === "contact") Game.proposeContact(id, cid);
        else if (kind === "clan") Game.proposeClan(key, cid);
      });
    });
  };

  /* ---------------- 弹窗 ---------------- */
  function openModal(innerHtml) {
    const layer = $("modalLayer");
    layer.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${innerHtml}</div>`;
    layer.classList.remove("hidden");
  }
  function closeModal() {
    const layer = $("modalLayer");
    layer.classList.add("hidden");
    layer.innerHTML = "";
  }

  Game.askChoice = function (payload, onResolve) {
    openModal(`
      <h3 class="modal-title">${payload.title}</h3>
      <p class="modal-text">${payload.text}</p>
      <div class="modal-choices">
        ${payload.choices.map((ch, i) => `<button class="btn" data-choice="${i}">${ch.label}</button>`).join("")}
      </div>`);
    $("modalLayer").addEventListener("click", function handler(e) {
      const btn = e.target.closest("[data-choice]");
      if (!btn) return;
      const idx = Number(btn.dataset.choice);
      $("modalLayer").removeEventListener("click", handler);
      closeModal();
      /* 抉择结算报错也不能把 game 锁死：先记一笔，再照常解锁走下去 */
      try {
        payload.choices[idx].act((t, cls) => Game.log(t, cls));
      } catch (err) {
        Game.log("（方才那桩事结算出了点岔子，已跳过，不影响继续过日子）", "bad");
      }
      onResolve();
    });
  };

  /* 立嗣/传位选人：一处入口，列出在堂直系后代（含生育率） */
  Game.pickHeir = function (mode) {
    const g = Game.G;
    const list = Game.directHeirs ? Game.directHeirs(g) : [];
    if (!list.length) { Game.log("膝下暂无在堂直系后代。", "bad"); return; }
    openModal(`
      <h3 class="modal-title">${mode === "abdicate" ? "传位" : "立嗣"}</h3>
      <p class="modal-text">在堂直系后代${list.length}人${mode === "abdicate" ? "（传位须年满十五）" : ""}，点一位${mode === "abdicate" ? "即传位（老家主退居后堂，不可反悔）" : "即立为继承人"}：</p>
      <div class="heir-list">
        ${list.map(x => `
          <button class="heir-card" data-heir-pick="${x.id}" data-heir-mode="${mode}" ${Game.dis(mode === "abdicate" && x.age < 15, `${x.name}年方${x.age}岁，传位须年满十五`)}>
            <span class="heir-info"><b>${x.name}　${x.gender} · ${x.age}岁 · ${(x.bm || 1)}月生${g.heirId === x.id ? "（现嗣）" : ""}${mode === "abdicate" && x.age < 15 ? "（未成年）" : ""}</b>
            <p>体${x.stats.体力} · 智${x.stats.智力} · 武${x.stats.武力} · 魅${x.stats.魅力} · 生育${Game.fertilityOf ? Game.fertilityOf(x) : "?"}${x.infertile ? "（难孕）" : ""}</p></span>
          </button>`).join("")}
      </div>
      <div class="modal-choices"><button class="btn" data-close="1">算了</button></div>`);
    $("modalLayer").querySelector("[data-close]").addEventListener("click", closeModal);
    $("modalLayer").querySelectorAll("[data-heir-pick]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.heirPick, md = btn.dataset.heirMode;
        closeModal();
        if (md === "abdicate") {
          const h = (Game.G.children || []).find(x => x.id === id);
          if (!h) return;
          openModal(`
            <h3 class="modal-title">传位${h.name}？</h3>
            <p class="modal-text">传位之后，你（与配偶）退居后堂颐养天年，不再理家生育，${h.name}即为第${Game.G.gen + (h.parentId ? 2 : 1)}代家主。此事不可反悔。</p>
            <div class="modal-choices"><button class="btn" data-close="1">再想想</button><button class="btn primary" data-abdicate-confirm="${id}">传位</button></div>`);
          $("modalLayer").querySelector("[data-close]").addEventListener("click", closeModal);
          $("modalLayer").querySelector("[data-abdicate-confirm]").addEventListener("click", (e) => { closeModal(); Game.abdicateTo(e.target.dataset.abdicateConfirm); });
        } else Game.setHeir(id);
      });
    });
  };
  Game.renderHeirRow = function () {
    const g = Game.G;
    const host = document.getElementById("heirRow");
    if (!host) return;
    const h = Game.heirPerson ? Game.heirPerson(g) : null;
    const n = Game.directHeirs ? Game.directHeirs(g).length : 0;
    host.innerHTML = h
      ? `<span class="muted">嗣位：<b>${h.name}</b>（${h.gender}·${h.age}岁）· 在堂直系${n}人</span>
         <button class="btn btn-xs" data-open-heir-pick="set">改立</button>
         <button class="btn btn-xs" data-clear-heir="1">撤嗣</button>
         ${h.age >= 15 ? `<button class="btn btn-xs" data-open-heir-pick="abdicate">传位给他</button>` : ""}`
      : `<span class="muted">嗣位：未立 · 在堂直系${n}人（百年之后按嫡长男嗣孙序议继；立嗣则遵遗命直继）</span>
         ${n ? `<button class="btn btn-xs" data-open-heir-pick="set">立嗣</button>
         <button class="btn btn-xs" data-open-heir-pick="abdicate">提前传位</button>` : ""}`;
  };
  /* 喜报：科举大魁的红色弹窗；赶考季多人同中则排队逐张报 */
  Game.queueXibao = function (item) {
    const g = Game.G;
    g.pendingXibao = g.pendingXibao || [];
    g.pendingXibao.push(item);
    if (item.showNow) {
      try { Game.flushXibao(); } catch (e) {}
      Game.save(); Game.refresh();
    } else Game.save();
  };
  Game.flushXibao = function () {
    const g = Game.G;
    const q = g.pendingXibao || [];
    if (!q.length) return false;
    const it = q.shift();
    Game.save();
    Game.showXibao(it, q.length);
    return true;
  };
  Game.showXibao = function (it, rest) {
    const big = it.rank === "状元" || it.rank === "榜眼" || it.rank === "探花";
    const first = it.rank === "解元" || it.rank === "会元" || it.rank === "传胪";
    const seal = big ? "魁" : "喜";
    const title = big ? `大魁天下·${it.rank}及第` : `${it.exam}捷报·高中${it.rank}`;
    openModal(`
      <div class="xibao">
        <div class="xibao-seal">${seal}</div>
        <h3 class="xibao-title">${title}</h3>
        <p class="xibao-text">捷报！贵府${it.rel || ""}${it.who}于${it.exam}高中${it.rank}${it.detail ? "——" + it.detail : "，十年寒窗，一朝登科"}！</p>
        <p class="xibao-text">报子连报三声，披红挂彩，爆竹声里整条街都出来看热闹。${it.gift ? `亲友贺仪银${it.gift}两，门前车马盈门。` : ""}</p>
        ${(big || first) ? `<p class="xibao-text">县令亲登门送匾道贺，族谱可添光彩一页。</p>` : ""}
        <div class="modal-choices"><button class="btn primary" data-xibao-ok="1">${rest ? `知道了（还有${rest}张喜报）` : "知道了"}</button></div>
      </div>`);
    $("modalLayer").querySelector("[data-xibao-ok]").addEventListener("click", () => {
      closeModal();
      if (!Game.flushXibao()) { Game.save(); Game.refresh(); }
    });
  };
  /* 玩法说明：一本钉在游戏里的说明书，专治“我觉得这是bug” */
  Game.showHelp = function () {
    openModal(`
      <div class="help">
        <h3 class="modal-title">📖 百年宗谱·玩法说明</h3>
        <p class="muted" style="text-align:center">版本 <b id="helpVer"></b>（对不上这个号就是没更新到最新包）</p>
        <p class="muted" style="text-align:center">把一个布衣之家带成名门世家，就是你的毕生功业。</p>
        <div class="help-sec"><b>⏳ 时间与精力</b><p>点“度月”推进一步（家事、收成、考课都在这里结算）；“度年”连走十二个月，逢抉择丧事自动停下。每月精力2点，读书交际办事都要花，精尽则待下月。行动区可设“自动”：复刻上月或把精力全投某一项，再点“度月/度年”一键快进，逢事即停。</p></div>
        <div class="help-sec"><b>📚 科举做官</b><p>仕学页应考：童试（随时）→乡试（八月，举人；第一为解元）→会试（贡士；第一为会元）→殿试（三月，状元/榜眼/探花/传胪/进士）。考中授官，政绩攒够岁考升迁。抱病-8分，先延医再下场。</p></div>
        <div class="help-sec"><b>👪 成家与传代</b><p>人际页结识名帖，好感80可提亲/说亲。儿女十五议亲，女儿可出阁可招赘可送宫。受孕看夫妻生育率，难产可能伤身。家宅可立嗣、提前传位；家主百年按嗣位/嫡长继位。</p></div>
        <div class="help-sec"><b>🌟 天赋与词条</b><p>每人体、智、武、魅各有一项“天赋值”（1~100），即学习倍率：人物详情里“资80 ×0.80”就是它，天赋越高读书习武涨得越快。高门子弟、寺庙祈福所生、奇人来投，天赋都更高。</p><p>“词条”是与生俱来的禀赋，如勤劳、过目成诵、力能扛鼎、天赋异禀、潘安再世（也有鲁钝、体弱多病等短板）。越稀有的越难出生，稳婆敲锣报喜的都是稀罕货；父母的词条会遗传给子女，同类只留最强的一项。说亲时多看看对方词条，娶得好不如生得好。</p></div>
        <div class="help-sec"><b>💰 钱从哪来</b><p>田庄置产收租种粮；商事开铺（铺数看阖族功名官身），口碑越高越赚，一键升级/雇伙计；钱庄存借；做官吃俸。每月自动扣口粮、赋税、修缮。</p></div>
        <div class="help-sec"><b>🤝 人际与高门</b><p>人脉每月-1，多走动。五大高门另有阖族好感（每月-2，更难维持）：85可联姻，90且有官身可求举荐（直升一级，一年一次）。女儿嫁入某家，她在世则该家好感不减。</p></div>
        <div class="help-sec"><b>🏯 宫廷线</b><p>女儿可入宫为宫女/选秀为妃（妃嫔得宠会诞育皇子，皇嗣降生只报喜、阖宫同庆）。宫女不寄家用；高位妃嫔逢年过节有宫中赏赐，体面得很。</p></div>
        <div class="help-sec"><b>🎂 生辰与寿宴</b><p>人人有生月，逢生月满一岁。寿宴须在生辰月办（人物详情里会提示），一年一次，整寿声望1.5倍。</p></div>
        <div class="help-sec"><b>💾 存档</b><p>换手机/浏览器前，先去“全家在册”导出存档（复制那串字），到新处再导入。存档只保存在本机，清缓存会丢。</p></div>
        <div class="help-sec warn"><b>❗ 常见误会（多半不是bug）</b><p>① 灰按钮点一下，会浮条告诉你差在哪（缺银/缺声望/月份不对等）；② 考不上先看月份、功名、体力；③ 买不了地多半是银子不够；④ 年龄按生月长，不过年就长一岁属正常；⑤ 寿宴只能生辰月办；⑥ 儿子中举后会自动继续考、做官会自动升迁；⑦ 举荐/喜报一年一次，错过等明年；⑧ 宫女不寄钱是设定，不是bug；⑨ 抱病或体力见底会弹窗提醒，按弹窗去延医或休养，别硬撑。</p></div>
        <div class="modal-choices"><button class="btn primary" data-help-ok="1">知道了，开宗立派去</button></div>
      </div>`);
    $("modalLayer").querySelector("[data-help-ok]").addEventListener("click", closeModal);
    const hv = $("helpVer"); if (hv) hv.textContent = Game.VERSION || "";
  };
  /* 病危提醒弹窗：抱病/体虚/垂危三档，附带直请医生与休养 */
  Game.showHealthWarn = function (kind) {
    const g = Game.G, c = g.char;
    const ti = c.stats.体力 || 0;
    const title = kind === "crit" ? "⚠️ 体力垂危" : kind === "sick" ? "🤒 抱病在身" : "🥀 体力透支";
    const text = kind === "crit"
      ? `${c.name}体力仅剩${ti}，油尽灯枯之兆，再操劳恐有性命之忧！`
      : kind === "sick"
      ? `${c.name}已抱病在身（体力${ti}）。抱病应考-8分、久病减半饷，拖延恐病死，宜速延医。`
      : `${c.name}体力仅剩${ti}（15以下为虚）。趁早休养回体力，莫等油尽灯枯。`;
    const docBtns = (kind !== "low") ? `<div class="btn-row">${(Game.DOCTORS || []).map(d => {
      const locked = (d.needRep || 0) > g.family.reputation;
      return `<button class="btn btn-xs" data-hw-doctor="${d.key}" ${locked || g.money < d.fee ? "disabled" : ""}>请${d.name}（${d.fee}两·愈${Math.round(d.cure * 100)}%）</button>`;
    }).join("")}</div>
    <p class="muted" style="font-size:12px;">${(Game.DOCTORS || []).some(d => (d.needRep || 0) > g.family.reputation) ? "圣手非望族不请（需声望120）。" : ""}也可在人物详情里延医，或定“自动延医”每月入夜看诊。</p>` : "";
    openModal(`
      <div class="xibao xibao-warn">
        <div class="xibao-seal">疾</div>
        <h3 class="xibao-title">${title}</h3>
        <p class="xibao-text">${text}</p>
        ${docBtns}
        <div class="modal-choices">
          ${kind !== "sick" ? `<button class="btn" data-hw-rest="1">休养一月（行动·回体力）</button>` : ""}
          <button class="btn primary" data-hw-ok="1">知道了</button>
        </div>
      </div>`);
    const layer = $("modalLayer");
    layer.querySelector("[data-hw-ok]").addEventListener("click", closeModal);
    const rest = layer.querySelector("[data-hw-rest]");
    if (rest) rest.addEventListener("click", () => { closeModal(); Game.doAction("rest"); });
    layer.querySelectorAll("[data-hw-doctor]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.hasAttribute("disabled")) return;
        closeModal(); Game.seeDoctor("head", btn.dataset.hwDoctor);
      });
    });
  };
  Game.maybeHealthWarn = function () {
    const g = Game.G;
    if (!g || !g._healthWarn || g.pendingEvent || g.locked || !g.char.alive || g.over) return false;
    if ($("modalLayer") && !$("modalLayer").classList.contains("hidden")) return false;
    const w = g._healthWarn; g._healthWarn = null;
    Game.showHealthWarn(w);
    return true;
  };
  Game.askSuccession = function (heirs, onPick) {
    openModal(`
      <h3 class="modal-title">灵前继嗣</h3>
      <p class="modal-text">家主新丧，举哀已毕，须立子嗣承继宗祧、掌管家业。依礼当传男嗣、立长房，然遗命在你。</p>
      <div class="heir-list">
        ${heirs.map((h, i) => `
          <button class="heir-card ${i === 0 ? "primary" : ""}" data-heir="${h.id}">
            <span class="heir-sealmark">${h.gender === "男" ? "継" : "女"}</span>
            <span class="heir-info">
              <b>${h.name}　${h.gender} · ${h.age}岁${i === 0 ? "　（嫡长）" : ""}</b>
              <p>体${h.stats.体力} · 智${h.stats.智力} · 武${h.stats.武力} · 魅${h.stats.魅力}</p>
            </span>
          </button>`).join("")}
      </div>`);
    $("modalLayer").addEventListener("click", function handler(e) {
      const btn = e.target.closest("[data-heir]");
      if (!btn) return;
      const heir = heirs.find(h => h.id === btn.dataset.heir);
      $("modalLayer").removeEventListener("click", handler);
      closeModal();
      onPick(heir);
    });
  };

  Game.showGameOver = function (s) {
    const best = Game.getBest();
    openModal(`
      <div class="ending-seal">终</div>
      <h3 class="modal-title">${s.surname}氏・卷终</h3>
      <p class="modal-text" style="text-align:center;text-indent:0;">
        ${s.noHeir ? "身后无嗣，田产归并族人，门庭渐就荒落。" : `绵延 ${s.gen} 代、${s.years} 年，终成「${s.rank}」。`}
      </p>
      <div class="ending-stats">
        <div><span>传世代数</span><b>${s.gen} 代</b></div>
        <div><span>历经岁年</span><b>${s.years} 年</b></div>
        <div><span>鼎盛声望</span><b>${s.peakRep}</b></div>
        <div><span>最高官身</span><b>${s.bestPost || "白丁"}</b></div>
        <div><span>最终门第</span><b>${s.rank}</b></div>
        <div><span>历代最佳</span><b>${best && best.gen ? best.gen + "代 / " + best.rank : "—"}</b></div>
      </div>
      <button class="btn btn-primary modal-close" data-restart="1">另立新卷</button>`);
    $("modalLayer").querySelector("[data-restart]").addEventListener("click", () => {
      closeModal();
      backToStart();
    });
  };

  function showTree() {
    const g = Game.G;
    const hist = (g.history && g.history.length ? g.history : (g.family.history || []));
    const rows = hist.map(h => `
      <div class="tree-row">
        <span class="tree-gen">${h.gen}世</span>
        <div><b>${h.name}</b> <span class="tree-meta">${h.gender || ""} · 享年${h.age}岁${h.spouse ? " · 配" + h.spouse : ""}${h.kids ? " · 子嗣" + h.kids + "人" : ""}</span>
          <p class="tree-meta">${h.post || ""}${h.title ? "（" + (titleName(h.title) || h.title) + "）" : ""}　执掌至第${h.years}年${h.cause ? " · " + h.cause : ""}</p></div>
      </div>`).join("");
    const c = g.char;
    const kids = (g.children || []).filter(x => x.alive);
    const kidsTxt = kids.length
      ? kids.map(k => `${k.name}(${k.gender}·${k.age}岁${k.palace ? "·宫中" + Game.palaceName(k) : k.married ? (k.out === "married" ? "·已出阁" : k.spouse && k.spouse.joined ? "·已婚同居" : "·已婚") : ""}${k.title ? "·" + (titleName(k.title) || k.title) : ""}${k.office ? "·" + officeText(k.office) : ""})`).join("、")
      : "尚无子嗣，加油添丁";
    const spouseTxt = g.spouse ? `配 ${g.spouse.name}（${g.spouse.age}岁，好感${g.spouse.favor == null ? 65 : g.spouse.favor}）` : "尚未婚配";
    openModal(`
      <h3 class="modal-title">${g.surname}氏宗谱</h3>
      <p class="muted">传至第${g.gen}代 · 历代家主${hist.length}位 · 鼎盛声望${g.family.peakReputation}</p>
      <div class="tree-list">
        ${rows || '<p class="muted">开宗第一代，功业待书。家主百年之后，此处会记下每一代名讳、官职、配偶与子嗣。</p>'}
        <div class="tree-row current">
          <span class="tree-gen">${g.gen}世</span>
          <div><b>${c.name}</b> <span class="tree-meta">${c.gender} · ${c.age}岁（在任家主）</span>
            <p class="tree-meta">${c.office ? "出仕之中" : c.title ? titleName(c.title) : "白身布衣"} · ${spouseTxt}</p>
            <p class="tree-meta">在册子嗣：${kidsTxt}</p></div>
        </div>
      </div>
      <button class="btn modal-close" data-close="1">合谱</button>`);
    $("modalLayer").querySelector("[data-close]").addEventListener("click", closeModal);
  }

  /* ---------------- 页签切换 ---------------- */
  function switchTab(name) {
    document.querySelectorAll(".tab-btn").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".tab-pane").forEach(p =>
      p.classList.toggle("active", p.dataset.pane === name));
    try { localStorage.setItem(TAB_KEY, name); } catch (e) {}
  }
  $("tabNav").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (btn) switchTab(btn.dataset.tab);
  });

  /* ---------------- 开局 / 重开 ---------------- */
  function start() {
    $("startScreen").classList.add("hidden");
    $("gameScreen").classList.remove("hidden");
    let saved = "home";
    try { saved = localStorage.getItem(TAB_KEY) || "home"; } catch (e) {}
    switchTab(saved);
    renderLogs();
    Game.refresh();
  }
  function backToStart() {
    $("gameScreen").classList.add("hidden");
    $("startScreen").classList.remove("hidden");
    renderBest();
    $("continueBtn").classList.toggle("hidden", !Game.hasSave());
  }
  function renderBest() {
    const has = Game.hasSave();

    const b = Game.getBest();
    $("bestRecord").textContent = b
      ? `旧卷留痕：${b.surname}氏传 ${b.gen} 代，${b.rank}${b.bestPost ? "，官至" + b.bestPost : ""}`
      : "";
  }

  /* ---------------- 事件绑定 ---------------- */
  document.addEventListener("click", (e) => {
    if (!Game.G) return;
    const t = e.target;
    /* 灰按钮拦截：先报原因，不再往下走 */
    const why = t.closest ? t.closest("[data-why]") : null;
    if (why) { if (Game.toast) Game.toast(why.dataset.why); return; }

    const act = t.closest("[data-act]");
    if (act) return Game.doAction(act.dataset.act);
    const ar = t.closest("[data-auto-repeat]");
    if (ar) { const au = Game.G.auto; return Game.setAuto(au && au.mode === "repeat" ? null : "repeat"); }
    const af = t.closest("[data-auto-focus]");
    if (af) { const k = af.dataset.autoFocus; const au = Game.G.auto; return Game.setAuto(au && au.mode === "focus" && au.key === k ? null : "focus", k); }

    const member = t.closest("[data-member]");
    if (member) return showMember(member.dataset.member);
    const gcs = t.closest("[data-genchar-save]");
    if (gcs) {
      const inp = document.getElementById("genCharEdit");
      Game.setGenChar(inp ? inp.value : "");
      if (inp) inp.value = "";
      return;
    }
    const gcr = t.closest("[data-genchar-random]");
    if (gcr) {
      const c = Game.GEN_CHARS ? Game.U.pick(Game.GEN_CHARS) : "承";
      Game.setGenChar(c);
      return;
    }
    const cp = t.closest("[data-child-pick]");
    if (cp) return;   /* 候选弹窗内自带监听 */
    const cd = t.closest("[data-child-dismiss]");
    if (cd) return;
    const dc = t.closest("[data-divorce-child]");
    if (dc) { const id = dc.dataset.divorceChild; closeModal(); Game.divorceChild(id); return; }
    const bt = t.closest("[data-betroth-ct]");
    if (bt) return Game.proposeBetrothal(bt.dataset.betrothCt, bt.dataset.child);
    const bo = t.closest("[data-branch-out]");
    if (bo) { const id = bo.dataset.branchOut; closeModal(); if (confirm("分家另过：携妻儿单过，各吃各锅（安家银40两）。家中无男丁前不得喊回，确定吗？")) Game.branchOut(id); return; }
    const rc = t.closest("[data-recall]");
    if (rc) return Game.recallBranch(rc.dataset.recall);
    const mc = t.closest("[data-marry-child]");
    if (mc) { const id = mc.dataset.marryChild; closeModal(); Game.marryChild(id); return; }
    const sh = t.closest("[data-set-heir]");
    if (sh) { closeModal(); Game.setHeir(sh.dataset.setHeir); return; }
    const chh = t.closest("[data-clear-heir]");
    if (chh) { closeModal(); Game.clearHeir(); return; }
    const ab = t.closest("[data-abdicate]");
    if (ab) { const id = ab.dataset.abdicate; closeModal(); Game.pickHeir ? Game.pickHeir("abdicate") : Game.abdicateTo(id); return; }
    const ohp = t.closest("[data-open-heir-pick]");
    if (ohp) return Game.pickHeir(ohp.dataset.openHeirPick);
    const ux = t.closest("[data-uxori-child]");
    if (ux) { const id = ux.dataset.uxoriChild; closeModal(); Game.marryChildUxori(id); return; }
    const ps = t.closest("[data-palace-send]");
    if (ps) { const id = ps.dataset.palaceSend; closeModal(); Game.sendToPalace(id); return; }
    const pd = t.closest("[data-palace-draft]");
    if (pd) { const id = pd.dataset.palaceDraft; closeModal(); Game.palaceDraft(id); return; }
    const pl = t.closest("[data-palace-leave]");
    if (pl) { const id = pl.dataset.palaceLeave; closeModal(); Game.palaceLeave(id); return; }
    const ad = t.closest("[data-autodoctor]");
    if (ad) return Game.setAutoDoctor(ad.dataset.autodoctor);
    const bk = t.closest("[data-bank]");
    if (bk) {
      const v = ($("bankAmt") && $("bankAmt").value) || 0;
      const k = bk.dataset.bank;
      if (k === "deposit") return Game.bankDeposit(v);
      if (k === "withdraw") return Game.bankWithdraw(v);
      if (k === "borrow") return Game.bankBorrow(v);
      if (k === "repay") return Game.bankRepay(v);
      return;
    }
    if (t.closest("[data-upgrade-all]")) return Game.upgradeAllShops();
    if (t.closest("[data-hire-all]")) return Game.hireAllClerks();
    const hc = t.closest("[data-hire-clerk]");
    if (hc) return Game.hireClerk(hc.dataset.hireClerk);
    const dc2 = t.closest("[data-dismiss-clerk]");
    if (dc2) return Game.dismissClerk(dc2.dataset.dismissClerk);
    const us = t.closest("[data-upgrade-shop]");
    if (us) return Game.upgradeShop(us.dataset.upgradeShop);
    const gpu = t.closest("[data-genpoem-use]");
    if (gpu) return Game.useGenPoem(gpu.dataset.genpoemUse);
    const gps = t.closest("[data-genpoem-set]");
    if (gps) { const inp = document.getElementById("genPoemEdit"); const r = Game.setGenPoem(inp ? inp.value : ""); return r; }
    if (t.closest("[data-genpoem-clear]")) return Game.setGenPoem("");
    const hire = t.closest("[data-hire-steward]");
    if (hire) return Game.hireSteward(hire.dataset.hireSteward);
    if (t.closest("[data-dismiss-steward]")) return Game.dismissSteward();
    const reroll = t.closest("[data-reroll-name]");
    if (reroll) {
      Game.randomizePersonName(reroll.dataset.rerollName);
      showMember(reroll.dataset.rerollName);
      return;
    }
    const rnm = t.closest("[data-rename-confirm]");
    if (rnm) {
      const inp = document.getElementById("renameInput");
      Game.renamePerson(rnm.dataset.renameConfirm, inp ? inp.value : "");
      showMember(rnm.dataset.renameConfirm);
      return;
    }
    const cf = t.closest("[data-cfilter]");
    if (cf) {
      contactsFilter = cf.dataset.cfilter;
      try { localStorage.setItem(CF_KEY, contactsFilter); } catch (e) {}
      Game.refresh(); return;
    }
    const cs = t.closest("[data-csort]");
    if (cs) {
      contactsSort = cs.dataset.csort;
      try { localStorage.setItem(CS_KEY, contactsSort); } catch (e) {}
      Game.refresh(); return;
    }
    if (t.closest("[data-buildroom]")) return Game.buildRoom();
    const manorBtn = t.closest("[data-manor]");
    if (manorBtn) return Game.upgradeManor(manorBtn.dataset.manor);
    const open = t.closest("[data-open]");
    if (open) return Game.openShop(open.dataset.open);
    const disc = t.closest("[data-discount]");
    if (disc) return Game.toggleDiscount(disc.dataset.discount);
    const sellshop = t.closest("[data-sellshop]");
    if (sellshop) return Game.sellShop(sellshop.dataset.sellshop);
    const buyfood = t.closest("[data-buyfood]");
    if (buyfood) return Game.buyFood(buyfood.dataset.buyfood, $("foodIn_" + buyfood.dataset.buyfood).value);
    const sellfood = t.closest("[data-sellfood]");
    if (sellfood) return Game.sellFood(sellfood.dataset.sellfood, $("foodIn_" + sellfood.dataset.sellfood).value);
    const sow = t.closest("[data-sow]");
    if (sow) return Game.sowLand(sow.dataset.sow, $("sowIn_" + sow.dataset.sow).value);
    const mm = t.closest("[data-mm]");
    if (mm) return Game.matchmake(Number(mm.dataset.mm));
    const pp = t.closest("[data-propose]");
    if (pp) return Game.proposal(pp.dataset.propose);
    if (t.closest("[data-reject]")) return Game.rejectCandidate();
    const exam = t.closest("[data-exam]");
    if (exam) return Game.takeExam(exam.dataset.exam);
    if (t.closest("[data-retire]")) return Game.retire();
    if (t.closest("[data-dismiss-t]")) return Game.dismissTeacher();
    if (t.closest("[data-close-tc]")) return Game.closeTeacherCandidates();
    const hireT = t.closest("[data-hire-t]");
    if (hireT) return Game.hireTeacher(hireT.dataset.hireT);
    const visit = t.closest("[data-visit]");
    if (visit) return Game.visitTeachers(visit.dataset.visit);
    const teach = t.closest("[data-teach]");
    if (teach) return Game.hireFamilyTeacher(teach.dataset.teach);
    const rite = t.closest("[data-rite]");
    if (rite) return Game.holdRite(rite.dataset.rite);
    const pr = t.closest("[data-pray]");
    if (pr) return Game.pray(pr.dataset.pray);
    const cara = t.closest("[data-caravan]");
    if (cara) return Game.sendCaravan(cara.dataset.caravan);
    const don = t.closest("[data-donate]");
    if (don) return Game.donate(don.dataset.donate);
    const tour = t.closest("[data-tour-child]");
    if (tour) return Game.studyTour(tour.dataset.tourChild, tour.dataset.tourKind);
    const bir = t.closest("[data-birth-member]");
    if (bir) {
      const layer = document.getElementById("modalLayer");
      if (layer) { layer.classList.add("hidden"); layer.innerHTML = ""; }
      return Game.holdBirthday(bir.dataset.birthMember, bir.dataset.birthKind);
    }
    const doc = t.closest("[data-doctor-member]");
    if (doc) {
      // 关掉人物弹窗再治，治完刷新名册
      const layer = document.getElementById("modalLayer");
      if (layer) { layer.classList.add("hidden"); layer.innerHTML = ""; }
      return Game.seeDoctor(doc.dataset.doctorMember, doc.dataset.doctorKind);
    }
    const vc = t.closest("[data-visit-clan]");
    if (vc) return Game.visitClan(vc.dataset.visitClan);
    const gc = t.closest("[data-gift-clan]");
    if (gc) return Game.giftClan(gc.dataset.giftClan);
    const mcl = t.closest("[data-match-clan]");
    if (mcl) return Game.pickMatch("clan", mcl.dataset.matchClan, null);
    const pc = t.closest("[data-propose-clan]");
    if (pc) return Game.proposeClan(pc.dataset.proposeClan, pc.dataset.child);
    const rcc = t.closest("[data-recommend-clan]");
    if (rcc) return Game.recommendClan(rcc.dataset.recommendClan);
    const vct = t.closest("[data-visit-ct]");
    if (vct) return Game.visitContact(vct.dataset.visitCt);
    const gct = t.closest("[data-gift-ct]");
    if (gct) return Game.giftContact(gct.dataset.giftCt, gct.dataset.level);
    const mct = t.closest("[data-match-contact]");
    if (mct) return Game.pickMatch("contact", null, mct.dataset.matchContact);
    const pct = t.closest("[data-propose-ct]");
    if (pct) return Game.proposeContact(pct.dataset.proposeCt, pct.dataset.child);
    const dct = t.closest("[data-dismiss-ct]");
    if (dct) return Game.dismissContact(dct.dataset.dismissCt);
    if (t.closest("[data-bill]")) return Game.showBillSilent();
    if (t.closest("[data-spouse-care]")) return Game.spouseCare();
    const sg = t.closest("[data-spouse-gift]");
    if (sg) return Game.spouseGift(sg.dataset.spouseGift);
    if (t.closest("[data-divorce]")) {
      if (confirm(`与${Game.G.spouse.name}和离？将付一笔安家银，声望-8，之后可再议亲。`)) return Game.divorce();
      return;
    }
  });

  $("nextBtn").addEventListener("click", () => Game.nextMonth());
  if ($("nextYearBtn")) $("nextYearBtn").addEventListener("click", () => Game.nextYear());
  $("treeBtn").addEventListener("click", showTree);

  $("landBuyBtn").addEventListener("click", () => Game.buyLand($("landAmount").value));
  $("landSellBtn").addEventListener("click", () => Game.sellLand($("landAmount").value));
  $("landAmount").addEventListener("keydown", (e) => {
    if (e.key === "Enter") Game.buyLand(e.target.value);
  });
  $("autoLandBtn").addEventListener("click", () => {
    const v = $("autoLandInput").value;
    Game.setAutoLand(v === "" ? 0 : v);
  });
  $("allocBtn").addEventListener("click", () => {
    Game.reallocLand($("allocFrom").value, $("allocTo").value, $("allocN").value);
    $("allocN").value = "";
  });

  $("randomBtn").addEventListener("click", () => {
    $("surnameInput").value = Game.U.pick(Game.SURNAMES);
    const gd = $("genderSelect").value;
    if ($("givenInput")) $("givenInput").value = Game.randomGiven ? Game.randomGiven(gd) : "";
    if ($("genCharInput")) $("genCharInput").value = Game.GEN_CHARS ? Game.U.pick(Game.GEN_CHARS) : "";
  });
  const _rerollGiven = () => {
    if ($("givenInput") && !$("givenInput").value.trim())
      $("givenInput").value = Game.randomGiven ? Game.randomGiven($("genderSelect").value) : "";
  };
  $("genderSelect").addEventListener("change", _rerollGiven);
  $("startBtn").addEventListener("click", () => {
    let surname = $("surnameInput").value.trim();
    if (!surname) surname = Game.U.pick(Game.SURNAMES);
    surname = surname[0];
    const gender = $("genderSelect").value;
    let given = ($("givenInput") ? $("givenInput").value.trim() : "").replace(/\s+/g, "").slice(0, 3);
    if (!given) given = Game.randomGiven ? Game.randomGiven(gender) : "";
    let genChar = ($("genCharInput") ? $("genCharInput").value.trim() : "").slice(0, 1);
    if (!genChar) genChar = Game.GEN_CHARS ? Game.GEN_CHARS[Math.floor(Math.random() * Game.GEN_CHARS.length)] : "承";
    Game.newGame(surname, gender, given, genChar);
    start();
  });
  $("exportBtn").addEventListener("click", () => { if (!Game.hasSave()) { Game.toast("尚无存档可导，先开一局"); return; } Game.showExport(); });
  $("importBtn").addEventListener("click", () => Game.showImport());
  const ex2 = $("exportBtn2"); if (ex2) ex2.addEventListener("click", () => { if (!Game.hasSave()) { Game.toast("尚无存档可导，先开一局"); return; } Game.showExport(); });
  const im2 = $("importBtn2"); if (im2) im2.addEventListener("click", () => Game.showImport());
  $("continueBtn").addEventListener("click", () => {
    if (Game.load()) start();
  });
  const hb = $("helpBtn"); if (hb) hb.addEventListener("click", () => Game.showHelp());

  /* ---------------- 启动 ---------------- */
  renderBest();
  $("continueBtn").classList.toggle("hidden", !Game.hasSave());
})();
