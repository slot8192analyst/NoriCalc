// ===== 状態 =====
const DEFAULT_START = "09:00";

let members = [
  { name: "A", investYen: 0, investMai: 0, retMai: 0, start: DEFAULT_START, end: "" },
  { name: "B", investYen: 0, investMai: 0, retMai: 0, start: DEFAULT_START, end: "" },
];
let rate = 19.61;
let rateMode = "mai";
const EXCH_BASE = 1000;

const PRIZE_BIG = 5000;
const PRIZE_MID = 1000;

// 一括入力：チェックされたメンバーのindexを保持（再描画をまたいで維持）
let checkedSet = new Set();
// ポップアップで編集中のメンバーindex
let editingIndex = null;

const RULE_LABELS = {
  R1: "総回収を人数で均等分配",
  R3: "投資も回収も合算→等分で清算",
  R4: "稼働時間で振り分け（負け全額補填／勝ち時間比）",
  R5: "稼働時間で完全按分",
};

const yen = n => Math.round(n).toLocaleString("ja-JP") + "円";
const signClass = n => n > 0 ? "plus" : (n < 0 ? "minus" : "");
const signYen = n => (n > 0 ? "+" : "") + yen(n);

function settleLabel(n){
  if(n > 0.5) return "受取";
  if(n < -0.5) return "支払";
  return "ちょうど";
}

function groupNum(n){
  return (n && n > 0) ? Number(n).toLocaleString("ja-JP") : "";
}

function nowHHMM(){
  const d = new Date();
  let total = d.getHours() * 60 + d.getMinutes();
  total = Math.round(total / 5) * 5;
  total = total % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function toMinutes(t){
  if(!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h,m] = t.split(":").map(Number);
  return h*60 + m;
}

function hoursOf(m){
  const s = toMinutes(m.start);
  const e = toMinutes(m.end);
  if(s === null || e === null) return 0;
  const diff = e - s;
  if(diff <= 0) return 0;   // 終了が開始以前なら不正入力として0扱い
  return diff / 60;
}

function investOf(m){ return (m.investYen||0) + (m.investMai||0) * rate; }
function retOf(m){ return (m.retMai||0) * rate; }

function toPrizes(amount){
  let rest = Math.round(amount);
  let big = 0, mid = 0;
  if(PRIZE_BIG > 0){ big = Math.floor(rest / PRIZE_BIG); rest -= big * PRIZE_BIG; }
  if(PRIZE_MID > 0){ mid = Math.floor(rest / PRIZE_MID); rest -= mid * PRIZE_MID; }
  return { big, mid, zandaka: rest };
}

function prizeChips(p){
  const chips = [];
  if(p.big > 0){
    chips.push(
      `<span class="prize-chip"><span class="p-ico big"></span>` +
      `<span class="p-name">大景品</span><span class="p-mul">×</span><span class="p-cnt">${p.big}</span></span>`
    );
  }
  if(p.mid > 0){
    chips.push(
      `<span class="prize-chip"><span class="p-ico mid"></span>` +
      `<span class="p-name">中景品</span><span class="p-mul">×</span><span class="p-cnt">${p.mid}</span></span>`
    );
  }
  if(p.zandaka > 0){
    chips.push(`<span class="prize-chip zandaka">端数 ${yen(p.zandaka)}</span>`);
  }
  if(chips.length === 0){
    chips.push(`<span class="prize-chip none">—</span>`);
  }
  return chips.join("");
}

function ruleUsesHours(){
  const v = document.getElementById("rule").value;
  return v === "R4" || v === "R5";
}

// ===== 保存・復元 =====
const STORAGE_KEY = "noriuchi_calc_v1";

function saveState(){
  try{
    const data = {
      members,
      rate,
      rateMode,
      rule: document.getElementById("rule").value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }catch(e){}
}

function sanitizeMember(m, i){
  const num = v => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const time = v => (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v)) ? v : "";
  return {
    name: (m && typeof m.name === "string" && m.name.trim())
            ? m.name : String.fromCharCode(65 + i),
    investYen: num(m && m.investYen),
    investMai: num(m && m.investMai),
    retMai:    num(m && m.retMai),
    start: (m && time(m.start)) ? m.start : DEFAULT_START,
    end:   time(m && m.end),
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);
    if(Array.isArray(data.members)){
      members = data.members.map((m, i) => sanitizeMember(m, i));
    }
    if(typeof data.rate === "number" && data.rate > 0) rate = data.rate;
    if(data.rateMode === "yen" || data.rateMode === "mai") rateMode = data.rateMode;
    if(data.rule) document.getElementById("rule").value = data.rule;
    return true;
  }catch(e){ return false; }
}

