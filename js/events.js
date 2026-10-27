/* ============================================================
 * 百年宗谱 · 随机事件库
 * auto: run(g, ctx, log) 直接结算
 * choice: build(g) 返回 { title, text, choices:[{label, act}] }
 * ctx: {} 月度结算上下文（天时丰歉由 engine 调 rollWeather 处理）
 * ============================================================ */
(function () {
 "use strict";
 const Game = window.Game;
 const { rand, clamp, pick, chance } = Game.U;
 const rep = (n) => {
 const fam = Game.G.family;
 fam.reputation = Math.max(0, fam.reputation + n);
 fam.peakReputation = Math.max(fam.peakReputation, fam.reputation);
 };
 const money = (n) => { Game.G.money = Math.max(0, Game.G.money + n); return Game.G.money; };

 const youngChild = () => Game.G.children.find(c => c.alive && c.age < 8);
 const schoolChild = () => Game.G.children.find(c => c.alive && c.age >= 3 && c.age <= 14);

 Game.EVENTS = [
 /* 天时丰歉由 engine.nextMonth 调 Game.rollWeather 统一结算 */

 /* ---------- 人祸 ---------- */
 { id: "war", type: "auto", w: 4,
 run: (g, ctx, log) => {
 const lost = Math.min(g.land, rand(1, 3));
 g.land -= lost;
 const silver = Math.round(g.money * 0.12);
 g.money -= silver;
 rep(-5);
 log(`乱兵过境，掳掠村坊：失田${lost}亩、银${silver}两，乡里侧目。`, "bad");
 } },
 { id: "bandit", type: "auto", w: 6,
 run: (g, ctx, log) => { const s = rand(5, Math.max(8, Math.round(g.money * 0.15))); g.money -= s; log(`山匪夜袭庄园，仓促间失银${s}两。`, "bad"); } },
 { id: "fire", type: "auto", w: 5,
 run: (g, ctx, log) => { const s = rand(5, Math.max(10, Math.round(g.money * 0.12))); g.money -= s; log(`夜半柴房走水，扑救及半，折银${s}两。`, "bad"); } },
 { id: "servant", type: "auto", w: 5,
 run: (g, ctx, log) => { const s = Math.min(g.money, rand(2, 8)); g.money -= s; log(`家仆卷物潜逃，查点失银${s}两。`, "bad"); } },

 /* ---------- 机遇 ---------- */
 { id: "kinship", type: "auto", w: 6,
 run: (g, ctx, log) => { const s = rand(10, 35); money(s); log(`远房族亲经商归来，不忘旧恩，赠银${s}两。`, "good"); } },
 { id: "oldcache", type: "auto", w: 3, cond: g => g.land >= 8,
 run: (g, ctx, log) => { const s = rand(15, 40); money(s); log(`修缮祖宅，于夹墙中得先人窖藏银${s}两。`, "good"); } },
 { id: "teacher", type: "auto", w: 6,
 run: (g, ctx, log) => { const n = Game.gainStat(g.char, "智力", rand(4, 8)); log(`致仕大儒客居乡里，承蒙指点经义，智力+${n}。`, "good"); } },
 { id: "knight", type: "auto", w: 5,
 run: (g, ctx, log) => { const n = Game.gainStat(g.char, "武力", rand(4, 8)); log(`云游豪客借宿庄上，夜授技击之术，武力+${n}。`, "good"); } },
 { id: "salon", type: "auto", w: 6,
 run: (g, ctx, log) => { const n = Game.gainStat(g.char, "魅力", rand(3, 6)); g.money = Math.max(0, g.money - 3); log(`名士雅集相邀，诗酒酬唱，声名藉甚，魅力+${n}。`, "good"); } },
 { id: "doctor", type: "auto", w: 5,
 run: (g, ctx, log) => {
 if (g.char.isSick) { g.char.isSick = false; g.char.stats.体力 = clamp(g.char.stats.体力 + 12, 0, Game.maxSta()); log("游方名医过庄，一剂而病若失，体力渐复。", "good"); }
 else { const n = rand(6, 12); g.char.stats.体力 = clamp(g.char.stats.体力 + n, 0, Game.maxSta()); log(`游方名医赠以丸散，调补有方，体力+${n}。`, "good"); }
 } },
 { id: "omen", type: "auto", w: 2, cond: g => g.family.reputation >= 80,
 run: (g, ctx, log) => { rep(rand(4, 8)); log("芝生于庭，乡人以为积善之征，传颂数日，家族声望渐隆。", "good"); } },

 /* ---------- 抉择 ---------- */
 { id: "lostgold", type: "choice", w: 6,
 build: g => ({
 title: "道拾遗金",
 text: "赶集途中拾得青布囊一个，内封白银十余两，四下并无人见。",
 choices: [
 { label: "昧入私囊（+银）", act: (l) => { money(14); l("拾金而昧，囊中添银十四两。", ""); } },
 { label: "原地守候归还失主", act: (l) => { rep(8); Game.gainStat(g.char, "魅力", 2); l("失主寻至，原银奉还，乡人皆称长者，声望大增。", "good"); } }
 ] }) },
 { id: "meet", type: "choice", w: 6, cond: g => !g.spouse && g.char.age >= 15 && g.char.age <= 32,
 build: g => {
 const other = g.char.gender === "男" ? "女" : "男";
 return {
 title: other === "女" ? "陌上相逢" : "游园惊鸿",
 text: other === "女"
 ? "清明踏青，于陌上遇一女子，布裙荆钗而眉目清朗、举止有度，似亦中意于你。"
 : "上巳游园，遇一少年公子，白衣胜雪，谈吐风雅，目光频频相顾。",
 choices: [
 { label: "托人致意，备礼求亲", act: (l) => {
 const gift = rand(18, 35);
 if (g.money < gift) { l(`家计拮据，备不起${gift}两聘礼，此事只得作罢。`, "bad"); return; }
 g.money -= gift;
 const sName = Game.makeName(other, pick(Game.SURNAMES));
 const sStats = { 体力: rand(45, 75), 智力: rand(45, 78), 武力: rand(20, 55), 魅力: rand(55, 82) };
 g.spouse = Game.decoratePerson({
 id: "sp" + Date.now() + rand(100, 999),
 name: sName,
 gender: other, age: rand(15, Math.min(20, g.char.age + 2)),
 family: rand(35, 60),
 stats: sStats,
 alive: true, title: null, office: null, favor: 70+Math.floor(Math.random()*16)
 }, null, null, true);
 g.spouse.job = Game.pickJob ? Game.pickJob(g.spouse) : null;
 rep(3); l(`佳偶天成，备银${gift}两聘得${g.spouse.name}入门。`, "good");
 } },
 { label: "萍水相逢，不必当真", act: (l) => l("一别两宽，各自归家。", "") }
 ] };
 } },
 { id: "landdeal", type: "choice", w: 6, cond: g => g.money >= g.landPrice * 2,
 build: g => {
 const cost = Math.round(g.landPrice * 3 * 0.7);
 return {
 title: "邻人鬻田",
 text: `西邻遭了官司急于用度，愿将上等好田三亩贱价出让，共索银${cost}两（时值${g.landPrice * 3}两）。`,
 choices: [
 { label: `买入三亩（${cost}两）`, act: (l) => {
 if (g.money < cost) { l("银两不足，眼睁睁看着田产落于别家。", "bad"); return; }
 g.money -= cost; g.land += 3; l("契书签押，新增良田三亩。", "good");
 } },
 { label: "无意增置", act: (l) => l("婉言谢绝，邻人另寻买主。", "") }
 ] };
 } },
 { id: "famine", type: "choice", w: 5,
 build: g => ({
 title: "乡里荐饥",
 text: "去岁歉收，今春流民渐多，聚于庄门外乞食。家中尚有陈粮。",
 choices: [
 { label: "设棚施粥（-15两，声望+）", act: (l) => {
 if (g.money < 15) { l("仓廪亦虚，施粥三日而止。", "bad"); rep(2); g.money = 0; return; }
 g.money -= 15; rep(12); l("设棚施粥月余，活者甚众，乡里立碑颂德。", "good");
 } },
 { label: "囤居奇货，高价粜粮", act: (l) => { money(18); rep(-12); l("趁荒抬价，囊中金增，而闾巷颇有怨声。", "bad"); } }
 ] }) },
 { id: "bridge", type: "choice", w: 4,
 build: g => ({
 title: "倡修石桥",
 text: "村口木桥年久朽坏，已有行人坠河。乡约倡议富户捐资修造石桥。",
 choices: [
 { label: "领衔捐资三十两", act: (l) => { if (g.money < 30) { l("囊中羞涩，认捐十两了事。", ""); g.money = Math.max(0, g.money - 10); rep(5); return; } g.money -= 30; rep(16); l("独力捐资大半，石桥落成之日，桥头刻有你家名讳。", "good"); } },
 { label: "随众凑份十两", act: (l) => { g.money = Math.max(0, g.money - 10); rep(5); l("随份捐资，列名碑阴。", ""); } },
 { label: "两耳不闻", act: (l) => { rep(-3); l("闭门不睬，乡邻微词。", "bad"); } }
 ] }) },
 { id: "officegift", type: "choice", w: 5, cond: g => g.char.office,
 build: g => ({
 title: "上峰寿辰",
 text: "知府大人六十大寿，阖属官员纷纷备办寿礼，衙中幕僚暗示不可落了薄面。",
 choices: [
 { label: "备厚礼二十五两", act: (l) => {
 if (g.money < 25) { l("凑不齐礼数，只得以薄礼应付，上峰面有不豫。", "bad"); g.money = Math.max(0, g.money - 8); g.evalBonus = (g.evalBonus || 0) - 4; return; }
 g.money -= 25; g.evalBonus = (g.evalBonus || 0) + 8;
 if (g.char.office) { g.char.office.merit = (g.char.office.merit || 0) + 3; }
 l("寿礼丰盈，上峰捻须而笑。", "");
 } },
 { label: "只送诗文一幅", act: (l) => { g.evalBonus = (g.evalBonus || 0) - 5; rep(2); l("以亲笔寿屏为礼，同僚窃笑清高，上峰淡淡收下。", ""); } }
 ] }) },
 { id: "graft", type: "choice", w: 5, cond: g => g.char.office && g.char.office.grade <= 8,
 build: g => ({
 title: "盐商冰敬",
 text: "本地盐商深夜登门，留下一封「冰敬」四十两，言称只是仰慕清名，别无他求。",
 choices: [
 { label: "登记充公，分文不取", act: (l) => { rep(10); l("冰敬原封登记，上缴国库充公，分文不取。次日传为美谈，清名远播（声望+10）。", "good"); } },
 { label: "原封退回", act: (l) => { rep(7); l("严词退回，次日传为美谈。", "good"); } }
 ] }) },
 { id: "standfast", type: "choice", w: 4, cond: g => g.char.office && g.char.office.grade <= 6,
 build: g => ({
 title: "上官刁难",
 text: "巡按御史过境，挑剔你衙门「积案可疑」，颇有借题发挥之意。",
 choices: [
 { label: "呈文分辩（赌智力）", act: (l) => {
 if ((g.char.stats.智力 || 50) + rand(-12, 12) > 62) { g.char.office.merit = Math.max(0, (g.char.office.merit || 0) + 3); rep(2); l("分辩得直，积案本是陈年旧牍，御史无话可说（政绩+3）。", "good"); }
 else { g.evalBonus = (g.evalBonus || 0) - 12; rep(-2); l("分辩不清，反落口实，考语间只怕要吃亏。", "bad"); }
 } },
 { label: "据理力争，不肯逢迎", act: (l) => { rep(6); g.evalBonus = (g.evalBonus || 0) - 10; l("当堂抗言，御史怀恨而去，考语间只怕要吃亏。", ""); } }
 ] }) },
 { id: "prodigy", type: "choice", w: 5, cond: g => schoolChild() !== undefined,
 build: g => {
 const c = schoolChild();
 return {
 title: "稚子早慧",
 text: `${c.name}年方${c.age}岁，读书过目成诵，塾师连称「此吾家千里驹也」。`,
 choices: [
 { label: "延请名师，悉心栽培（-12两）", act: (l) => {
 if (g.money < 12) { l("束脩难筹，只得仍旧随塾师读书。", "bad"); return; }
 g.money -= 12; const n = Game.gainStat(c, "智力", 10);
 l(`名师点拨，${c.name}学业大进，智力+${n}。`, "good");
 } },
 { label: "顺其自然", act: (l) => { const n = Game.gainStat(c, "智力", 3); l(`照常开蒙，亦是一块读书的料子（智力+${n}）。`, ""); } }
 ] };
 } },
 { id: "childill", type: "choice", w: 5, cond: g => youngChild() !== undefined,
 build: g => {
 const c = youngChild();
 return {
 title: "幼儿高热",
 text: `${c.name}夜半突发高热，啼哭不止，乳母慌作一团。`,
 choices: [
 { label: "连夜延医（-8两）", act: (l) => {
 if (g.money < 8) { l("请不起大夫，灌了半碗姜汤守到天明……", "bad"); if (chance(0.35)) killChild(c, l); else l("万幸竟自己退热了。", "good"); return; }
 g.money -= 8;
 if (chance(0.92)) l("郎中施救得法，天亮时热退身安。", "good"); else killChild(c, l);
 } },
 { label: "土法驱邪，听天由命", act: (l) => { if (chance(0.55)) killChild(c, l); else l("折腾一夜，竟也熬了过来。", "good"); } }
 ] };
 } },
 { id: "lawsuit", type: "choice", w: 5, cond: g => g.land >= 5,
 build: g => ({
 title: "田界之争",
 text: "豪强仗势，指你家三亩良田是其祖产，已具状告到县衙，暗中递话：私了便可撤讼。",
 choices: [
 { label: "上下打点，对簿公堂（-10两）", act: (l) => {
 if (g.money < 10) { l("无钱打点，官司输了，田土被夺。", "bad"); g.land = Math.max(0, g.land - 3); return; }
 g.money -= 10;
 if (chance(0.7 + g.family.reputation / 400)) { g.land += 2; rep(3); l("县官查明地契，判你胜诉，另追赔良田二亩。", "good"); }
 else { g.land = Math.max(0, g.land - 3); rep(-2); l("对方势大，三亩良田竟被判给豪强。", "bad"); }
 } },
 { label: "退地求和，息事宁人", act: (l) => { g.land = Math.max(0, g.land - 2); rep(4); l("让出二亩田保平安，乡人敬你宽厚。", ""); } }
 ] }) },

 /* ---------- 世家往来（声望高了才有人搭理你） ---------- */
 { id: "shijia_propose", type: "choice", w: 5, cond: g => !g.spouse && g.char.age >= 15 && g.char.age <= 34 && g.family.reputation >= 60,
 build: g => {
 const other = g.char.gender === "男" ? "女" : "男";
 return {
 title: "世家说亲",
 text: `邻县望族闻你家声名，特遣冰人前来说亲，言称其${other === "女" ? "女" : "子"}知书达理，愿结秦晋。`,
 choices: [
 { label: "备厚礼迎娶（80两）", act: (l) => {
 const gift = 80;
 if (g.money < gift) { l(`备不起${gift}两聘礼，亲事只得作罢，对方颇有微词。`, "bad"); rep(-2); return; }
 g.money -= gift;
 const sName = Game.makeName(other, pick(Game.SURNAMES));
 g.spouse = Game.decoratePerson({
 id: "sp" + Date.now() + rand(100, 999),
 name: sName, gender: other, age: rand(15, 20),
 family: rand(70, 95), stats: { 体力: rand(50, 75), 智力: rand(55, 80), 武力: rand(25, 55), 魅力: rand(60, 85) },
 alive: true, title: null, office: null, favor: 70+Math.floor(Math.random()*16)
 }, null, null, true);
 if (Game.pickJob) g.spouse.job = Game.pickJob(g.spouse);
 rep(8); l(`三书六礼，与望族结亲，迎${g.spouse.name}入门，门楣大添光彩。`, "good");
 } },
 { label: "婉言谢绝", act: (l) => { rep(-1); l("以八字不合婉拒，对方虽憾，倒也无怪。", ""); } }
 ] };
 } },
 { id: "child_betrothal", type: "choice", w: 5, cond: g => g.family.reputation >= 100 && g.children.some(x => x.alive && !x.married && x.age >= 15 && x.age <= 24),
 build: g => {
 const c = g.children.find(x => x.alive && !x.married && x.age >= 15 && x.age <= 24);
 const isSon = c.gender === "男";
 return {
 title: "门当户对",
 text: `${c.name}年已${c.age}岁，城中世家遣人来说合，其家门户殷实，${isSon ? "愿以女下嫁" : "愿以子入赘"}。`,
 choices: [
 { label: isSon ? "娶妇入门（-30两，声望+）" : "许嫁良家（+彩礼，声望+）", act: (l) => {
 if (isSon) {
 if (g.money < 30) { l("聘礼难筹，亲事告吹。", "bad"); return; }
 g.money -= 30; c.married = true; rep(6);
 l(`为${c.name}娶妇，两家结为姻亲，往来有助。`, "good");
 } else {
 const gift = rand(25, 50); g.money += gift; c.married = true; rep(6);
 l(`${c.name}许嫁良家，得彩礼${gift}两，亲家亦是望族。`, "good");
 }
 } },
 { label: "尚待斟酌", act: (l) => l("回说八字还需细合，暂且搁下。", "") }
 ] };
 } },
 { id: "oldfriend_gift", type: "auto", w: 4, cond: g => g.family.reputation >= 80,
 run: (g, ctx, log) => {
 const s = rand(20, 50); money(s); rep(2);
 log(`昔年受过你家恩惠的商人如今发迹，遣人送来银${s}两报恩，还遍告人说你家厚道。`, "good");
 } },
 { id: "borrow_money", type: "choice", w: 5, cond: g => g.money >= 40,
 build: g => ({
 title: "族亲告贷",
 text: "远房族叔经营折本，登门告贷三十两，言称三月即还，还说日后必有厚报。",
 choices: [
 { label: "念及宗情，借出三十两", act: (l) => {
 g.money -= 30; rep(5);
 g.family.clan = Math.min(100, (g.family.clan == null ? 50 : g.family.clan) + 6);
 l("周济族亲，宗族情分+6。", "");
 g.loansOut = g.loansOut || [];
 g.loansOut.push({ name: "族叔", amount: 30, back: rand(35, 45), left: 3, repayP: 0.6 });
 l("念及一笔写不出两个姓氏，借银三十两与他，约三月而还。", "");
 } },
 { label: "托词手紧，不借", act: (l) => { rep(-3); g.family.clan = Math.max(0, (g.family.clan == null ? 50 : g.family.clan) - 4); l("托词家计亦艰，族叔悻悻而去，背后颇有怨言（宗族情分-4）。", "bad"); } }
 ] }) },
 { id: "plea_help", type: "choice", w: 5, cond: g => !!(g.char.office || (g.char.title === "juren" || g.char.title === "jinshi" || g.char.title === "gongshi")),
 build: g => ({
 title: "请托说情",
 text: "同乡士绅为一桩钱粮官司求到门上，备了谢礼二十两，只求你在公文上松一松手。",
 choices: [
 { label: "提笔周全（赌智力）", act: (l) => {
 const p = 0.55 + ((g.char.stats.智力 || 50) - 50) * 0.008;
 if (chance(p)) {
 money(20); rep(-3);
 if (g.char.office) { g.char.office.merit = Math.max(0, (g.char.office.merit || 0) - 3); }
 l("一纸条子递到县衙，事遂办成，谢银二十两入手，只是上峰风闻，对你颇为不利。", "");
 } else {
 rep(-6);
 if (g.char.office) { g.char.office.merit = Math.max(0, (g.char.office.merit || 0) - 6); }
 l("说情事泄，被上峰申饬，谢礼没敢收，还落了不是。", "bad");
 }
 } },
 { label: "婉言谢绝", act: (l) => { rep(2); l("以国法为辞，好言谢绝，士绅虽失望，倒敬你方正。", ""); } }
 ] }) },
 /* ---------- 新增剧情：夫妻人伦 ---------- */
 { id: "spouse_quarrel", type: "choice", w: 5, cond: g => !!g.spouse,
 build: g => ({
 title: "夫妻口角",
 text: `为家用琐事，${g.spouse.name}与你起了口角，摔了帘子回房，晚饭也不曾同桌。`,
 choices: [
 { label: "备礼赔不是（-5两，好感+）", act: (l) => {
 if (g.money < 5) { l("囊中空空，只得以言语赔情，好感略复。", ""); g.spouse.favor = clamp((g.spouse.favor == null ? 65 : g.spouse.favor) + 3, 0, 100); return; }
 g.money -= 5; g.spouse.favor = clamp((g.spouse.favor == null ? 65 : g.spouse.favor) + 8, 0, 100);
 l(`你备了点心亲送房中，${g.spouse.name}破涕为笑，好感+8。`, "good");
 } },
 { label: "由她去，冷上几日", act: (l) => { g.spouse.favor = clamp((g.spouse.favor == null ? 65 : g.spouse.favor) - 8, 0, 100); rep(-1); l("冷战数日，相见无言，好感-8。", "bad"); } }
 ] }) },
 { id: "spouse_sick", type: "choice", w: 4, cond: g => !!g.spouse,
 build: g => ({
 title: "配偶染恙",
 text: `${g.spouse.name}偶感风寒，卧床不起，口中却只说不妨事。`,
 choices: [
 { label: "延医诊治（-8两）", act: (l) => {
 if (g.money < 8) { l("请不起大夫，亲自侍汤奉药，倒也情深。", ""); g.spouse.favor = clamp((g.spouse.favor || 65) + 4, 0, 100); return; }
 g.money -= 8; g.spouse.favor = clamp((g.spouse.favor || 65) + 6, 0, 100);
 l(`郎中开了方子，调养半月而愈，${g.spouse.name}感念在心，好感+6。`, "good");
 } },
 { label: "熬一熬就过去了", act: (l) => { g.spouse.favor = clamp((g.spouse.favor || 65) - 6, 0, 100); l("拖了半月才好，配偶心中有了芥蒂，好感-6。", "bad"); } }
 ] }) },
 { id: "inlaw_help", type: "choice", w: 4, cond: g => !!g.spouse && (g.spouse.family || 0) >= 70,
 build: g => ({
 title: "岳家助力",
 text: `岳家见你家周转不灵，遣人送来银五十两，言称“自家人，不必见外”，只盼你善待${g.spouse.name}。`,
 choices: [
 { label: "受下，日后报答（好感+）", act: (l) => { money(50); g.spouse.favor = clamp((g.spouse.favor || 65) + 5, 0, 100); rep(2); l("受下岳家银五十两，往来更密。", "good"); } },
 { label: "婉辞，不吃软饭", act: (l) => { rep(5); g.spouse.favor = clamp((g.spouse.favor || 65) - 2, 0, 100); l("正色婉辞，岳家反高看一眼，声望+5。", ""); } }
 ] }) },
 /* ---------- 新增剧情：人际与机遇 ---------- */
 { id: "oldfriend_recommend", type: "choice", w: 5, cond: g => g.family.reputation >= 60 && (g.contacts || []).length < 8,
 build: g => ({
 title: "故友举荐",
 text: "昔年同窗如今在郡中任职，来信说有一位才俊想与你结交，问你见是不见。",
 choices: [
 { label: "设宴相见", act: (l) => {
 if (g.money < 5) { l("连一席酒都备不起，只得作罢。", "bad"); return; }
 g.money -= 5;
 const ct = Game.makeContact(null, true);
 if (ct) l(`席间一见如故，与${ct.name}互留名帖（门户${ct.family}）。`, "good");
 else l("相见恨晚，可惜名帖匣子已满。", "");
 } },
 { label: "托词不见", act: (l) => l("回信婉谢，倒也无妨。", "") }
 ] }) },
 { id: "shelter_traveler", type: "choice", w: 5,
 build: g => ({
 title: "寒夜投宿",
 text: "寒夜风雪，一主一仆叩庄求宿，自称是远道行商，愿以银钱相酬。",
 choices: [
 { label: "开门收留", act: (l) => {
 if (chance(0.6)) { const s = rand(15, 35); money(s); rep(3); l(`客商感激，临行留下银${s}两为谢，还四处称颂你家仁厚。`, "good"); }
 else { const s = Math.min(g.money, rand(5, 12)); g.money -= s; rep(-2); l(`夜半客商竟卷了银${s}两潜逃，家丁追之不及。`, "bad"); }
 } },
 { label: "恐生事端，不留", act: (l) => l("隔门谢绝，风雪声中人影远去。", "") }
 ] }) },
 /* ---------- 新增剧情：家业 ---------- */
 { id: "shop_patron", type: "choice", w: 5, cond: g => (g.shops || []).length > 0,
 build: g => {
 const s = g.shops[0];
 const nm = (Game.SHOP_TYPES[s.type] || {}).name || "铺面";
 return {
 title: "铺中贵客",
 text: `你家${nm}来了一位豪客，出手阔绰，却嫌铺面陈设旧了，言下之意：若肯花二十两重新装潢，日后常来照顾生意。`,
 choices: [
 { label: "装潢一新（-20两，口碑+）", act: (l) => {
 if (g.money < 20) { l("囊中羞涩，只得作罢，豪客拂袖而去。", "bad"); return; }
 g.money -= 20; s.fame = clamp((s.fame || 50) + 12, 0, 100); rep(3);
 l(`装潢一新，豪客果然成了常客，${nm}口碑+12。`, "good");
 } },
 { label: "小本经营，不折腾", act: (l) => l("笑脸送客，一切照旧。", "") }
 ] };
 } },
 { id: "academy_glory", type: "auto", w: 4, cond: g => !!(g.academy && g.academy.teacher) && g.children.some(x => x.alive && x.age >= 6 && x.age <= 15),
 run: (g, ctx, log) => {
 const c = g.children.find(x => x.alive && x.age >= 6 && x.age <= 15);
 const n = Game.gainStat(c, "智力", rand(3, 6));
 log(`族学先生课读甚严，${c.name}学业精进，智力+${n}，先生亦得乡人称赞。`, "good");
 } },
 { id: "harvest_festival", type: "choice", w: 5, cond: g => g.land >= 10 && g.money >= 8,
 build: g => ({
 title: "丰年赛社",
 text: "秋收既毕，乡约倡议赛社演戏，家家出份子，你家拟出八两。",
 choices: [
 { label: "出份子与民同乐（-8两）", act: (l) => { g.money -= 8; rep(8); const n = rand(2, 4); g.char.stats.体力 = clamp(g.char.stats.体力 + n, 0, Game.maxSta()); l(`赛社三日，热闹非凡，你亲下场舞了一回，体力+${n}，声望+8。`, "good"); } },
 { label: "节俭持家，不凑热闹", act: (l) => { rep(-2); l("闭门不出，乡人觉得你家不够合群。", "bad"); } }
 ] }) },
 { id: "granary_appeal", type: "choice", w: 4, cond: g => g.family.reputation >= 100 && (g.granary.rice + g.granary.wheat) >= 20,
 build: g => ({
 title: "义仓之议",
 text: "县令倡设义仓备荒，劝你家捐粮二十斗为表率，事成之后自有旌表。",
 choices: [
 { label: "捐粮二十斗", act: (l) => {
 let need = 20;
 const take1 = Math.min(g.granary.rice, need); g.granary.rice -= take1; need -= take1;
 const take2 = Math.min(g.granary.wheat, need); g.granary.wheat -= take2; need -= take2;
 if (need > 0) { l("仓中存粮不足，捐纳之事只得作罢。", "bad"); g.granary.rice += take1; g.granary.wheat += take2; return; }
 rep(15); l("捐粮入义仓，县令亲书“积善之家”匾额相赠，声望+15。", "good");
 } },
 { label: "家粮亦紧，婉拒", act: (l) => { rep(-2); l("托词辞却，县令面色淡淡。", "bad"); } }
 ] }) },
 /* ---------- 新增剧情：科举与成长 ---------- */
 { id: "fail_comfort", type: "choice", w: 4, cond: g => !g.char.title && !g.char.office && g.char.age >= 20 && g.char.age <= 45,
 build: g => ({
 title: "落榜之后",
 text: "又是一榜无名。你对着红榜发了半日呆，同窗邀你去散心，束脩说这次他请。",
 choices: [
 { label: "悬梁刺股，再读三更", act: (l) => { const n = Game.gainStat(g.char, "智力", rand(4, 7)); g.char.stats.体力 = clamp(g.char.stats.体力 - 3, 0, Game.maxSta()); l(`挑灯夜读，似有所悟，智力+${n}，只是熬得眼圈发黑。`, ""); } },
 { label: "出游散心（-5两）", act: (l) => {
 if (g.money < 5) { l("连散心的钱都没有，愈发郁郁。", "bad"); return; }
 g.money -= 5; const n = Game.gainStat(g.char, "魅力", rand(3, 6)); l(`登高望远，郁结稍解，魅力+${n}。`, "good");
 } }
 ] }) },
 { id: "catch_week", type: "auto", w: 4, cond: g => g.children.some(x => x.alive && x.age === 1),
 run: (g, ctx, log) => {
 const c = g.children.find(x => x.alive && x.age === 1);
 const r = Math.random();
 if (r < 0.34) { const n = Game.gainStat(c, "智力", 5); log(`${c.name}周岁抓周，一把抓住书本不放，宾客皆笑“他日必是读书种子”（智力+${n}）。`, "good"); }
 else if (r < 0.67) { const n = Game.gainStat(c, "魅力", 5); log(`${c.name}抓周独爱算盘，拨得哗哗响，众人道“好个精明孩子”（魅力+${n}）。`, "good"); }
 else { const n = Game.gainStat(c, "体力", 5); log(`${c.name}抓周抱住小弓不撒手，祖父大笑“是将门之种”（体力+${n}）。`, "good"); }
 } },
 /* ---------- 女官线：选秀与宫中 ---------- */
 { id: "imperial_draft", type: "choice", w: 5,
 cond: g => g.family.reputation >= 60 && g.children.some(x => x.alive && x.gender === "女" && !x.married && !x.palace && !x.out && x.age >= 14 && x.age <= 19),
 build: g => {
 const c = g.children.find(x => x.alive && x.gender === "女" && !x.married && !x.palace && !x.out && x.age >= 14 && x.age <= 19);
 return {
 title: "选秀之年",
 text: `三年一度的选秀到了。宫中放出话来，${c.name}年方${c.age}岁，容色${c.stats.魅力 >= 70 ? "出众" : "尚可"}，街坊都劝你送她一试——选上了阖家荣耀，落选也不丢人。`,
 choices: [
 { label: `送${c.name}应选`, act: (l) => { Game.palaceDraft(c.id); } },
 { label: "不忍骨肉分离", act: (l) => l("将帖子压下，只当没这回事，留女儿在家议亲。", "") }
 ] };
 } },
 { id: "palace_ripple", type: "choice", w: 4,
 cond: g => g.children.some(x => x.alive && x.out === "palace"),
 build: g => {
 const c = g.children.find(x => x.alive && x.out === "palace");
 return {
 title: "宫中风波",
 text: `宫里递出信来：${c.name}（${Game.palaceName(c)}）卷进了一场口舌是非，管事嬷嬷暗示，花二十两打点便可大事化小。`,
 choices: [
 { label: "花银二十两打点", act: (l) => {
 if (g.money < 20) { l("一时凑不出银子，只得写信叫她忍耐。", "bad"); rep(-1); return; }
 g.money -= 20;
 if (c.palace.track === "consort" && c.palace.grade < 5 && chance(0.4)) {
 c.palace.grade += 1; rep(4);
 l(`银子送到，事情平息，对方反失了势，${c.name}反晋一级为${Game.palaceName(c)}！`, "good");
 } else l("银子送到，风波平息，她来信道谢。", "");
 } },
 { label: "宫廷事不便插手", act: (l) => {
 if (chance(0.35)) {
 if (c.palace.track === "consort" && c.palace.grade > 0) { c.palace.grade -= 1; l(`${c.name}受了牵连，被降了一级。`, "bad"); }
 else l(`${c.name}受了些委屈，写信来哭诉。`, "bad");
 } else l("她机灵应对，竟自己化解了。", "good");
 } }
 ] };
 } },
 /* ---------- 官场风波（关系不好就要挨打） ---------- */
 { id: "censor_wind", type: "choice", w: 5,
 cond: g => !!(g.char.office) && ((g.char.office.merit || 0) < 30),
 build: g => ({
 title: "台谏风闻",
 text: "御史弹劾你的折子递到了监司，罪名无非是“催科峻急、民怨载道”。吏部已来问话。",
 choices: [
 { label: "呈递账册，自证清白（赌智力）", act: (l) => {
 if ((g.char.stats.智力 || 50) + rand(-10, 10) > 62) { l("账册井然，催科皆有文牍可稽，事情淡了下去。", "good"); }
 else {
 const o = g.char.office;
 if (o.grade > 0) { const ng = Math.max(0, o.grade - 1); Game.appoint(o.track, ng); rep(-4); l("自辩无力，降一级留用，罚俸三月。", "bad"); }
 else { o.merit = 0; rep(-8); l("考语极难看（政绩清零、声望-8）。", "bad"); }
 }
 } },
 { label: "称病不出，避其锋芒", act: (l) => {
 g.char.office.merit = Math.max(0, g.char.office.merit - 3);
 l("称病不出，风头过去，考语稍损（政绩-3）。", "");
 } },
 { label: "上疏自辩，不花分文", act: (l) => {
 if ((g.char.stats.智力 || 50) + rand(-10, 10) > 62) { l("辩疏写得恳切，监司看了说“知道了”，事情淡了下去。", "good"); }
 else {
 const o = g.char.office;
 if (o.grade > 0) { const ng = Math.max(0, o.grade - 1); Game.appoint(o.track, ng); rep(-5); l("自辩无力，反落个“强辩”之名，降一级。", "bad"); }
 else { o.merit = 0; rep(-8); l("考语极难看（政绩清零、声望-8）。", "bad"); }
 }
 } }
 ] }) },
 { id: "people_petition", type: "choice", w: 5,
 cond: g => !!(g.char.office),
 build: g => ({
 title: "百姓击鼓",
 text: "一群百姓抬着状子跪在衙门口，告的是你治下欠收还催科太急。围观的人越来越多。",
 choices: [
 { label: "赔银安抚，缓征半月（25两）", act: (l) => {
 if (g.money < 25) { l("拿不出银子安抚，人群久久不散。", "bad"); rep(-4); return; }
 g.money -= 25; ; rep(2);
 l("开仓平粜、缓征半月，百姓散去，还立了块“仁厚”小碑。", "good");
 } },
 { label: "升堂问案，依法处置", act: (l) => {
 if (chance(0.5)) { ; l("查明确有胥吏作弊，杖责胥吏，百姓心服。", "good"); }
 else {
 const o = g.char.office;
 ; rep(-5);
 if (o.grade > 0 && chance(0.5)) { const ng = o.grade - 1; Game.appoint(o.track, ng); l("事情闹大，上宪震怒，降一级以平民愤。", "bad"); }
 else l("案子越审越僵，民怨未平，上宪记了你一笔。", "bad");
 }
 } }
 ] }) },
 { id: "peer_squeeze", type: "choice", w: 5,
 cond: g => !!(g.char.office),
 build: g => ({
 title: "同僚倾轧",
 text: "同僚在上峰面前给你上了眼药，说你“年轻识浅、独断专行”。年终考语眼看要吃亏。",
 choices: [
 { label: "设宴修好（15两）", act: (l) => {
 if (g.money < 15) { l("连顿和头酒都摆不起。", "bad"); return; }
 g.money -= 15; ;
 l("一席酒吃到半夜，误会说开，同僚拍胸脯说考语的事他去分说。", "good");
 } },
 { label: "据理力争", act: (l) => {
 if ((g.char.stats.智力 || 50) + rand(-12, 12) > 60) { g.char.office.merit += 5; l("当面把账算清，上峰点头：到底是谁搬弄是非，一目了然（政绩+5）。", "good"); }
 else { g.char.office.merit = Math.max(0, g.char.office.merit - 8); l("争赢了道理，输了人缘，考语更难看了（政绩-8）。", "bad"); }
 } }
 ] }) },

 /* ---------- 宫里要钱（只出不进，位分越高越敢开口） ---------- */
 { id: "palace_need", type: "choice", w: 5,
 cond: g => {
 const ds = (g.children || []).filter(x => x.alive && x.out === "palace" && x.palace);
 if (!ds.length) return false;
 const top = ds.some(x => x.palace.track === "consort") ? 0.30 : ds.some(x => x.palace.track === "maid" && x.palace.grade >= 3) ? 0.08 : 0.05;
 return chance(top);
 },
 build: g => {
 const ds = (g.children || []).filter(x => x.alive && x.out === "palace" && x.palace);
 ds.sort((a, b) => {
 const ta = a.palace.track === "consort" ? 1 : 0, tb = b.palace.track === "consort" ? 1 : 0;
 if (ta !== tb) return tb - ta;
 return b.palace.grade - a.palace.grade;
 });
 const c = ds[0];
 const isCon = c.palace.track === "consort";
 const amt = isCon ? (c.palace.grade >= 3 ? rand(50, 80) : rand(30, 50)) : rand(10, 20);
 const why = isCon
 ? (chance(0.5) ? "如今正得脸面，应酬走动、裁制新衣都要银子" : "近来处境艰难，想备份厚礼缓和关系")
 : "宫中使费渐多，月例不够开销";
 return {
 title: "宫里来信要钱",
 text: Game.palaceName(c) + c.name + "捎信回家：" + why + "，想家里接济" + amt + "两。",
 choices: [
 { label: "给" + amt + "两（家书报平安）", act: (l) => {
 if (g.money < amt) { l("翻箱倒柜也凑不齐，只得回信让她再忍忍。", "bad"); rep(-1); return; }
 g.money -= Math.round(amt * 100) / 100; rep(2);
 l("银子送进宫，" + c.name + "回信说一切安好，家中有孝名，声望+2。", "good");
 } },
 { label: "实在接济不起", act: (l) => {
 rep(-2);
 if (isCon && chance(0.35)) {
 if (c.palace.grade > 0) { c.palace.grade -= 1; l(c.name + "失了打点，在宫中愈发艰难，竟被降了一级。", "bad"); }
 else l(c.name + "的日子更难过了，来信只有叹气。", "bad");
 } else if (!isCon && chance(0.08)) {
 c.palace = null; c.out = null;
 l(c.name + "熬不下去，自请出宫归家。", "bad");
 } else l("回信好言宽慰，只盼她自己争气。", "");
 } }
 ] };
 } },

 /* ---------- 家常倒霉 ---------- */
 { id: "night_thief", type: "choice", w: 5,
 cond: g => g.money >= 50,
 build: g => ({
 title: "夜半贼影",
 text: "更鼓三下，院墙外似有人影晃动。家丁抄起棍棒，说追还是守，请你拿个主意。",
 choices: [
 { label: "率众追打（赌武力）", act: (l) => {
 if ((g.char.stats.武力 || 40) + rand(-12, 12) > 55) { l("追出二里擒住毛贼，搜出赃物还倒贴了酒钱。", "good"); money(8); }
 else { const s = Math.min(g.money, rand(8, 20)); g.money -= s; l("追出去反中了调虎离山计，屋里被顺走银" + s + "两。", "bad"); }
 } },
 { label: "闭门持守", act: (l) => { const s = Math.min(g.money, rand(5, 12)); g.money -= s; l("贼人撬了仓房一角，失银" + s + "两，好在人没事。", "bad"); } }
 ] }) },
 { id: "clan_feud", type: "choice", w: 4,
 cond: g => g.family.reputation >= 60 && g.children.filter(x => x.alive).length >= 2,
 build: g => {
 const c = g.children.find(x => x.alive);
 return {
 title: "族亲争产",
 text: "远房族亲指着你家新置的田亩，说是占了他们祖上的地界，闹到族长面前，要你表态。",
 choices: [
 { label: "破财消灾（20两）", act: (l) => {
 if (g.money < 20) { l("拿不出钱，族长只得判你让出二亩田。", "bad"); g.land = Math.max(0, g.land - 2); Game.syncLand && Game.syncLand(); return; }
 g.money -= 20; rep(3); l("花二十两摆酒请族老作证，地界勘定，再无异议（声望+3）。", "");
 } },
 { label: "对簿族祠", act: (l) => {
 if ((g.char.stats.智力 || 50) + rand(-12, 12) + g.family.reputation / 60 > 65) { rep(6); l("当众拿出地契鱼鳞册，族亲哑口无言，反敬你家规矩（声望+6）。", "good"); }
 else { g.land = Math.max(0, g.land - 2); rep(-3); Game.syncLand && Game.syncLand(); l("吵到最后各打五十大板，让出二亩田了事。", "bad"); }
 } }
 ] };
 } },
 /* ---------- 关系 comb：恩厚有赏，情分是攒出来的 ---------- */
 { id: "court_commend", type: "auto", w: 4,
 cond: g => !!(g.char.office) && ((g.char.office.merit || 0) >= 40),
 run: (g, ctx, log) => {
 const s = rand(20, 40); money(s); g.char.office.merit += 3;
 log(`吏部考功：以你考绩在优，嘉奖银${s}两，政绩+3。勤勉做事，自有公论。`, "good");
 } },
 { id: "clan_field", type: "choice", w: 4, cond: g => g.family.reputation >= 60 && g.money >= 50,
 build: g => ({
 title: "宗族祭田",
 text: "族老提议：合族出资置二十亩祭田，收成供春秋两祭并周济孤寡。你家是头面，认捐二十两，认还是不认？",
 choices: [
 { label: "认捐二十两", act: (l) => {
 if (g.money < 20) { l("实在拿不出，族老面露失望。", "bad"); return; }
 g.money -= 20; g.family.clan = Math.min(100, (g.family.clan || 50) + 8); rep(4);
 l("二十两认捐，碑上刻你家名讳居首（宗族情分+8、声望+4）。", "good");
 } },
 { label: "不认", act: (l) => l("托词推了，族老没再说什么。", "") }
 ] }) },
 { id: "banquet", type: "choice", w: 4, cond: g => g.family.reputation >= 160 && g.money >= 20,
 build: g => ({
 title: "夜宴之邀",
 text: "郡中缙绅设宴，遍邀一时名流，帖子亦送到了你府上。赴宴须备礼金二十两。",
 choices: [
 { label: "备礼赴宴（-20两）", act: (l) => {
 g.money -= 20; rep(5);
 const n = Game.gainStat(g.char, "魅力", 3);
 
 l(`杯觥交错间结识不少人物，魅力+${n}，声望亦涨。席间偶闻朝中用人消息。`, "good");
 } },
 { label: "称病不去", act: (l) => { rep(-2); l("托病不赴，主人家面子上颇不好看。", "bad"); } }
 ] }) }
 ];

 function killChild(c, l) {
 c.alive = false;
 l(`${c.name}药石无灵，竟自夭折，举家哀恸。`, "bad");
 }
 Game.killChild = killChild;

 Game.rollEvent = function () {
 const g = Game.G;
 if (!chance(0.24)) return null;
 const pool = Game.EVENTS.filter(e => !e.cond || e.cond(g));
 if (!pool.length) return null;
 const total = pool.reduce((s, e) => s + e.w, 0);
 let r = Math.random() * total;
 for (const e of pool) { r -= e.w; if (r <= 0) return e; }
 return pool[0];
 };
})();
