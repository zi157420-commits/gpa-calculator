/* eslint-disable no-alert */
(() => {
  const STORAGE_KEY = "gpa_calc_v1";

  /** @typedef {{id:string,name:string,credit:number|null,letter:string,include:boolean}} Course */
  /** @typedef {{letter:string, point:number|null}} Rule */

  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);

  const defaultRules = () => [
    { letter: "A+", point: 4.0 },
    { letter: "A", point: 4.0 },
    { letter: "A-", point: 3.7 },
    { letter: "B+", point: 3.3 },
    { letter: "B", point: 3.0 },
    { letter: "B-", point: 2.7 },
    { letter: "C+", point: 2.3 },
    { letter: "C", point: 2.0 },
    { letter: "C-", point: 1.7 },
    { letter: "D+", point: 1.3 },
    { letter: "D", point: 1.0 },
    { letter: "F", point: 0.0 },
  ];

  const uid = () => {
    // Good enough for local-only app.
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  };

  /** @type {{courses: Course[], rules: Rule[], precision: number}} */
  let state = {
    courses: [],
    rules: defaultRules(),
    precision: 2,
  };

  const normalizeLetter = (s) => (s ?? "").trim().toUpperCase();

  const buildRuleMap = (rules) => {
    /** @type {Record<string, number>} */
    const map = {};
    for (const r of rules) {
      const letter = normalizeLetter(r.letter);
      const point = typeof r.point === "number" && Number.isFinite(r.point) ? r.point : null;
      if (!letter || point === null) continue;
      map[letter] = point;
    }
    return map;
  };

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage errors (e.g. private mode)
    }
  };

  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.courses)) state.courses = parsed.courses;
        if (Array.isArray(parsed.rules)) state.rules = parsed.rules;
        if (typeof parsed.precision === "number") state.precision = parsed.precision;
      }
    } catch {
      // Ignore parse errors
    }
  };

  const formatNum = (n, digits = state.precision) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—";
    return n.toFixed(digits);
  };

  const parseCredit = (s) => {
    const n = Number(String(s).trim());
    if (!Number.isFinite(n)) return null;
    if (n <= 0) return null;
    return n;
  };

  const compute = () => {
    const ruleMap = buildRuleMap(state.rules);
    let credits = 0;
    let quality = 0;
    let excluded = 0;

    /** @type {string[]} */
    const errors = [];

    for (const c of state.courses) {
      const name = (c.name ?? "").trim();
      const letter = normalizeLetter(c.letter);
      const credit = typeof c.credit === "number" ? c.credit : null;
      if (!c.include) {
        excluded += 1;
        continue;
      }
      if (!name) {
        errors.push("有课程未填写课程名。");
      }
      if (credit === null || !Number.isFinite(credit) || credit <= 0) {
        errors.push(`课程“${name || "未命名"}”学分不合法。`);
        continue;
      }
      if (!letter) {
        errors.push(`课程“${name || "未命名"}”未选择字母成绩。`);
        continue;
      }
      if (!(letter in ruleMap)) {
        errors.push(`字母成绩“${letter}”在规则中不存在（课程：${name || "未命名"}）。`);
        continue;
      }
      credits += credit;
      quality += ruleMap[letter] * credit;
    }

    return { credits, quality, gpa: credits > 0 ? quality / credits : null, excluded, errors };
  };

  const downloadText = (filename, text, mime = "text/plain") => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const escapeCsv = (value) => {
    const s = String(value ?? "");
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const parseCsvLine = (line) => {
    // Minimal CSV parser: handles commas + double quotes.
    /** @type {string[]} */
    const out = [];
    let i = 0;
    let cur = "";
    let inQuotes = false;
    while (i < line.length) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        if (ch === '"') {
          inQuotes = false;
          i += 1;
          continue;
        }
        cur += ch;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (ch === ",") {
        out.push(cur);
        cur = "";
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };

  const render = () => {
    renderCourses();
    renderResult();
    save();
  };

  const renderResult = () => {
    const r = compute();
    const gpaEl = $("gpaValue");
    const hintEl = $("gpaHint");
    const includedCreditsEl = $("includedCredits");
    const qualityEl = $("qualityPoints");
    const excludedEl = $("excludedCount");
    const validationEl = $("validationArea");

    includedCreditsEl.textContent = formatNum(r.credits, 2);
    qualityEl.textContent = formatNum(r.quality, 2);
    excludedEl.textContent = String(r.excluded);

    if (r.gpa === null) {
      gpaEl.textContent = "—";
      hintEl.textContent = r.errors.length ? "请先修正下方提示" : "添加课程后自动计算";
    } else {
      gpaEl.textContent = formatNum(r.gpa);
      hintEl.textContent = r.errors.length ? "已计算，但存在可修正项" : "实时更新";
    }

    if (r.errors.length) {
      const uniq = Array.from(new Set(r.errors));
      validationEl.innerHTML =
        `<div class="error">需要注意：</div><ul>` +
        uniq.map((e) => `<li>${e}</li>`).join("") +
        `</ul>`;
    } else {
      validationEl.innerHTML = `<div class="muted">提示：不计入 GPA 的课程不会参与计算。</div>`;
    }
  };

  const getRuleLettersSorted = () => {
    // Preserve user order if possible; also ensure unique letters show.
    const seen = new Set();
    /** @type {string[]} */
    const letters = [];
    for (const r of state.rules) {
      const l = normalizeLetter(r.letter);
      if (!l || seen.has(l)) continue;
      seen.add(l);
      letters.push(l);
    }
    if (!letters.length) letters.push("A", "B", "C", "D", "F");
    return letters;
  };

  const renderCourses = () => {
    const tbody = $("coursesTbody");
    tbody.innerHTML = "";
    const letters = getRuleLettersSorted();

    for (const course of state.courses) {
      const tr = el("tr");

      const nameTd = el("td");
      const nameInput = el("input", {
        className: "input",
        value: course.name ?? "",
        placeholder: "如：高等数学",
      });
      nameInput.addEventListener("input", () => {
        course.name = nameInput.value;
        renderResult();
        save();
      });
      nameTd.appendChild(nameInput);

      const creditTd = el("td");
      const creditInput = el("input", {
        className: "input",
        value: course.credit ?? "",
        inputMode: "decimal",
        placeholder: "3",
      });
      creditInput.addEventListener("input", () => {
        course.credit = parseCredit(creditInput.value);
        renderResult();
        save();
      });
      creditTd.appendChild(creditInput);

      const letterTd = el("td");
      const letterSelect = el("select", { className: "select" });
      letterSelect.appendChild(el("option", { value: "", textContent: "选择…" }));
      for (const l of letters) {
        letterSelect.appendChild(el("option", { value: l, textContent: l }));
      }
      letterSelect.value = normalizeLetter(course.letter);
      letterSelect.addEventListener("change", () => {
        course.letter = normalizeLetter(letterSelect.value);
        renderResult();
        save();
      });
      letterTd.appendChild(letterSelect);

      const includeTd = el("td");
      const pill = el("div", { className: "pill" });
      const toggle = el("div", { className: "toggle" });
      toggle.dataset.on = course.include ? "true" : "false";
      const includeLabel = el("span", { textContent: course.include ? "计入" : "不计入" });
      const syncToggle = () => {
        toggle.dataset.on = course.include ? "true" : "false";
        includeLabel.textContent = course.include ? "计入" : "不计入";
      };
      toggle.addEventListener("click", () => {
        course.include = !course.include;
        syncToggle();
        renderResult();
        save();
      });
      pill.appendChild(toggle);
      pill.appendChild(includeLabel);
      includeTd.appendChild(pill);

      const actionsTd = el("td");
      const actions = el("div", { className: "cell-actions" });
      const delBtn = el("button", { className: "btn btn--ghost", type: "button", textContent: "删除" });
      delBtn.addEventListener("click", () => {
        state.courses = state.courses.filter((x) => x.id !== course.id);
        render();
      });
      actions.appendChild(delBtn);
      actionsTd.appendChild(actions);

      tr.appendChild(nameTd);
      tr.appendChild(creditTd);
      tr.appendChild(letterTd);
      tr.appendChild(includeTd);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    }

    if (state.courses.length === 0) {
      const tr = el("tr");
      const td = el("td", { colSpan: 5, className: "muted" });
      td.style.padding = "1rem";
      td.textContent = "还没有课程，点击“+ 添加课程”。";
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  };

  const openRulesDialog = () => {
    const dialog = $("rulesDialog");
    renderRulesEditor();
    dialog.showModal();
  };

  const closeRulesDialog = () => {
    const dialog = $("rulesDialog");
    if (dialog.open) dialog.close();
  };

  const renderRulesEditor = () => {
    const tbody = $("rulesTbody");
    const validationEl = $("rulesValidationArea");
    tbody.innerHTML = "";
    validationEl.innerHTML = "";

    /** @type {Rule[]} */
    const draft = state.rules.map((r) => ({ letter: r.letter ?? "", point: r.point ?? null }));
    tbody.dataset.draft = JSON.stringify(draft);

    const getDraft = () => {
      try {
        const raw = tbody.dataset.draft || "[]";
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };
    const setDraft = (d) => {
      tbody.dataset.draft = JSON.stringify(d);
    };
    const validateDraft = () => {
      const d = getDraft();
      /** @type {string[]} */
      const errs = [];
      const seen = new Set();
      for (const r of d) {
        const letter = normalizeLetter(r.letter);
        if (!letter) {
          errs.push("有规则未填写字母。");
          continue;
        }
        if (seen.has(letter)) {
          errs.push(`字母“${letter}”重复（保存时会自动合并，以最后一次为准）。`);
        }
        seen.add(letter);
        const p = typeof r.point === "number" ? r.point : Number(String(r.point ?? "").trim());
        if (!Number.isFinite(p)) {
          errs.push(`字母“${letter}”的绩点不是数字。`);
        }
      }
      if (!d.length) errs.push("规则为空：至少添加一条字母成绩规则。");
      const uniq = Array.from(new Set(errs));
      if (uniq.length) {
        validationEl.innerHTML = `<div class="error">规则提示：</div><ul>${uniq
          .map((e) => `<li>${e}</li>`)
          .join("")}</ul>`;
      } else {
        validationEl.innerHTML = `<div class="muted">提示：保存后会立即应用到课程选择列表。</div>`;
      }
      return { ok: uniq.filter((e) => e.includes("不是数字") || e.includes("为空")).length === 0, msgs: uniq };
    };

    const addRow = (rule, idx) => {
      const tr = el("tr");

      const letterTd = el("td");
      const letterInput = el("input", { className: "input", value: rule.letter ?? "", placeholder: "如：A-" });
      letterInput.addEventListener("input", () => {
        const d = getDraft();
        d[idx].letter = letterInput.value;
        setDraft(d);
        validateDraft();
      });
      letterTd.appendChild(letterInput);

      const pointTd = el("td");
      const pointInput = el("input", {
        className: "input",
        value: rule.point ?? "",
        inputMode: "decimal",
        placeholder: "如：3.7",
      });
      pointInput.addEventListener("input", () => {
        const d = getDraft();
        const n = Number(String(pointInput.value).trim());
        d[idx].point = Number.isFinite(n) ? n : null;
        setDraft(d);
        validateDraft();
      });
      pointTd.appendChild(pointInput);

      const actionsTd = el("td");
      const delBtn = el("button", { className: "btn btn--ghost", type: "button", textContent: "删除" });
      delBtn.addEventListener("click", () => {
        const d = getDraft();
        d.splice(idx, 1);
        setDraft(d);
        renderRulesEditorFromDraft(d);
      });
      actionsTd.appendChild(delBtn);

      tr.appendChild(letterTd);
      tr.appendChild(pointTd);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    };

    const renderRulesEditorFromDraft = (d) => {
      tbody.innerHTML = "";
      setDraft(d);
      d.forEach(addRow);
      validateDraft();
    };

    // Expose helper by binding to DOM function property.
    tbody._renderFromDraft = renderRulesEditorFromDraft; // non-standard, local-only

    renderRulesEditorFromDraft(draft);
  };

  const getDraftRulesFromDialog = () => {
    const tbody = $("rulesTbody");
    try {
      const raw = tbody.dataset.draft || "[]";
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const applyRulesFromDialog = () => {
    const draft = getDraftRulesFromDialog();
    /** @type {Rule[]} */
    const cleaned = [];
    for (const r of draft) {
      const letter = normalizeLetter(r.letter);
      if (!letter) continue;
      const p = typeof r.point === "number" ? r.point : Number(String(r.point ?? "").trim());
      if (!Number.isFinite(p)) continue;
      cleaned.push({ letter, point: p });
    }
    if (!cleaned.length) return { ok: false, reason: "规则为空或无有效绩点。" };

    // De-duplicate by keeping last occurrence.
    const map = new Map();
    for (const r of cleaned) map.set(r.letter, r.point);
    state.rules = Array.from(map.entries()).map(([letter, point]) => ({ letter, point }));

    // Ensure course letters still valid; keep value but may become invalid until user updates.
    render();
    return { ok: true };
  };

  const addCourse = () => {
    /** @type {Course} */
    const c = { id: uid(), name: "", credit: null, letter: "", include: true };
    state.courses.unshift(c);
    render();
    // Focus first input after render.
    requestAnimationFrame(() => {
      const first = document.querySelector("#coursesTbody input.input");
      if (first) first.focus();
    });
  };

  const resetAll = () => {
    state = { courses: [], rules: defaultRules(), precision: state.precision ?? 2 };
    render();
  };

  const exportJson = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      ...state,
    };
    downloadText(
      `gpa-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  };

  const exportCsv = () => {
    const rows = [["课程名", "学分", "字母成绩", "是否计入"]];
    for (const c of state.courses) {
      rows.push([c.name ?? "", c.credit ?? "", normalizeLetter(c.letter), c.include ? "true" : "false"]);
    }
    const text = rows.map((r) => r.map(escapeCsv).join(",")).join("\n");
    downloadText(`gpa-courses-${new Date().toISOString().slice(0, 10)}.csv`, text, "text/csv");
  };

  const readFileText = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsText(file);
    });

  const importJsonFile = async (file) => {
    const text = await readFileText(file);
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("JSON 不是对象。");
    const next = parsed.courses || parsed.state?.courses;
    const rules = parsed.rules || parsed.state?.rules;
    const precision = parsed.precision ?? parsed.state?.precision;

    if (Array.isArray(next)) state.courses = next;
    if (Array.isArray(rules)) state.rules = rules;
    if (typeof precision === "number") state.precision = precision;
    render();
  };

  const toBool = (v) => {
    const s = String(v ?? "").trim().toLowerCase();
    if (s === "1" || s === "true" || s === "yes" || s === "y") return true;
    if (s === "0" || s === "false" || s === "no" || s === "n") return false;
    return true; // default include
  };

  const importCsvFile = async (file) => {
    const text = await readFileText(file);
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (!lines.length) return;
    // Allow optional header row.
    const startIdx = lines[0].includes("课程") ? 1 : 0;
    /** @type {Course[]} */
    const imported = [];
    for (let i = startIdx; i < lines.length; i += 1) {
      const cols = parseCsvLine(lines[i]);
      const name = cols[0] ?? "";
      const credit = parseCredit(cols[1] ?? "");
      const letter = normalizeLetter(cols[2] ?? "");
      const include = toBool(cols[3] ?? "true");
      imported.push({ id: uid(), name, credit, letter, include });
    }
    state.courses = imported.concat(state.courses);
    render();
  };

  const copyResult = async () => {
    const r = compute();
    const gpa = r.gpa === null ? "—" : formatNum(r.gpa);
    const txt = `GPA: ${gpa}\n计入学分: ${formatNum(r.credits, 2)}\n加权绩点总和: ${formatNum(r.quality, 2)}\n不计入课程: ${r.excluded}`;
    try {
      await navigator.clipboard.writeText(txt);
      $("btnCopy").textContent = "已复制";
      setTimeout(() => {
        $("btnCopy").textContent = "复制结果";
      }, 900);
    } catch {
      alert(txt);
    }
  };

  const wire = () => {
    $("btnAddCourse").addEventListener("click", addCourse);
    $("btnReset").addEventListener("click", () => {
      if (confirm("确定清空课程与规则吗？")) resetAll();
    });
    $("btnOpenRules").addEventListener("click", openRulesDialog);
    $("btnCloseRules").addEventListener("click", closeRulesDialog);
    $("btnCancelRules").addEventListener("click", closeRulesDialog);

    $("btnAddRule").addEventListener("click", () => {
      const tbody = $("rulesTbody");
      const draft = getDraftRulesFromDialog();
      draft.push({ letter: "", point: null });
      if (typeof tbody._renderFromDraft === "function") tbody._renderFromDraft(draft);
    });

    $("btnResetDefaultRules").addEventListener("click", () => {
      const tbody = $("rulesTbody");
      const draft = defaultRules();
      if (typeof tbody._renderFromDraft === "function") tbody._renderFromDraft(draft);
    });

    $("rulesForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const res = applyRulesFromDialog();
      if (!res.ok) {
        $("rulesValidationArea").innerHTML = `<div class="error">无法保存：${res.reason || "规则不合法"}</div>`;
        return;
      }
      closeRulesDialog();
    });

    $("precisionSelect").addEventListener("change", () => {
      state.precision = Number($("precisionSelect").value) || 2;
      renderResult();
      save();
    });

    $("btnCopy").addEventListener("click", copyResult);
    $("btnExportJson").addEventListener("click", exportJson);
    $("btnExportCsv").addEventListener("click", exportCsv);

    $("fileImportJson").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        await importJsonFile(file);
      } catch (err) {
        alert(`导入失败：${err?.message || String(err)}`);
      }
    });

    $("fileImportCsv").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        await importCsvFile(file);
      } catch (err) {
        alert(`导入失败：${err?.message || String(err)}`);
      }
    });
  };

  const init = () => {
    load();
    $("precisionSelect").value = String(state.precision ?? 2);
    wire();
    if (!state.courses.length) {
      // Start with one row for better UX.
      addCourse();
    } else {
      render();
    }
  };

  init();
})();