// ===== 描画 =====
function render(){
  renderRateUI();
  renderCards();
  renderRuleNote();
  renderBulkBar();
  calc();
}

// ===== 時刻の一括入力バー =====
function renderBulkBar(){
  const bar = document.getElementById("bulkTime");
  const show = ruleUsesHours() && members.length > 0;
  bar.classList.toggle("is-hidden", !show);
  if(!show) return;

  // チェック済みindexのうち存在しないものを掃除
  [...checkedSet].forEach(i => { if(i >= members.length) checkedSet.delete(i); });

  const allChecked = members.length > 0 && checkedSet.size === members.length;
  document.getElementById("bulkCheckAll").checked = allChecked;

  const endInput = document.getElementById("bulkEndTime");
  if(!endInput.value) endInput.value = nowHHMM();

  const info = document.getElementById("bulkInfo");
  info.textContent = checkedSet.size > 0
    ? `${checkedSet.size}人を選択中`
    : "対象にチェック → 時刻を選んで一括反映";
}

// 一括：チェック中のメンバーに開始 or 終了を反映
function applyBulk(which, time){
  if(!time){ showToast("時刻を選んでください"); return; }
  if(checkedSet.size === 0){ showToast("対象にチェックを入れてください"); return; }
  checkedSet.forEach(i => { if(members[i]) members[i][which] = time; });
  const cnt = checkedSet.size;
  checkedSet.clear();
  renderCards();
  renderBulkBar();
  calc();
  const label = which === "start" ? "開始" : "終了";
  showToast(`${cnt}人の${label}を ${time} にしました`);
}

