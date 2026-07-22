/* ========================================
   LLM 试金石 — JavaScript
   ======================================== */

(function () {
  'use strict';

  // ─── DOM refs ───
  const form     = document.getElementById('testForm');
  const urlInput = document.getElementById('baseUrl');
  const keyInput = document.getElementById('apiKey');
  const eyeBtn   = document.getElementById('toggleKey');
  const modelSection = document.getElementById('modelSection');
  const modelSelect  = document.getElementById('modelSelect');
  const modelLoader  = document.getElementById('modelLoader');
  const modelErr     = document.getElementById('modelErr');
  const modelCount   = document.getElementById('modelCount');
  const selectAllBtn = document.getElementById('selectAllModels');
  const clearModelsBtn = document.getElementById('clearModels');
  const fetchModelsBtn = document.getElementById('fetchModelsBtn');
  const submitBtn    = document.getElementById('testBtn');
  const resultArea   = document.getElementById('resultArea');
  const resultInner  = document.getElementById('resultInner');
  const historySection = document.getElementById('historySection');
  const historyBody = document.getElementById('historyBody');
  const exportHistoryBtn = document.getElementById('exportHistory');
  const clearHistoryBtn = document.getElementById('clearHistory');

  // ─── Toggle API Key visibility ───
  eyeBtn.addEventListener('click', () => {
    const isPassword = keyInput.type === 'password';
    keyInput.type = isPassword ? 'text' : 'password';
    eyeBtn.classList.toggle('hidden', !isPassword);
  });

  // ─── Normalize URL ───
  function normalizeUrl(raw) {
    let url = raw.replace(/\/+$/, '');
    url = url.replace(/\/chat\/completions$/, '');
    url = url.replace(/\/v1\/chat\/completions$/, '');
    url = url.replace(/\/v1$/, '');
    return url.replace(/\/+$/, '');
  }

  // ─── Debounce helper ───
  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  // ─── State ───
  const HISTORY_KEY = 'llm_test_history';
  let models = [];
  let fetching = false;
  let historySortState = { key: 'time', direction: 'desc' };

  // ─── Fetch models ───
  async function fetchModels() {
    const rawUrl = urlInput.value.trim();
    const key    = keyInput.value.trim();
    if (!rawUrl || !key) { return []; }

    const base = normalizeUrl(rawUrl);
    const apiUrl = base + '/v1/models';

    modelSection.hidden = false;
    modelSection.classList.remove('error');
    modelSection.classList.add('loading');
    modelErr.textContent = '';
    modelSelect.innerHTML = '';

    fetching = true;

    try {
      const res = await fetch(apiUrl, {
        headers: { 'Authorization': `Bearer ${key}` }
      });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const err = await res.json(); msg = err.error?.message || msg; } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      const items = data.data || [];
      models = items
        .map(m => m.id)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      if (models.length === 0) throw new Error('模型列表为空');

      let saved = null;
      try { saved = JSON.parse(localStorage.getItem('llm_test_config') || 'null'); } catch {}

      // Render select options grouped by provider
      const groups = groupModels(models);
      let fragment = '';
      for (const [group, list] of Object.entries(groups)) {
        fragment += `<optgroup label="${group} (${list.length})">`;
        for (const m of list) {
          fragment += `<option value="${m}">${m}</option>`;
        }
        fragment += '</optgroup>';
      }
      modelSelect.innerHTML = fragment;
      const savedModels = Array.isArray(saved?.model) ? saved.model : (saved?.model ? [saved.model] : []);
      if (savedModels.length > 0) {
        Array.from(modelSelect.options).forEach(option => {
          option.selected = savedModels.includes(option.value);
        });
        if (getSelectedModels().length === 0 && modelSelect.options.length > 0) {
          modelSelect.options[0].selected = true;
        }
      } else if (modelSelect.options.length > 0) {
        modelSelect.options[0].selected = true;
      }
      modelCount.textContent = `${models.length} 个模型`;
      modelSection.classList.remove('loading');
      modelErr.textContent = '';
      if (getSelectedModels().length > 0) enableTestButton();
      else disableTestButton();
      return models;
    } catch (err) {
      modelErr.textContent = '⚠ ' + err.message;
      modelSection.classList.remove('loading');
      modelSection.classList.add('error');
      disableTestButton();
      return [];
    } finally {
      fetching = false;
    }
  }

  // ─── Group models ───
  function groupModels(list) {
    const groups = {};
    for (const m of list) {
      const ml = m.toLowerCase();
      let g = '其他';
      if (/claude|opus|sonnet|haiku|fable/.test(ml)) g = 'Anthropic';
      else if (/gpt|o1|o3|codex/.test(ml)) g = 'OpenAI';
      else if (/deepseek/.test(ml)) g = 'DeepSeek';
      else if (/kimi|moonshot/.test(ml)) g = 'Kimi / Moonshot';
      else if (/glm|chatglm/.test(ml)) g = 'GLM (智谱)';
      else if (/qwen/.test(ml)) g = 'Qwen (千问)';
      else if (/grok/.test(ml)) g = 'Grok';
      else if (/gemini/.test(ml)) g = 'Gemini';
      else if (/mimo/.test(ml)) g = 'Mimo';
      else if (/hy3/.test(ml)) g = 'Hy3';
      else if (/nemotron/.test(ml)) g = 'Nemotron';
      else if (/north/.test(ml)) g = 'North';
      else if (/llama/.test(ml)) g = 'Llama';
      else if (/ernie/.test(ml)) g = 'Ernie (文心)';
      (groups[g] = groups[g] || []).push(m);
    }
    return groups;
  }

  // ─── Enable / disable ───
  function enableTestButton() {
    submitBtn.disabled = false;
  }

  function disableTestButton() {
    submitBtn.disabled = true;
  }

  function updateFetchButton() {
    fetchModelsBtn.disabled = !(urlInput.value.trim() && keyInput.value.trim());
  }

  function resetModelsForChangedConfig() {
    models = [];
    modelSelect.innerHTML = '';
    modelCount.textContent = '';
    modelErr.textContent = '';
    modelSection.hidden = true;
    disableTestButton();
    updateFetchButton();
  }

  function showResult(success, msg, detail) {
    resultArea.hidden = false;
    resultArea.className = 'result ' + (success ? 'success' : 'error');

    const icon = success ? '✓' : '✖';
    resultInner.innerHTML = `<span class="icon">${icon}</span> ${escapeHtml(msg)}`;
    if (detail) {
      resultInner.innerHTML += `<span class="detail">${escapeHtml(detail)}</span>`;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getSelectedModels() {
    return Array.from(modelSelect.selectedOptions).map(option => option.value).filter(Boolean);
  }

  function estimateTokens(text) {
    const value = String(text || '').trim();
    if (!value) return 0;
    const chineseChars = (value.match(/[一-鿿]/g) || []).length;
    const asciiWords = (value.replace(/[一-鿿]/g, ' ').match(/[A-Za-z0-9_]+/g) || []).length;
    return Math.max(1, Math.round(chineseChars + asciiWords * 1.3));
  }

  function formatSpeed(value) {
    if (!Number.isFinite(value) || value <= 0) return '-';
    return `${value.toFixed(1)} tok/s`;
  }

  function renderRealtimeResults(selectedModels) {
    resultArea.hidden = false;
    resultArea.className = 'result success';

    const items = selectedModels.map((model, index) => `
      <div class="result-item pending" id="result-item-${index}">
        <span class="result-model">⏳ ${escapeHtml(model)}</span>
        <span class="result-reply">等待测试结果…</span>
      </div>
    `).join('');

    resultInner.innerHTML = `
      <div class="result-summary" id="resultSummary">串行测试中：0 / ${selectedModels.length} 完成，0 个成功，0 个失败</div>
      <div class="result-list">${items}</div>
    `;
  }

  function updateRealtimeResult(result, index, stats, total, finished = false) {
    const item = document.getElementById(`result-item-${index}`);
    if (item) {
      item.className = `result-item ${result.ok ? 'ok' : 'bad'}`;
      item.innerHTML = `
        <span class="result-model">${result.ok ? '✓' : '✖'} ${escapeHtml(result.model)} · ${escapeHtml(formatSpeed(result.tokensPerSecond))}</span>
        <span class="result-reply">${escapeHtml(result.message)}</span>
      `;
    }

    const summary = document.getElementById('resultSummary');
    if (summary) {
      const prefix = finished ? '测试完成' : '串行测试中';
      summary.textContent = `${prefix}：${stats.completed} / ${total} 完成，${stats.ok} 个成功，${stats.bad} 个失败`;
    }

    resultArea.className = 'result ' + (stats.bad === 0 ? 'success' : 'error');
  }

  function renderBatchResults(results) {
    const ok = results.filter(r => r.ok).length;
    const bad = results.length - ok;
    resultArea.className = 'result ' + (bad === 0 ? 'success' : 'error');

    const summary = document.getElementById('resultSummary');
    if (summary) {
      summary.textContent = `测试完成：${results.length} / ${results.length} 完成，${ok} 个成功，${bad} 个失败`;
    }
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 500)));
  }

  function formatTime(value) {
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
  }

  function truncateText(value, maxLength = 80) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  }

  function addHistoryRecord(result) {
    const history = loadHistory();
    history.unshift({
      model: result.model,
      time: new Date().toISOString(),
      ok: result.ok,
      tokens: result.tokens || 0,
      elapsedSeconds: result.elapsedSeconds || 0,
      tokensPerSecond: result.tokensPerSecond || 0,
      message: result.message
    });
    saveHistory(history);
    renderHistory();
  }

  function updateSortHeader() {
    document.querySelectorAll('.th-sort').forEach(button => {
      const arrow = button.querySelector('.sort-arrow');
      const isActive = button.dataset.sort === historySortState.key;
      button.classList.toggle('active', isActive);
      if (arrow) {
        arrow.dataset.arrow = isActive ? (historySortState.direction === 'asc' ? '↑' : '↓') : '';
      }
    });
  }

  function getDisplayHistoryRows() {
    const history = loadHistory();
    const latestByModel = [];
    const seenModels = new Set();
    for (const row of history) {
      if (seenModels.has(row.model)) continue;
      seenModels.add(row.model);
      latestByModel.push(row);
    }

    latestByModel.sort((a, b) => {
      let result = 0;
      if (historySortState.key === 'model') {
        result = String(a.model || '').localeCompare(String(b.model || ''));
      } else if (historySortState.key === 'time') {
        result = new Date(a.time) - new Date(b.time);
      } else if (historySortState.key === 'ok') {
        result = Number(a.ok) - Number(b.ok);
      } else if (historySortState.key === 'speed') {
        result = Number(a.tokensPerSecond || 0) - Number(b.tokensPerSecond || 0);
      } else if (historySortState.key === 'message') {
        result = String(a.message || '').localeCompare(String(b.message || ''));
      }
      return historySortState.direction === 'asc' ? result : -result;
    });

    return latestByModel;
  }

  function renderHistory() {
    const latestByModel = getDisplayHistoryRows();
    updateSortHeader();

    historySection.hidden = latestByModel.length === 0;
    if (latestByModel.length === 0) {
      historyBody.innerHTML = '';
      return;
    }

    historyBody.innerHTML = latestByModel.map(row => `
      <tr>
        <td class="history-model">${escapeHtml(row.model)}</td>
        <td class="history-time">${escapeHtml(formatTime(row.time))}</td>
        <td><span class="badge ${row.ok ? 'ok' : 'bad'}">${row.ok ? '成功' : '失败'}</span></td>
        <td class="history-speed">${escapeHtml(formatSpeed(row.tokensPerSecond))}</td>
        <td class="history-msg" title="${escapeHtml(row.message || '')}"><span class="history-msg-text">${escapeHtml(row.message || '')}</span></td>
      </tr>
    `).join('');
  }

  function exportHistoryCsv() {
    const history = getDisplayHistoryRows();
    if (history.length === 0) return;

    const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['模型', '测试时间', '是否成功', '速度(token/s)', '输出tokens', '耗时秒', '回复/错误'],
      ...history.map(row => [
        row.model,
        formatTime(row.time),
        row.ok ? '成功' : '失败',
        Number(row.tokensPerSecond || 0).toFixed(1),
        row.tokens || 0,
        Number(row.elapsedSeconds || 0).toFixed(3),
        row.message || ''
      ])
    ];
    const csv = '﻿' + rows.map(row => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `llm-test-history-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ─── URL / Key change: only enable the manual fetch button ───
  urlInput.addEventListener('input', resetModelsForChangedConfig);
  keyInput.addEventListener('input', resetModelsForChangedConfig);

  // ─── Save to localStorage ───
  function saveConfig() {
    try {
      localStorage.setItem('llm_test_config', JSON.stringify({
        base_url: urlInput.value.trim(),
        api_key: keyInput.value.trim(),
        model: getSelectedModels()
      }));
    } catch {}
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem('llm_test_config');
      if (!raw) return;
      const cfg = JSON.parse(raw);
      if (cfg.base_url) urlInput.value = cfg.base_url;
      if (cfg.api_key)  keyInput.value  = cfg.api_key;
      if (cfg.model)    cfg._savedModel = cfg.model; // saved for after fetch
      return cfg;
    } catch { return null; }
  }

  async function testOneModel(apiUrl, key, model) {
    const startedAt = performance.now();
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: '你是一个用于连接测试的助手。请用一句简短中文回复。' },
            { role: 'user', content: '你好，请回复一句话。' }
          ],
          temperature: 0,
          max_tokens: 80
        })
      });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const err = await res.json();
          msg = err.error?.message || msg;
        } catch {}
        const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
        return { ok: false, model, message: msg, tokens: 0, elapsedSeconds, tokensPerSecond: 0 };
      }

      const data = await res.json();
      const choices = data.choices;
      if (!choices || choices.length === 0) {
        const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
        return { ok: false, model, message: '服务有响应，但没有返回 choices 字段', tokens: 0, elapsedSeconds, tokensPerSecond: 0 };
      }

      const reply = (choices[0].message?.content || '').trim();
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
      const tokens = data.usage?.completion_tokens || estimateTokens(reply);
      const tokensPerSecond = tokens / elapsedSeconds;
      if (reply) {
        return { ok: true, model, message: reply, tokens, elapsedSeconds, tokensPerSecond };
      }
      return { ok: false, model, message: '服务有响应，但回复内容为空', tokens: 0, elapsedSeconds, tokensPerSecond: 0 };
    } catch (err) {
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
      return { ok: false, model, message: err.message || '请求异常', tokens: 0, elapsedSeconds, tokensPerSecond: 0 };
    }
  }

  // ─── Submit: test connection ───
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const rawUrl = urlInput.value.trim();
    const key    = keyInput.value.trim();
    const selectedModels = getSelectedModels();

    if (!rawUrl || !key) {
      showResult(false, '请填写 Base URL 和 API Key');
      return;
    }

    if (selectedModels.length === 0) {
      showResult(false, '请至少选择一个模型');
      return;
    }

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    resultArea.hidden = true;

    const base = normalizeUrl(rawUrl);
    const apiUrl = base + '/v1/chat/completions';

    try {
      renderRealtimeResults(selectedModels);

      const stats = { completed: 0, ok: 0, bad: 0 };
      const results = new Array(selectedModels.length);

      for (let index = 0; index < selectedModels.length; index++) {
        const model = selectedModels[index];
        const result = await testOneModel(apiUrl, key, model);
        results[index] = result;
        stats.completed += 1;
        if (result.ok) stats.ok += 1;
        else stats.bad += 1;
        updateRealtimeResult(result, index, stats, selectedModels.length, false);
        addHistoryRecord(result);
      }

      renderBatchResults(results);
    } catch (err) {
      showResult(false, '连接失败', err.message);
    } finally {
      submitBtn.classList.remove('loading');
      // Re-enable if at least one model is still selected
      if (models.length > 0 && getSelectedModels().length > 0) submitBtn.disabled = false;
    }

    saveConfig();
  });

  // ─── Fetch models button ───
  fetchModelsBtn.addEventListener('click', async () => {
    if (fetching) return;
    if (!urlInput.value.trim() || !keyInput.value.trim()) {
      showResult(false, '请先填写 Base URL 和 API Key');
      return;
    }

    resultArea.hidden = true;
    fetchModelsBtn.disabled = true;
    fetchModelsBtn.textContent = '正在获取…';

    try {
      await fetchModels();
      saveConfig();
    } finally {
      fetchModelsBtn.textContent = '重新获取模型列表';
      updateFetchButton();
    }
  });

  // ─── Select actions ───
  selectAllBtn.addEventListener('click', () => {
    Array.from(modelSelect.options).forEach(option => { option.selected = true; });
    saveConfig();
    enableTestButton();
  });

  clearModelsBtn.addEventListener('click', () => {
    Array.from(modelSelect.options).forEach(option => { option.selected = false; });
    saveConfig();
    disableTestButton();
  });

  modelSelect.addEventListener('change', () => {
    saveConfig();
    if (getSelectedModels().length > 0) enableTestButton();
    else disableTestButton();
  });

  clearHistoryBtn.addEventListener('click', () => {
    if (!confirm('确定清空所有测试记录吗？')) return;
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  });

  exportHistoryBtn.addEventListener('click', exportHistoryCsv);

  document.querySelectorAll('.th-sort').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.sort;
      if (historySortState.key === key) {
        historySortState.direction = historySortState.direction === 'asc' ? 'desc' : 'asc';
      } else {
        historySortState.key = key;
        historySortState.direction = key === 'time' ? 'desc' : 'asc';
      }
      renderHistory();
    });
  });

  // ─── Load saved Base URL / API Key only; models are fetched manually ───
  loadConfig();
  updateFetchButton();
  renderHistory();

})();