function renderCards(){
  const box = document.getElementById("memberCards");
  box.innerHTML = "";

  if(members.length === 0){
    box.innerHTML = `<div class="empty-members">右上の「+追加」でメンバーを登録してください</div>`;
    return;
  }

  const showHours = ruleUsesHours();

  members.forEach((m, i) => {
    const pl = retOf(m) - investOf(m);
    const hrs = hoursOf(m);
    const isChecked = checkedSet.has(i);

    // 稼働時間の結果テキスト
    let tsInner;
    if(m.start && m.end && hrs > 0){
      tsInner = `稼働 <b>${hrs.toFixed(2)}</b> h　<span class="ts-range">${m.start} → ${m.end}</span>`;
    }else if(m.start && m.end){
      tsInner = `<span class="ts-none">時刻を確認してください（${m.start} → ${m.end}）</span>`;
    }else{
      tsInner = `<span class="ts-none">終了時刻が未入力</span>`;
    }

    const card = document.createElement("div");
    card.className = "member-card";
    card.innerHTML = `
      <div class="member-head">
        <div class="member-head-left">
          <input type="checkbox" class="member-check${showHours ? "" : " is-hidden"}"
                 data-check="${i}" ${isChecked ? "checked" : ""} title="一括入力の対象">
          <div class="member-name">${escapeHtml(m.name)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="member-pl">現在損益：<b class="${signClass(pl)}">${signYen(pl)}</b></div>
          <button class="x-btn" title="削除">×</button>
        </div>
      </div>
      <div class="io-grid">
        <div class="io-box invest">
          <div class="t">投資（円）</div>
          <div class="f"><input inputmode="numeric" enterkeyhint="next" data-k="investYen" placeholder="0" value="${groupNum(m.investYen)}">円</div>
        </div>
        <div class="io-box invest">
          <div class="t">投資（枚）</div>
          <div class="f"><input inputmode="numeric" enterkeyhint="next" data-k="investMai" placeholder="0" value="${groupNum(m.investMai)}">枚</div>
        </div>
        <div class="io-box ret">
          <div class="t">回収（枚）</div>
          <div class="f"><input inputmode="numeric" enterkeyhint="done" data-k="retMai" placeholder="0" value="${groupNum(m.retMai)}">枚</div>
        </div>
        <div class="time-summary${showHours ? "" : " is-hidden"}">
          <span class="ts-text">${tsInner}</span>
          <button class="time-edit-btn" type="button" data-edit="${i}">時刻</button>
        </div>
      </div>`;

    card.querySelector(".x-btn").onclick = () => {
      if(confirm(`${members[i].name} を削除しますか？`)){
        members.splice(i,1);
        checkedSet.clear();   // index がずれるので選択はリセット
        render();
      }
    };

    // チェックボックス
    const chk = card.querySelector("input[data-check]");
    if(chk){
      chk.onchange = () => {
        if(chk.checked) checkedSet.add(i); else checkedSet.delete(i);
        renderBulkBar();
      };
    }

    // 数値入力
    card.querySelectorAll("input[data-k]").forEach(inp => {
      const k = inp.dataset.k;
      inp.oninput = () => {
        const v = parseInt(inp.value.replace(/[^0-9]/g,""),10) || 0;
        members[i][k] = v;
        const npl = retOf(members[i]) - investOf(members[i]);
        const plEl = card.querySelector(".member-pl b");
        plEl.textContent = signYen(npl);
        plEl.className = signClass(npl);
        calc();
      };
      inp.onblur = () => { inp.value = groupNum(members[i][k]); };
      inp.onfocus = () => { inp.value = members[i][k] ? String(members[i][k]) : ""; };
    });

    // 時刻編集ボタン → ポップアップ
    const editBtn = card.querySelector("button[data-edit]");
    if(editBtn){
      editBtn.onclick = () => openTimeModal(i);
    }

    box.appendChild(card);
  });
}

// ===== 個別時刻編集ポップアップ =====
function openTimeModal(i){
  editingIndex = i;
  const m = members[i];
  const overlay = document.getElementById("timeModal");
  document.getElementById("modalTitle").textContent = `${m.name} の時刻を編集`;
  const s = document.getElementById("modalStart");
  const e = document.getElementById("modalEnd");
  s.value = m.start || "";
  e.value = m.end || "";
  updateModalHours();
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
}

function closeTimeModal(){
  editingIndex = null;
  const overlay = document.getElementById("timeModal");
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
}

function updateModalHours(){
  const s = document.getElementById("modalStart").value;
  const e = document.getElementById("modalEnd").value;
  const h = hoursOf({ start:s, end:e });
  document.getElementById("modalHours").textContent = h.toFixed(2);
}

function saveTimeModal(){
  if(editingIndex === null) return;
  const s = document.getElementById("modalStart").value;
  const e = document.getElementById("modalEnd").value;
  members[editingIndex].start = s;
  members[editingIndex].end = e;
  closeTimeModal();
  renderCards();
  renderBulkBar();
  calc();
}

function renderRateUI(){
  const yenWrap = document.getElementById("rateYenWrap");
  const maiWrap = document.getElementById("rateMaiWrap");
  const note = document.getElementById("rateNote");
  const lblYen = document.getElementById("modeLabelYen");
  const lblMai = document.getElementById("modeLabelMai");

  if(rateMode === "yen"){
    yenWrap.style.display = "flex";
    maiWrap.style.display = "none";
    lblYen.classList.add("active");
    lblMai.classList.remove("active");
  }else{
    yenWrap.style.display = "none";
    maiWrap.style.display = "flex";
    lblYen.classList.remove("active");
    lblMai.classList.add("active");
  }
  note.textContent = `現在の単価：${rate.toFixed(2)}円/枚 で円換算して計算します。`;
  renderRateSummary();
}

function renderRateSummary(){
  const exch = rate > 0 ? Math.round(EXCH_BASE / rate) : 0;
  document.getElementById("rateSummary").textContent =
    `${exch}枚交換 / ${rate.toFixed(2)}円`;

  const q = document.getElementById("rateQuick");
  const suffix = document.getElementById("quickSuffix");
  if(rateMode === "yen"){
    if(document.activeElement !== q) q.value = rate.toFixed(2);
    q.setAttribute("inputmode", "decimal");
    suffix.textContent = "円/枚";
  }else{
    if(document.activeElement !== q) q.value = String(exch);
    q.setAttribute("inputmode", "numeric");
    suffix.textContent = "枚";
  }
}

function renderRuleSummary(){
  const v = document.getElementById("rule").value;
  document.getElementById("ruleSummary").textContent = RULE_LABELS[v] || "";
}

function renderRuleNote(){
  const rule = document.getElementById("rule").value;
  const note = document.getElementById("ruleNote");
  if(rule === "R1"){
    note.textContent = "総回収を人数で均等に分けます。投資はそれぞれの自己負担のままです。";
  }else if(rule === "R4"){
    note.textContent = "全員の投資（負け分）はプールが全額補填し、全体の勝ち分を稼働時間の割合で分配します。全体がマイナスのときは全員で同額の負け（均等負担）になります。";
  }else if(rule === "R5"){
    note.textContent = "全体の損益を、勝ち負けに関わらず各自の稼働時間の割合で分け合います。途中参加で稼働が短い人は、勝ちの取り分も負けの負担も小さくなるため、関与していない時間帯の負けを大きく背負う不公平が起きにくいです。";
  }else{
    note.textContent = "（回収−投資）の損益を全員で等分します。投資負担も含めて平準化するため、投資差の不公平感が出にくいです。";
  }
  renderRuleSummary();
}

// ===== 計算 =====
function calc(){
  const rule = document.getElementById("rule").value;
  const n = members.length;
  const totalInvest = members.reduce((s,m)=>s+investOf(m),0);
  const totalRet    = members.reduce((s,m)=>s+retOf(m),0);
  const totalPL     = totalRet - totalInvest;
  const totalHours  = members.reduce((s,m)=>s+hoursOf(m),0);

  document.getElementById("summary").innerHTML = `
    <div class="summary-main">総損益</div>
    <div class="summary-pl ${signClass(totalPL)}">${signYen(totalPL)}</div>
    <div class="summary-sub">総投資 <b>${yen(totalInvest)}</b> ／ 総回収 <b>${yen(totalRet)}</b></div>`;

  const formula = document.getElementById("formula");
  const body = document.getElementById("resultBody");
  body.innerHTML = "";

  if(n === 0){
    body.innerHTML = `<tr><td colspan="4" class="empty">メンバーを追加してください</td></tr>`;
    document.getElementById("settle").innerHTML = `<div class="empty">—</div>`;
    document.getElementById("prizeWithdraw").innerHTML = `<div class="empty">—</div>`;
    document.getElementById("prizeInfo").textContent = "";
    formula.textContent = "";
    renderBreakdown([], { rule, totalPL, totalHours, n });
    return;
  }

  const hoursFallback = (rule === "R5" && totalHours <= 0);

  let rows = members.map(m => {
    const personalPL = retOf(m) - investOf(m);
    const hrs = hoursOf(m);
    let share;
    let ratio = null;
    if(rule === "R1"){
      share = totalRet / n - investOf(m);
    }else if(rule === "R4"){
      if(totalPL >= 0){
        ratio = totalHours > 0 ? hrs / totalHours : 1 / n;
        share = totalPL * ratio;
      }else{
        share = totalPL / n;
      }
    }else if(rule === "R5"){
      ratio = hoursFallback ? 1 / n : hrs / totalHours;
      share = totalPL * ratio;
    }else{
      share = totalPL / n;
    }
    return { name:m.name, personalPL, share, hrs, ratio };
  });

  // ===== 端数処理（M-1）=====
  rows = settleRounding(rows, totalPL);

  rows.forEach(r => {
    r.personalPL = Math.round(r.personalPL);
    r.settle = r.share - r.personalPL;
  });

  if(rule === "R1"){
    formula.textContent = `式：各人の取り分(損益) = 総回収(${yen(totalRet)}) ÷ 人数(${n}) − 自分の投資`;
  }else if(rule === "R4"){
    if(totalPL >= 0){
      formula.textContent = `式：取り分 = 全体勝ち分(${yen(totalPL)}) × 稼働時間割合（総時間 ${totalHours.toFixed(2)} h）`;
    }else{
      formula.textContent = `全体マイナスのため、損失(${yen(totalPL)})を人数(${n})で均等負担（全員同額の負け）`;
    }
  }else if(rule === "R5"){
    if(hoursFallback){
      formula.textContent = `稼働時間が未入力のため、全体損益(${signYen(totalPL)})を人数(${n})で均等に按分します。`;
    }else{
      formula.textContent = `式：各人の損益 = 全体損益(${signYen(totalPL)}) × 自分の稼働時間 ÷ 総稼働時間(${totalHours.toFixed(2)} h)`;
    }
  }else{
    formula.textContent = `式：清算後損益 = (総回収(${yen(totalRet)}) − 総投資(${yen(totalInvest)})) ÷ 人数(${n})`;
  }

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="メンバー" class="r-name">${escapeHtml(r.name)}</td>
      <td data-label="個人損益" class="r-pl ${signClass(r.personalPL)}">${signYen(r.personalPL)}</td>
      <td data-label="精算" class="r-settle">
        <span class="r-amt ${signClass(r.settle)}">${signYen(r.settle)}<span class="settle-tag">（${settleLabel(r.settle)}）</span></span>
      </td>
      <td data-label="取り分" class="r-share ${signClass(r.share)}">${signYen(r.share)}</td>`;
    body.appendChild(tr);
  });

  renderBreakdown(rows, { rule, totalPL, totalHours, n, hoursFallback });

  const transfers = buildTransfers(rows);
  renderSettlement(transfers);
  renderWithdraw(rows, transfers);
  saveState();
}

// ===== 按分の内訳 =====
function renderBreakdown(rows, ctx){
  const card = document.getElementById("breakdownCard");
  const info = document.getElementById("breakdownInfo");
  const box  = document.getElementById("breakdown");

  if(!ctx || ctx.rule !== "R5"){
    card.style.display = "none";
    box.innerHTML = "";
    info.textContent = "";
    return;
  }

  card.style.display = "block";

  if(rows.length === 0){
    info.textContent = "";
    box.innerHTML = `<div class="empty">メンバーを追加してください</div>`;
    return;
  }

  if(ctx.hoursFallback){
    info.textContent = `稼働時間が未入力のため、全体損益 ${signYen(ctx.totalPL)} を人数 ${ctx.n} 人で均等に分けています。稼働時間を入れると、時間の割合に応じた按分に切り替わります。`;
  }else{
    info.textContent = `全体損益 ${signYen(ctx.totalPL)} を、総稼働時間 ${ctx.totalHours.toFixed(2)} h に対する各自の稼働時間の割合で分けています。稼働が短い人ほど、勝ちも負けも取り分・負担が小さくなります。`;
  }

  box.innerHTML = rows.map(r => {
    const pct = (r.ratio != null ? r.ratio * 100 : (100 / ctx.n));
    const hrsText = ctx.hoursFallback
      ? `均等割り（1 ÷ ${ctx.n}人）`
      : `${r.hrs.toFixed(2)}h ÷ ${ctx.totalHours.toFixed(2)}h`;
    return `
      <div class="breakdown-line">
        <div class="bname">${escapeHtml(r.name)}</div>
        <div class="bcalc">
          <span class="bstep">時間割合：${hrsText} = <b>${pct.toFixed(1)}%</b></span>
          <span class="bstep">取り分：${signYen(ctx.totalPL)} × ${pct.toFixed(1)}% = <b class="${signClass(r.share)}">${signYen(r.share)}</b></span>
          <span class="bstep">個人損益 ${signYen(r.personalPL)} との差 → 精算 <b class="${signClass(r.settle)}">${signYen(r.settle)}</b>（${settleLabel(r.settle)}）</span>
        </div>
      </div>`;
  }).join("");
}

function buildTransfers(rows){
  let creditors = rows.filter(r=>r.settle > 0).map(r=>({name:r.name, amt:r.settle}));
  let debtors   = rows.filter(r=>r.settle < 0).map(r=>({name:r.name, amt:-r.settle}));
  creditors.sort((a,b)=>b.amt-a.amt);
  debtors.sort((a,b)=>b.amt-a.amt);

  const transfers = [];
  let ci = 0, di = 0;
  while(ci < creditors.length && di < debtors.length){
    const c = creditors[ci], d = debtors[di];
    const pay = Math.min(c.amt, d.amt);
    if(pay > 0) transfers.push({ from:d.name, to:c.name, amount:pay });
    c.amt -= pay; d.amt -= pay;
    if(c.amt <= 0) ci++;
    if(d.amt <= 0) di++;
  }
  return transfers;
}

// 取り分を1円単位に丸め、丸め残差を吸収して合計を target に一致させる
function settleRounding(rows, target){
  if(rows.length === 0) return rows;
  const tgt = Math.round(target);
  rows.forEach(r => { r.share = Math.round(r.share); });
  let sum = rows.reduce((s, r) => s + r.share, 0);
  let diff = tgt - sum;
  if(diff !== 0){
    let idx = 0, max = -Infinity;
    rows.forEach((r, i) => {
      if(Math.abs(r.share) > max){ max = Math.abs(r.share); idx = i; }
    });
    rows[idx].share += diff;
  }
  return rows;
}

function renderSettlement(transfers){
  const box = document.getElementById("settle");
  if(!box) return;   // 精算欄を削除した場合は何もしない
  if(transfers.length === 0){
    box.innerHTML = `<div class="empty">精算は不要です（全員ちょうど）</div>`;
    return;
  }
  box.innerHTML = transfers.map(t => `
    <div class="settle-line">
      <div>${escapeHtml(t.from)} → ${escapeHtml(t.to)} に <b>${yen(t.amount)}</b> 渡す</div>
      <div class="prize-detail">${prizeChips(toPrizes(t.amount))}</div>
    </div>`).join("");
}

function renderWithdraw(rows, transfers){
  const box = document.getElementById("prizeWithdraw");
  document.getElementById("prizeInfo").textContent =
    `精算で他の人へ渡す金額を、各メンバーがまとめて引き出す個数です（大景品 ${yen(PRIZE_BIG)} / 中景品 ${yen(PRIZE_MID)}）。支払う総額を目安に、貯メダルに残すか景品交換するか判断できます。`;

  const map = {};
  rows.forEach(r => { map[r.name] = { total:0, to:[] }; });
  transfers.forEach(t => {
    map[t.from].total += t.amount;
    map[t.from].to.push(`${t.to}へ ${yen(t.amount)}`);
  });

  const lines = rows.map(r => {
    const info = map[r.name];
    if(!info || info.total <= 0.5){
      return `
        <div class="withdraw-line">
          <div class="wname">${escapeHtml(r.name)}</div>
          <div class="wnote">引き出し不要（受け取り側）</div>
        </div>`;
    }
    const p = toPrizes(info.total);
    return `
      <div class="withdraw-line">
        <div class="wname">${escapeHtml(r.name)}</div>
        <div class="wpay">支払う総額 <b>${yen(info.total)}</b></div>
        <div class="prize-detail">${prizeChips(p)}</div>
        <div class="wnote">渡す先：${info.to.map(escapeHtml).join(" / ")}</div>
      </div>`;
  });

  box.innerHTML = lines.join("") || `<div class="empty">—</div>`;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function calcAndCards(){
  renderCards();
  calc();
}

// ===== トースト =====
let toastTimer = null;
function showToast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

// ===== セクションを画像化してコピー／保存 =====
async function copySection(selector, label){
  const el = document.querySelector(selector);
  if(!el || typeof html2canvas === "undefined"){
    showToast("画像化に失敗しました");
    return;
  }
  const btn = el.querySelector(".copy-btn");
  btn && btn.classList.add("busy");
  try{
    const canvas = await html2canvas(el, {
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      scale: Math.min(window.devicePixelRatio || 1, 2),
      useCORS: true,
    });
    const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
    if(!blob) throw new Error("blob null");

    if(navigator.clipboard && window.ClipboardItem){
      try{
        await navigator.clipboard.write([ new ClipboardItem({ "image/png": blob }) ]);
        showToast(`「${label}」を画像でコピーしました`);
        return;
      }catch(err){
        // フォールバック
      }
    }
    downloadBlob(blob, label);
    showToast(`「${label}」を画像で保存しました`);
  }catch(e){
    showToast("画像化に失敗しました");
  }finally{
    btn && btn.classList.remove("busy");
  }
}

function downloadBlob(blob, label){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0,16).replace(/[-:T]/g,"");
  a.href = url;
  a.download = `noriuchi_${label}_${stamp}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// コピーボタンのイベントを一括登録（イベント委譲）
// .copy-btn（アイコン）と .report-copy-btn（まとめボタン）の両方に対応
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-copy]");
  if(!btn) return;
  const selector = btn.dataset.copy;
  const label = btn.dataset.copyLabel
    || (document.querySelector(selector)?.dataset.copyLabel)
    || "セクション";
  copySection(selector, label);
});

// ===== イベント =====
document.getElementById("addBtn").onclick = addMember;
document.getElementById("newName").addEventListener("keydown", e => { if(e.key==="Enter") addMember(); });

document.getElementById("rule").onchange = () => {
  renderRuleNote();
  renderCards();
  renderBulkBar();
  calc();
};

document.getElementById("rate").oninput = (e) => {
  rate = parseFloat(e.target.value.replace(/[^0-9.]/g,"")) || 0;
  if(rate > 0){
    document.getElementById("rateExch").value = Math.round(EXCH_BASE / rate);
  }
  document.getElementById("rateNote").textContent = `現在の単価：${rate.toFixed(2)}円/枚 で円換算して計算します。`;
  renderRateSummary();
  calcAndCards();
};

document.getElementById("rateExch").oninput = (e) => {
  const exch = parseInt(e.target.value.replace(/[^0-9]/g,""),10) || 0;
  rate = exch > 0 ? EXCH_BASE / exch : 0;
  document.getElementById("rate").value = rate.toFixed(2);
  document.getElementById("rateNote").textContent =
    `${exch}枚交換 → 単価：${rate.toFixed(2)}円/枚（${EXCH_BASE}円あたり）で計算します。`;
  renderRateSummary();
  calcAndCards();
};

document.getElementById("rateMode").onchange = (e) => {
  rateMode = e.target.checked ? "mai" : "yen";
  renderRateUI();
};

// ===== 交換率アコーディオン =====
const rateCard = document.getElementById("rateCard");
document.getElementById("rateHead").onclick = (e) => {
  if(e.target.closest(".quick-rate")) return;
  if(e.target.closest(".copy-btn")) return;
  rateCard.classList.toggle("open");
  document.getElementById("rateToggle")
    .setAttribute("aria-expanded", rateCard.classList.contains("open"));
};

document.getElementById("rateQuick").oninput = (e) => {
  if(rateMode === "yen"){
    rate = parseFloat(e.target.value.replace(/[^0-9.]/g,"")) || 0;
    document.getElementById("rate").value = rate.toFixed(2);
    if(rate > 0) document.getElementById("rateExch").value = Math.round(EXCH_BASE / rate);
  }else{
    const exch = parseInt(e.target.value.replace(/[^0-9]/g,""),10) || 0;
    rate = exch > 0 ? EXCH_BASE / exch : 0;
    document.getElementById("rateExch").value = exch;
    document.getElementById("rate").value = rate.toFixed(2);
  }
  document.getElementById("rateSummary").textContent =
    `${rate > 0 ? Math.round(EXCH_BASE / rate) : 0}枚交換 / ${rate.toFixed(2)}円`;
  document.getElementById("rateNote").textContent =
    `現在の単価：${rate.toFixed(2)}円/枚 で円換算して計算します。`;
  calcAndCards();
};

// ===== ルールアコーディオン =====
const ruleCard = document.getElementById("ruleCard");
document.getElementById("ruleHead").onclick = (e) => {
  if(e.target.closest(".copy-btn")) return;
  ruleCard.classList.toggle("open");
  document.getElementById("ruleToggle")
    .setAttribute("aria-expanded", ruleCard.classList.contains("open"));
};

// ===== 時刻の一括入力 =====
document.getElementById("bulkCheckAll").onchange = (e) => {
  checkedSet.clear();
  if(e.target.checked){
    members.forEach((_, i) => checkedSet.add(i));
  }
  renderCards();
  renderBulkBar();
};

document.getElementById("bulkStartBtn").onclick = () => {
  applyBulk("start", document.getElementById("bulkStartTime").value);
};
document.getElementById("bulkEndBtn").onclick = () => {
  applyBulk("end", document.getElementById("bulkEndTime").value || nowHHMM());
};

// ===== 個別時刻編集ポップアップ =====
document.getElementById("modalStart").addEventListener("input", updateModalHours);
document.getElementById("modalEnd").addEventListener("input", updateModalHours);
document.getElementById("modalSave").onclick = saveTimeModal;
document.getElementById("modalCancel").onclick = closeTimeModal;
document.getElementById("timeModal").addEventListener("click", (e) => {
  if(e.target.id === "timeModal") closeTimeModal();   // 背景クリックで閉じる
});
document.addEventListener("keydown", (e) => {
  if(e.key === "Escape" && editingIndex !== null) closeTimeModal();
});

function addMember(){
  const inp = document.getElementById("newName");
  const name = inp.value.trim() || String.fromCharCode(65 + members.length);
  members.push({ name, investYen:0, investMai:0, retMai:0, start:DEFAULT_START, end:nowHHMM() });
  inp.value = "";
  render();
}

// ===== 初期化 =====
const restored = loadState();

if(restored){
  document.getElementById("rate").value = rate.toFixed(2);
  if(rate > 0) document.getElementById("rateExch").value = Math.round(EXCH_BASE / rate);
}else{
  members.forEach(m => { if(!m.end) m.end = nowHHMM(); });
  rate = EXCH_BASE / 51;
  document.getElementById("rate").value = rate.toFixed(2);
  document.getElementById("rateExch").value = 51;
}

// 一括バーの終了初期値
document.getElementById("bulkEndTime").value = nowHHMM();

render();
