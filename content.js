// ==========================================
// content.js - v21.4 (Tooltip Visibility Fix)
// ==========================================

// Global Variables
let selectedElement = null;
let isSelectMode = false;
let floatingPanel = null;
let figmaToken = '';
let currentFigmaData = null;
let hoverBox = null;
let currentHoveredElement = null;
let bugReportData = ""; 
let diffMarkers = [];
let isHoverFrozen = false; 

// State
let overlayState = {
  opacity: 0.8,
  offsetX: 0,
  offsetY: 0,
  scale: 1.0,
  mode: 'onion', 
  swipeX: 50,
  showMarkers: true
};

// ==========================================
// 1. 初始化 & 样式注入
// ==========================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'togglePanel') {
    if (!floatingPanel) init();
    else {
      const isHidden = floatingPanel.style.display === 'none';
      floatingPanel.style.display = isHidden ? 'flex' : 'none';
      if (!isHidden) cleanupVisuals();
    }
  }
  sendResponse({ success: true });
});

function init() {
  if (floatingPanel) return;
  injectStyles();
  chrome.storage.local.get(['figma_token'], (res) => {
    if (res.figma_token) figmaToken = res.figma_token;
  });
  createFloatingPanel();
  document.addEventListener('keydown', handleKeyboardShortcuts);
}

function injectStyles() {
  if (document.getElementById('figma-diff-styles')) return;
  const style = document.createElement('style');
  style.id = 'figma-diff-styles';
  style.textContent = `
    /* Reset & Base */
    .f-node { position: absolute; box-sizing: border-box; transform-origin: 0 0; }
    .f-text { display: flex; white-space: pre-wrap; overflow: visible; }
    .f-svg-wrap { width: 100%; height: 100%; display: block; pointer-events: none; overflow: visible; }
    #diff-overlay-container { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 2147483646; transition: opacity 0.1s; }
    
    /* Panel Table Styles */
    .diff-row { display: flex; align-items: center; padding: 8px 4px; border-bottom: 1px solid #F5F5F7; font-size: 12px; line-height: 1.4; color: #1d1d1f; }
    .diff-row.error { background: rgba(255, 59, 48, 0.05); }
    .diff-row.section { background: #F5F5F7; font-weight: 600; padding: 6px 8px; margin-top: 12px; color: #86868b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 4px; }
    .diff-row.header { font-weight: 600; color: #86868b; font-size: 11px; padding-bottom: 4px; border-bottom: 1px solid #E5E5EA; position: sticky; top: 0; background: rgba(255,255,255,0.95); backdrop-filter: blur(5px); z-index: 10; }
    
    /* Table Columns */
    .col-label { flex: 0 0 70px; color: #86868b; }
    .col-dom { flex: 1; text-align: right; margin-right: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #1d1d1f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .col-figma { flex: 1; text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #34C759; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .diff-row.error .col-dom { color: #FF3B30; text-decoration: line-through; opacity: 0.7; }

    /* iOS Toggle Switch */
    .ios-switch { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
    .ios-switch input { opacity: 0; width: 0; height: 0; }
    .ios-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #E9E9EA; transition: .3s cubic-bezier(0.25, 0.1, 0.25, 1); border-radius: 20px; }
    .ios-slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s cubic-bezier(0.25, 0.1, 0.25, 1); border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
    input:checked + .ios-slider { background-color: #34C759; }
    input:checked + .ios-slider:before { transform: translateX(16px); }

    /* Markers - Fixed Visibility */
    .diff-marker-dot { 
        position: fixed; width: 18px; height: 18px; 
        background: #FF3B30; border: 1.5px solid rgba(255,255,255,0.9); 
        border-radius: 50%; box-shadow: 0 2px 8px rgba(255, 59, 48, 0.4); 
        z-index: 2147483647; 
        display: flex; align-items: center; justify-content: center; 
        color: white; font-weight: 700; font-size: 11px; font-family: -apple-system, sans-serif; 
        cursor: help; pointer-events: auto; 
        transform: scale(0); animation: popIn 0.3s forwards;
        overflow: visible !important; /* [Fix] Prevent clipping */
    }
    @keyframes popIn { to { transform: scale(1); } }
    
    /* Tooltip Default (Upwards) */
    .diff-marker-tooltip { 
        position: absolute; bottom: 32px; left: 50%; /* [Fix] Increased distance from 24px to 32px */
        transform: translateX(-50%) translateY(4px); 
        background: rgba(29, 29, 31, 0.95); backdrop-filter: blur(10px); 
        color: white; padding: 6px 10px; border-radius: 8px; 
        font-size: 12px; line-height: 1.4; white-space: pre; text-align: center; 
        opacity: 0; pointer-events: none; transition: all 0.2s ease; 
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); visibility: hidden; 
        z-index: 200; /* [Fix] Ensure on top of marker content */
    }
    
    /* Tooltip Flipped (Downwards) */
    .diff-marker-tooltip.position-bottom {
        bottom: auto; top: 32px; /* [Fix] Increased distance */
        transform: translateX(-50%) translateY(-4px);
    }

    .diff-marker-dot:hover { z-index: 2147483648; transform: scale(1.1); }
    .diff-marker-dot:hover .diff-marker-tooltip { opacity: 1; transform: translateX(-50%) translateY(0); visibility: visible; }
  `;
  document.head.appendChild(style);
}

// ==========================================
// 2. 面板构建
// ==========================================

function createFloatingPanel() {
  const existing = document.getElementById('diff-checker-panel');
  if (existing) { floatingPanel = existing; return; }

  const p = document.createElement('div');
  p.id = 'diff-checker-panel';
  p.style.cssText = `position: fixed; top: 30px; right: 30px; width: 340px; background: rgba(255,255,255,0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.1); z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, sans-serif; overflow:hidden; display:flex; flex-direction:column; max-height: 85vh; transition: height 0.2s;`;

  const headerHtml = `
    <div style="padding:12px 16px; border-bottom:0.5px solid rgba(0,0,0,0.1); display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.5); flex-shrink:0;">
        <span style="font-weight:600; font-size:13px; color:#1d1d1f;">UI Inspector</span>
        <div style="display:flex; align-items:center; gap:10px;">
            <button id="btn-reset" style="border:none; background:none; cursor:pointer; font-size:14px; color:#1d1d1f; opacity:0.7;" title="重置">↺</button>
            <button id="btn-settings" style="border:none; background:none; cursor:pointer; font-size:14px; color:#1d1d1f; opacity:0.7;" title="设置">⚙️</button>
            <button id="btn-close-panel" style="border:none; background:none; cursor:pointer; font-size:16px; color:#1d1d1f; opacity:0.7;" title="关闭">✕</button>
        </div>
    </div>`;

  const controlsHtml = `
    <div style="padding:16px; flex-shrink:0; background:rgba(255,255,255,0.3);">
        <button id="btn-select" style="width:100%; padding:8px; margin-bottom:12px; background:#FFFFFF; border:0.5px solid rgba(0,0,0,0.1); box-shadow: 0 1px 3px rgba(0,0,0,0.05); border-radius:8px; cursor:pointer; font-size:13px; font-weight:500; color:#007AFF; transition:all 0.1s;">选择 DOM 元素</button>
        <div style="font-size:10px; color:#86868b; text-align:center; margin-top:-8px; margin-bottom:12px;">快捷键: [F] 冻结  [空格] 选中  [ESC] 退出</div>
        
        <div style="display:flex; gap:8px; margin-bottom:16px;">
            <input id="input-link" autocomplete="off" placeholder="粘贴 Figma 链接" style="flex:1; padding:8px 10px; border:0.5px solid rgba(0,0,0,0.15); border-radius:8px; font-size:12px; background:rgba(255,255,255,0.8);">
            <button id="btn-fetch-all" style="padding:8px 14px; background:#007AFF; color:white; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:500;">Go</button>
        </div>

        <div id="settings-box" style="display:none; margin-bottom:12px;">
            <input id="input-token" type="password" placeholder="输入 Figma Access Token" style="width:100%; padding:8px; border:0.5px solid rgba(0,0,0,0.15); border-radius:6px; font-size:12px; margin-bottom:6px; box-sizing:border-box;">
            <button id="btn-save-token" style="width:100%; padding:6px; background:#34C759; color:white; border:none; border-radius:6px; font-size:12px; cursor:pointer;">保存 Token</button>
        </div>

        <div id="visual-controls" style="display:none;">
            <div style="display:flex; background:rgba(118,118,128,0.12); padding:2px; border-radius:8px; margin-bottom:16px;">
                <button class="mode-btn active" data-mode="onion" style="flex:1; padding:4px; border:none; background:white; border-radius:6px; font-size:12px; font-weight:500; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.1); color:#1d1d1f;">重叠</button>
                <button class="mode-btn" data-mode="swipe" style="flex:1; padding:4px; border:none; background:transparent; border-radius:6px; font-size:12px; font-weight:500; cursor:pointer; color:#1d1d1f;">扫描</button>
                <button class="mode-btn" data-mode="diff" style="flex:1; padding:4px; border:none; background:transparent; border-radius:6px; font-size:12px; font-weight:500; cursor:pointer; color:#1d1d1f;">差值</button>
            </div>

            <div id="ctrl-opacity-box" style="margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; font-size:11px; color:#86868b; margin-bottom:6px; font-weight:500;"><span>透明度</span><span>%</span></div>
                <input type="range" id="ctrl-opacity" min="0" max="1" step="0.1" value="0.8" style="width:100%; accent-color:#007AFF;">
            </div>
            <div id="ctrl-swipe-box" style="margin-bottom:16px; display:none;">
                <div style="display:flex; justify-content:space-between; font-size:11px; color:#86868b; margin-bottom:6px; font-weight:500;"><span>扫描进度</span><span>%</span></div>
                <input type="range" id="ctrl-swipe" min="0" max="100" value="50" style="width:100%; accent-color:#007AFF;">
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; gap:6px; align-items:center;">
                    <div style="display:flex; gap:1px; background:rgba(118,118,128,0.12); border-radius:6px; padding:2px;">
                        <button class="align-btn" data-align="tl" title="左上对齐">↖</button>
                        <button class="align-btn" data-align="cc" title="居中对齐">•</button>
                        <button class="align-btn" data-align="br" title="右下对齐">↘</button>
                    </div>
                    <div style="display:flex; gap:4px; margin-left:4px;">
                         <input type="number" id="ctrl-x" value="0" placeholder="X" style="width:40px; padding:4px; border:1px solid #E5E5EA; border-radius:4px; font-size:11px; text-align:center;">
                         <input type="number" id="ctrl-y" value="0" placeholder="Y" style="width:40px; padding:4px; border:1px solid #E5E5EA; border-radius:4px; font-size:11px; text-align:center;">
                    </div>
                </div>
                
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:12px; color:#1d1d1f; font-weight:500;">标记</span>
                    <label class="ios-switch">
                        <input type="checkbox" id="chk-show-markers" checked>
                        <span class="ios-slider"></span>
                    </label>
                </div>
            </div>
        </div>
    </div>`;

  const inspectorHtml = `
    <div id="inspector-panel" style="display:none; flex:1; overflow-y:auto; background:white; border-top:1px solid rgba(0,0,0,0.05);">
        <div class="diff-row header">
            <div class="col-label" style="padding-left:16px;">属性</div>
            <div class="col-dom">现成 (DOM)</div>
            <div class="col-figma" style="margin-right:16px;">设计 (Figma)</div>
        </div>
        <div id="diff-results" style="padding: 0 16px 16px 16px;"></div>
    </div>`;

  p.innerHTML = headerHtml + controlsHtml + inspectorHtml;
  document.body.appendChild(p);
  floatingPanel = p;
  bindEvents(p);
  makeDraggable(p);
  
  p.querySelectorAll('.align-btn').forEach(b => {
      b.style.cssText = "border:none; background:transparent; width:20px; height:20px; cursor:pointer; font-size:10px; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#1d1d1f;";
      b.onmouseover = () => b.style.background = 'rgba(255,255,255,0.5)';
      b.onmouseout = () => b.style.background = 'transparent';
  });
}

function bindEvents(p) {
    p.querySelector('#btn-close-panel').onclick = (e) => { e.stopPropagation(); closePanel(); };
    p.querySelector('#btn-reset').onclick = (e) => { e.stopPropagation(); resetPlugin(); };
    p.querySelector('#btn-settings').onclick = () => { const b = p.querySelector('#settings-box'); b.style.display = b.style.display==='none' ? 'block' : 'none'; if(b.style.display==='block') p.querySelector('#input-token').value = figmaToken; };
    p.querySelector('#btn-save-token').onclick = () => { const t = p.querySelector('#input-token').value.trim(); if(t) { chrome.storage.local.set({figma_token: t}); figmaToken = t; alert('Token 已保存'); p.querySelector('#settings-box').style.display='none'; } };
    p.querySelector('#btn-fetch-all').onclick = () => fetchFigmaData(p.querySelector('#input-link').value.trim());
    p.querySelector('#btn-select').onclick = () => toggleSelectMode(true);
    const modeBtns = p.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => btn.onclick = (e) => {
        modeBtns.forEach(b => { b.style.background='transparent'; b.style.boxShadow='none'; b.style.background='transparent'; });
        e.target.style.background = 'white'; e.target.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
        overlayState.mode = e.target.dataset.mode;
        p.querySelector('#ctrl-swipe-box').style.display = overlayState.mode === 'swipe' ? 'block' : 'none';
        p.querySelector('#ctrl-opacity-box').style.display = overlayState.mode === 'swipe' ? 'none' : 'block';
        updateVisualMode();
    });
    p.querySelector('#ctrl-opacity').oninput = (e) => { overlayState.opacity = e.target.value; updateVisualMode(); };
    p.querySelector('#ctrl-swipe').oninput = (e) => { overlayState.swipeX = e.target.value; updateVisualMode(); };
    const updatePos = () => { overlayState.offsetX = parseFloat(p.querySelector('#ctrl-x').value) || 0; overlayState.offsetY = parseFloat(p.querySelector('#ctrl-y').value) || 0; syncOverlayPosition(); };
    p.querySelector('#ctrl-x').oninput = updatePos; p.querySelector('#ctrl-y').oninput = updatePos;
    p.querySelectorAll('.align-btn').forEach(btn => {
        btn.onclick = () => {
            if(!selectedElement || !currentFigmaData) return;
            const rect = selectedElement.getBoundingClientRect();
            const box = currentFigmaData.absoluteBoundingBox;
            const fw = box ? box.width : rect.width; const fh = box ? box.height : rect.height;
            const type = btn.dataset.align;
            if(type === 'tl') { overlayState.offsetX = rect.left; overlayState.offsetY = rect.top; }
            if(type === 'cc') { overlayState.offsetX = rect.left + (rect.width - fw)/2; overlayState.offsetY = rect.top + (rect.height - fh)/2; }
            if(type === 'br') { overlayState.offsetX = rect.right - fw; overlayState.offsetY = rect.bottom - fh; }
            p.querySelector('#ctrl-x').value = Math.round(overlayState.offsetX); p.querySelector('#ctrl-y').value = Math.round(overlayState.offsetY); syncOverlayPosition();
        };
    });
    p.querySelector('#chk-show-markers').onchange = (e) => {
        overlayState.showMarkers = e.target.checked;
        toggleDiffMarkers(e.target.checked);
    };
}

// ==========================================
// 3. 辅助功能 (Select, Freeze, Close)
// ==========================================

function resetPlugin() {
    cleanupVisuals();
    selectedElement = null;
    currentFigmaData = null;
    bugReportData = "";
    diffMarkers = [];
    overlayState = { opacity: 0.8, offsetX: 0, offsetY: 0, scale: 1.0, mode: 'onion', swipeX: 50, showMarkers: true };
    
    const p = floatingPanel;
    if (p) {
        p.querySelector('#input-link').value = '';
        p.querySelector('#btn-select').innerText = '选择 DOM 元素';
        p.querySelector('#btn-select').style.color = '#007AFF';
        p.querySelector('#btn-select').style.background = '#FFFFFF';
        p.querySelector('#btn-fetch-all').innerText = 'Go';
        p.querySelector('#diff-results').innerHTML = '';
        p.querySelector('#inspector-panel').style.display = 'none';
        p.querySelector('#visual-controls').style.display = 'none';
        p.querySelector('#ctrl-x').value = 0;
        p.querySelector('#ctrl-y').value = 0;
    }
}

function closePanel() {
    if (floatingPanel) floatingPanel.style.display = 'none';
    cleanupVisuals();
    toggleSelectMode(false);
}

function toggleSelectMode(val) {
    isSelectMode = val;
    isHoverFrozen = false; 
    document.body.style.cursor = val ? 'crosshair' : 'default';
    const btn = document.getElementById('btn-select');
    
    if(val) {
        document.addEventListener('click', onSelectClick, true);
        document.addEventListener('mousemove', onSelectMove);
        document.addEventListener('keydown', onSelectKeydown, true);
        if(btn) { btn.innerText = '选择中... (按 ESC 退出)'; btn.style.background = '#007AFF'; btn.style.color='white'; }
    } else {
        document.removeEventListener('click', onSelectClick, true);
        document.removeEventListener('mousemove', onSelectMove);
        document.removeEventListener('keydown', onSelectKeydown, true);
        if(hoverBox) { hoverBox.remove(); hoverBox = null; }
        currentHoveredElement = null;
        if(btn) { 
            btn.innerText = selectedElement ? `已选: <${selectedElement.tagName.toLowerCase()}>` : '选择 DOM 元素'; 
            btn.style.background = '#FFFFFF'; btn.style.color='#007AFF';
        }
    }
}

function onSelectMove(e) {
    if(e.target.closest('#diff-checker-panel')) return;
    if(isHoverFrozen) return; 
    currentHoveredElement = e.target;
    updateHoverBox(currentHoveredElement);
}

function onSelectKeydown(e) {
    if(e.key==='Escape') toggleSelectMode(false);
    if (!isSelectMode || !currentHoveredElement) return;

    if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        isHoverFrozen = !isHoverFrozen;
        updateHoverBox(currentHoveredElement); 
        return;
    }

    if (e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        confirmSelection();
        return;
    }

    if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        if (e.shiftKey) { if (currentHoveredElement.parentElement) { currentHoveredElement = currentHoveredElement.parentElement; updateHoverBox(currentHoveredElement); } } 
        else { if (currentHoveredElement.firstElementChild) { currentHoveredElement = currentHoveredElement.firstElementChild; updateHoverBox(currentHoveredElement); } }
    }
}

function updateHoverBox(el) {
    if (!el) return;
    if (!hoverBox) {
        hoverBox = document.createElement('div');
        document.body.appendChild(hoverBox);
    }
    
    const borderColor = isHoverFrozen ? '#FF9500' : '#007AFF'; 
    const bg = isHoverFrozen ? 'rgba(255, 149, 0, 0.1)' : 'rgba(0, 122, 255, 0.06)';
    
    hoverBox.style.cssText = `
        position: fixed; pointer-events: none; z-index: 2147483647; 
        background: ${bg};
        box-shadow: inset 0 0 0 1.5px ${borderColor}, 0 4px 12px rgba(0,0,0,0.1);
        border-radius: 3px; 
        transition: all 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    `;
    
    if (isHoverFrozen) {
         hoverBox.style.boxShadow = 'none';
         hoverBox.style.border = `2px dashed ${borderColor}`;
    }

    const rect = el.getBoundingClientRect();
    hoverBox.style.left = rect.left + 'px'; 
    hoverBox.style.top = rect.top + 'px'; 
    hoverBox.style.width = rect.width + 'px'; 
    hoverBox.style.height = rect.height + 'px';
}

function onSelectClick(e) {
    if(e.target.closest('#diff-checker-panel')) return;
    e.preventDefault(); e.stopPropagation();
    confirmSelection();
}

function confirmSelection() {
    selectedElement = currentHoveredElement;
    toggleSelectMode(false);
    if(currentFigmaData) { alignOverlayToElement(); renderAutoDiff(currentFigmaData); }
}

// ==========================================
// 4. Data & Rendering 
// ==========================================

async function fetchFigmaData(link) {
  if (!figmaToken) { alert('请先设置 Token'); return; }
  const cleanToken = figmaToken.replace(/[^\x21-\x7E]+/g, '');
  const params = parseFigmaLink(link);
  if (!params) { alert('链接无效'); return; }
  const btn = document.getElementById('btn-fetch-all');
  btn.innerText = '加载中...'; btn.disabled = true;
  try {
    const url = `https://api.figma.com/v1/files/${params.fileKey}/nodes?ids=${params.nodeId}&depth=10&geometry=paths`; 
    const res = await fetch(url, { headers: { 'X-Figma-Token': cleanToken } });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    const data = await res.json();
    const key = params.nodeId.replace(/-/g, ':');
    const rootNode = data.nodes[key]?.document;
    if (!rootNode) throw new Error('节点为空');
    loadFonts(rootNode);
    currentFigmaData = rootNode;
    renderFigmaToPage(rootNode);
    if (selectedElement) renderAutoDiff(rootNode);
  } catch (e) { alert(e.message); } finally { btn.innerText = 'Go'; btn.disabled = false; }
}

function parseFigmaLink(link) { try { const url = new URL(link); const pathParts = url.pathname.split('/'); const fileKey = pathParts.find((p, i) => pathParts[i-1] === 'file' || pathParts[i-1] === 'design'); const nodeId = url.searchParams.get('node-id'); return { fileKey, nodeId }; } catch (e) { return null; } }

function loadFonts(root) { const fonts = new Set(); function scan(n) { if(n.type==='TEXT' && n.style?.fontFamily) fonts.add(n.style.fontFamily); n.children?.forEach(scan); } scan(root); if(fonts.size === 0) return; const fontQuery = Array.from(fonts).map(f => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`).join('&'); const link = document.createElement('link'); link.href = `https://fonts.googleapis.com/css2?${fontQuery}&display=swap`; link.rel = 'stylesheet'; document.head.appendChild(link); }

function renderAutoDiff(figmaNode) {
    if (!selectedElement || !figmaNode) return;
    const container = document.getElementById('diff-results');
    if(!container) return;
    container.innerHTML = ''; 
    clearDiffMarkers();
    
    const domStyle = window.getComputedStyle(selectedElement);
    const box = figmaNode.absoluteBoundingBox || {};
    
    addSection(container, '基础布局');
    checkAndMark(container, selectedElement, '宽度', parseFloat(domStyle.width), box.width, 'px');
    checkAndMark(container, selectedElement, '高度', parseFloat(domStyle.height), box.height, 'px');
    const fR = figmaNode.cornerRadius || (figmaNode.rectangleCornerRadii ? figmaNode.rectangleCornerRadii[0] : 0);
    const dR = parseFloat(domStyle.borderRadius) || 0;
    checkAndMark(container, selectedElement, '圆角', dR, fR, 'px');
    
    if(figmaNode.children && figmaNode.children.length > 0) {
        addSection(container, `子元素 (DOM: ${selectedElement.children.length} / Design: ${figmaNode.children.length})`);
        if(selectedElement.children.length !== figmaNode.children.length) {
            addErrorRow(container, '数量', selectedElement.children.length, figmaNode.children.length);
            addDiffMarker(selectedElement, `⚠️ 元素数量不匹配\n现成: ${selectedElement.children.length} 个\n设计: ${figmaNode.children.length} 个`);
        }
        const count = Math.min(selectedElement.children.length, figmaNode.children.length, 5);
        for(let i=0; i<count; i++) {
            const domChild = selectedElement.children[i];
            const figmaChild = figmaNode.children[i];
            const dcStyle = window.getComputedStyle(domChild);
            const fcBox = figmaChild.absoluteBoundingBox || {width:0, height:0};
            const dw = parseFloat(dcStyle.width); const dh = parseFloat(dcStyle.height);
            if(Math.abs(dw - fcBox.width) > 1 || Math.abs(dh - fcBox.height) > 1) {
                const label = `子元素 ${i+1}`;
                const row = document.createElement('div');
                row.className = 'diff-row error';
                row.innerHTML = `<div class="col-label">${label}</div><div class="col-dom">${dw.toFixed(0)}x${dh.toFixed(0)}</div><div class="col-figma">${fcBox.width.toFixed(0)}x${fcBox.height.toFixed(0)}</div>`;
                container.appendChild(row);
                addDiffMarker(domChild, `⚠️ 尺寸不一致\n现成: ${dw.toFixed(0)}x${dh.toFixed(0)}\n设计: ${fcBox.width.toFixed(0)}x${fcBox.height.toFixed(0)}`);
            }
        }
    }
    document.getElementById('inspector-panel').style.display = 'block';
    document.getElementById('visual-controls').style.display = 'block';
}

function checkAndMark(container, element, label, dVal, fVal, unit) {
    if (fVal === undefined || fVal === null) return;
    dVal = Number(dVal); fVal = Number(fVal);
    const isDiff = Math.abs(dVal - fVal) > 1;
    const row = document.createElement('div');
    row.className = `diff-row ${isDiff ? 'error' : ''}`;
    row.innerHTML = `<div class="col-label">${label}</div><div class="col-dom">${dVal.toFixed(1)}${unit}</div><div class="col-figma">${fVal.toFixed(1)}${unit}</div>`;
    container.appendChild(row);
    if(isDiff) { addDiffMarker(element, `⚠️ ${label}不一致\n现成: ${dVal.toFixed(1)}${unit}\n设计: ${fVal.toFixed(1)}${unit}`); }
}

function addSection(container, title) { const div = document.createElement('div'); div.className = 'diff-row section'; div.innerText = title; container.appendChild(div); }
function addErrorRow(container, label, dVal, fVal) { const row = document.createElement('div'); row.className = 'diff-row error'; row.innerHTML = `<div class="col-label">${label}</div><div class="col-dom">${dVal}</div><div class="col-figma">${fVal}</div>`; container.appendChild(row); }

function renderFigmaToPage(rootNode) {
    cleanupVisuals();
    const container = document.createElement('div');
    container.id = 'diff-overlay-container';
    container.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; transition: opacity 0.1s; pointer-events: none;`;
    const rootBox = rootNode.absoluteBoundingBox;
    if (!rootBox) { alert('无法获取尺寸'); return; }
    const domTree = createNode(rootNode, rootBox.x, rootBox.y);
    if (domTree) { domTree.style.left = '0px'; domTree.style.top = '0px'; }
    container.appendChild(domTree);
    document.body.appendChild(container);
    if (selectedElement) alignOverlayToElement();
    else { overlayState.offsetX = (window.innerWidth - rootBox.width) / 2; overlayState.offsetY = (window.innerHeight - rootBox.height) / 2; syncOverlayPosition(); }
    updateVisualMode();
}

function createNode(n, parentAbsX, parentAbsY) {
    if(n.visible === false) return document.createComment('');
    const div = document.createElement('div');
    div.className = 'f-node';
    const box = n.absoluteBoundingBox;
    if (box) { div.style.left = (box.x - parentAbsX) + 'px'; div.style.top = (box.y - parentAbsY) + 'px'; div.style.width = box.width + 'px'; div.style.height = box.height + 'px'; } 
    else { Object.assign(div.style, { left:0, top:0, width:'100%', height:'100%', pointerEvents:'none' }); }
    
    // Zero-Dim Vector Fix
    const isZeroDimVector = (n.type === 'VECTOR' || n.type === 'LINE') && (box && (box.width < 0.01 || box.height < 0.01));
    if (isZeroDimVector) {
        div.style.background = 'transparent'; div.style.border = 'none';
        const s = n.strokes?.find(st => st.visible !== false && st.type === 'SOLID');
        const sCol = s ? safeColor(s.color, s.opacity) : 'transparent';
        const sw = n.strokeWeight || 1; 
        if (box.width < 0.01) { div.style.width = sw + 'px'; div.style.backgroundColor = sCol; div.style.left = (box.x - parentAbsX - sw/2) + 'px'; } 
        else { div.style.height = sw + 'px'; div.style.backgroundColor = sCol; div.style.top = (box.y - parentAbsY - sw/2) + 'px'; }
        return div; 
    }
    // SVG vs Div
    const isAtomicVector = ['VECTOR', 'STAR', 'POLYGON', 'ELLIPSE', 'BOOLEAN_OPERATION'].includes(n.type);
    const hasPaths = (n.fillGeometry?.length > 0) || (n.strokeGeometry?.length > 0);
    if (isAtomicVector && hasPaths) {
        const svg = createSVG(n, box); if(svg) div.appendChild(svg);
        if(n.effects) applyEffects(div, n.effects, true);
        div.style.overflow = 'visible'; return div; 
    } else {
        const fill = parseFills(n.fills);
        if(fill) { if(n.type === 'TEXT') div.style.color = fill; else div.style.background = fill; }
        applyBorders(div, n);
        if(n.rectangleCornerRadii) { const r = n.rectangleCornerRadii; div.style.borderRadius = `${r[0]}px ${r[1]}px ${r[2]}px ${r[3]}px`; } 
        else if(n.cornerRadius) { div.style.borderRadius = n.cornerRadius + 'px'; }
        if(n.effects) applyEffects(div, n.effects, false);
    }
    if(n.clipsContent) div.style.overflow = 'hidden';
    if(n.opacity !== undefined) div.style.opacity = n.opacity;
    if (n.type === 'LINE') {
        div.style.background = 'transparent'; div.style.border = 'none'; div.style.boxShadow = 'none';
        const sw = n.strokeWeight !== undefined ? n.strokeWeight : 1; const s = n.strokes?.[0];
        const sCol = (s && s.type === 'SOLID') ? safeColor(s.color, s.opacity) : '#666';
        if ((box?.width||0) > (box?.height||0)) { div.style.height = sw + 'px'; div.style.backgroundColor = sCol; } 
        else { div.style.width = sw + 'px'; div.style.backgroundColor = sCol; }
    }
    else if (n.type === 'TEXT') {
        const s = n.style; div.classList.add('f-text'); div.innerText = n.characters;
        div.style.fontFamily = `"${s.fontFamily}", sans-serif`; div.style.fontSize = s.fontSize + 'px'; div.style.fontWeight = s.fontWeight; div.style.letterSpacing = (s.letterSpacing||0) + 'px';
        if(s.lineHeightPx) div.style.lineHeight = s.lineHeightPx + 'px';
        if(s.textAlignHorizontal === 'CENTER') div.style.justifyContent = 'center'; else if(s.textAlignHorizontal === 'RIGHT') div.style.justifyContent = 'flex-end';
        if(s.textAlignVertical === 'CENTER') div.style.alignItems = 'center'; else if(s.textAlignVertical === 'BOTTOM') div.style.alignItems = 'flex-end';
        if(n.fills && n.fills.length) div.style.background = 'transparent'; 
    }
    if(n.fills?.some(f=>f.type==='IMAGE')) { div.style.background = '#222 url("data:image/svg+xml;utf8,<svg fill=\'%23666\' viewBox=\'0 0 24 24\' xmlns=\'http://www.w3.org/2000/svg\'><path d=\'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z\'/></svg>") center/30% no-repeat'; }
    if(n.children) n.children.forEach(c => div.appendChild(createNode(c, n.absoluteBoundingBox?.x||parentAbsX, n.absoluteBoundingBox?.y||parentAbsY)));
    return div;
}

function applyBorders(div, n) {
    if(!n.strokes || n.strokes.length === 0) return;
    const s = n.strokes.find(st => st.visible !== false && st.type === 'SOLID');
    if(!s) return;
    const col = safeColor(s.color, s.opacity);
    const hasIndiv = (n.strokeTopWeight > 0 || n.strokeBottomWeight > 0 || n.strokeLeftWeight > 0 || n.strokeRightWeight > 0);
    if (hasIndiv) {
        if(n.strokeTopWeight > 0) div.style.borderTop = `${n.strokeTopWeight}px solid ${col}`;
        if(n.strokeBottomWeight > 0) div.style.borderBottom = `${n.strokeBottomWeight}px solid ${col}`;
        if(n.strokeLeftWeight > 0) div.style.borderLeft = `${n.strokeLeftWeight}px solid ${col}`;
        if(n.strokeRightWeight > 0) div.style.borderRight = `${n.strokeRightWeight}px solid ${col}`;
    } else {
        const w = n.strokeWeight !== undefined ? n.strokeWeight : 0;
        if (w > 0) {
            if (n.strokeAlign === 'INSIDE') div.style.boxShadow = `inset 0 0 0 ${w}px ${col}`;
            else if (n.strokeAlign === 'OUTSIDE') div.style.boxShadow = `0 0 0 ${w}px ${col}`;
            else if (n.strokeAlign === 'CENTER') { const half = w/2; div.style.boxShadow = `inset 0 0 0 ${half}px ${col}, 0 0 0 ${half}px ${col}`; } 
            else div.style.boxShadow = `inset 0 0 0 ${w}px ${col}`;
        }
    }
}
function applyEffects(div, effects, isSVG) {
    const ef = parseEffects(effects);
    if(isSVG) { if(ef.shadowCss) div.style.filter = `drop-shadow(${ef.shadowCss})`; } 
    else { const current = div.style.boxShadow; div.style.boxShadow = current ? `${current}, ${ef.shadowCss}` : ef.shadowCss; if(ef.blur) div.style.filter = ef.blur; if(ef.backdrop) div.style.backdropFilter = ef.backdrop; }
}
function createSVG(n, box) {
    if(!box) return null;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const vw = Math.max(box.width, 0.1); const vh = Math.max(box.height, 0.1);
    svg.setAttribute("viewBox", `0 0 ${vw} ${vh}`); svg.setAttribute("shape-rendering", "geometricPrecision"); svg.setAttribute("width", "100%"); svg.setAttribute("height", "100%"); svg.classList.add('f-svg-wrap');
    if(n.relativeTransform) { const m = n.relativeTransform; const angle = Math.atan2(m[1][0], m[0][0]); if (Math.abs(angle) > 0.01) { svg.setAttribute("transform", `rotate(${angle * (180/Math.PI)} ${vw/2} ${vh/2})`); } }
    if(n.fillGeometry) { n.fillGeometry.forEach(g => { if(!g.path) return; const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", g.path); const rule = (g.windingRule === 'NONZERO') ? 'nonzero' : 'evenodd'; path.setAttribute("fill-rule", rule); const validFill = n.fills?.find(f => f.visible!==false && f.type==='SOLID'); path.setAttribute("fill", validFill ? safeColor(validFill.color, validFill.opacity) : "transparent"); svg.appendChild(path); }); }
    if(n.strokeGeometry) { const s = n.strokes?.find(st => st.visible!==false && st.type==='SOLID'); if(s) { const sCol = safeColor(s.color, s.opacity); const w = n.strokeWeight !== undefined ? n.strokeWeight : 1; n.strokeGeometry.forEach(g => { if(!g.path) return; const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", g.path); path.setAttribute("stroke", sCol); path.setAttribute("stroke-width", w); path.setAttribute("fill", "none"); if(n.strokeCap) path.setAttribute("stroke-linecap", n.strokeCap === 'ROUND' ? 'round' : 'square'); svg.appendChild(path); }); } }
    return svg;
}
function rgb(v){ return Math.round((v||0)*255); }
function safeColor(c, op) { if(!c) return 'transparent'; const a = (op !== undefined ? op : 1) * (c.a !== undefined ? c.a : 1); return `rgba(${rgb(c.r)},${rgb(c.g)},${rgb(c.b)},${a.toFixed(2)})`; }
function parseFills(fills) { if(!fills?.length) return null; const layers = fills.filter(f => f.visible !== false).map(f => { if(f.type === 'SOLID') return safeColor(f.color, f.opacity); if(f.type === 'GRADIENT_LINEAR') return parseGradient(f); return null; }).filter(Boolean); return layers.length ? layers.join(',') : null; }
function parseGradient(f) { try { const s = f.gradientStops; if(!s || s.length < 2) return null; const c1 = safeColor(s[0].color); const c2 = safeColor(s[s.length-1].color); return `linear-gradient(180deg, ${c1}, ${c2})`; } catch(e) { return null; } }
function parseEffects(fx) { const res = {shadowCss:'', blur:'', backdrop:''}; if(!fx) return res; const sh = []; fx.forEach(e=>{ if(e.visible===false)return; try { if(e.type==='DROP_SHADOW') { const c = safeColor(e.color); sh.push(`${e.offset.x}px ${e.offset.y}px ${e.radius}px ${c}`); } else if(e.type==='LAYER_BLUR') res.blur=`blur(${e.radius}px)`; else if(e.type==='BACKGROUND_BLUR') res.backdrop=`blur(${e.radius}px)`; } catch(err){} }); if(sh.length) res.shadowCss=sh.join(','); return res; }
function cleanupVisuals() { document.getElementById('diff-overlay-container')?.remove(); document.getElementById('swipe-handle')?.remove(); clearDiffMarkers(); if (hoverBox) { hoverBox.remove(); hoverBox = null; } }
function syncOverlayPosition() { const c = document.getElementById('diff-overlay-container'); if(c) c.style.transform = `translate(${overlayState.offsetX}px, ${overlayState.offsetY}px) scale(${overlayState.scale})`; }
function updateVisualMode() { 
    const c = document.getElementById('diff-overlay-container'); if(!c) return;
    c.style.clipPath = 'none'; c.style.mixBlendMode = 'normal'; c.style.opacity = overlayState.opacity;
    document.getElementById('swipe-handle')?.remove();
    if(overlayState.mode === 'diff') c.style.mixBlendMode = 'difference';
    if(overlayState.mode === 'swipe') { c.style.opacity = 1; c.style.clipPath = `polygon(${overlayState.swipeX}% 0, 100% 0, 100% 100%, ${overlayState.swipeX}% 100%)`; renderSwipeLine(overlayState.swipeX); }
}
function renderSwipeLine(x) { let l=document.createElement('div'); l.id='swipe-handle'; l.style.cssText=`position:fixed;top:0;bottom:0;width:2px;background:#FF3B30;z-index:99999;left:${x}%`; document.body.appendChild(l); }
function makeDraggable(el) { const h=el.children[0]; let isDown=false,dx,dy; h.onmousedown=e=>{if(e.target.tagName!=='BUTTON'){isDown=true;dx=e.clientX-el.offsetLeft;dy=e.clientY-el.offsetTop;h.style.cursor='grabbing';}}; document.addEventListener('mousemove',e=>{if(isDown){el.style.left=(e.clientX-dx)+'px';el.style.top=(e.clientY-dy)+'px';}}); document.addEventListener('mouseup',()=>{isDown=false;h.style.cursor='default';}); }
function handleKeyboardShortcuts(e) { if(!currentFigmaData || document.activeElement.tagName === 'INPUT') return; if(e.key.startsWith('Arrow')) { e.preventDefault(); const step = e.shiftKey ? 10 : 1; if(e.key === 'ArrowLeft') overlayState.offsetX -= step; if(e.key === 'ArrowRight') overlayState.offsetX += step; if(e.key === 'ArrowUp') overlayState.offsetY -= step; if(e.key === 'ArrowDown') overlayState.offsetY += step; const cx = document.getElementById('ctrl-x'); const cy = document.getElementById('ctrl-y'); if(cx) cx.value = Math.round(overlayState.offsetX); if(cy) cy.value = Math.round(overlayState.offsetY); syncOverlayPosition(); } }
function alignOverlayToElement() { if (!selectedElement) return; const rect = selectedElement.getBoundingClientRect(); overlayState.offsetX = rect.left; overlayState.offsetY = rect.top; const cx = document.getElementById('ctrl-x'); const cy = document.getElementById('ctrl-y'); if(cx) cx.value = Math.round(rect.left); if(cy) cy.value = Math.round(rect.top); syncOverlayPosition(); }

// [核心修复] Tooltip 智能位置检测 + Z-index 修复
function addDiffMarker(element, message) {
    if(!overlayState.showMarkers) return;
    let existing = diffMarkers.find(m => m.el === element);
    if(existing) { existing.msgs.push(message); existing.tooltip.innerText = existing.msgs.join('\n'); return; }
    
    const rect = element.getBoundingClientRect();
    const marker = document.createElement('div');
    marker.className = 'diff-marker-dot';
    marker.innerText = '!';
    
    const container = document.getElementById('diff-overlay-container');
    if (container) {
        container.appendChild(marker);
        marker.style.position = 'absolute';
        marker.style.left = (rect.right - 9 - overlayState.offsetX) + 'px';
        marker.style.top = (rect.top - 9 - overlayState.offsetY) + 'px';
    } else {
        document.body.appendChild(marker);
        marker.style.left = (rect.right - 9) + 'px';
        marker.style.top = (rect.top - 9) + 'px';
    }
    
    const tooltip = document.createElement('div');
    tooltip.className = 'diff-marker-tooltip';
    
    // 智能检测：如果元素太靠顶部 (例如小于60px)，则让 Tooltip 翻转到下方
    if (rect.top < 60) {
        tooltip.classList.add('position-bottom');
    }
    
    tooltip.innerText = message;
    marker.appendChild(tooltip); // Tooltip is appended after text, so it sits on top in stacking order naturally
    diffMarkers.push({ el: element, dom: marker, msgs: [message], tooltip: tooltip });
}

function clearDiffMarkers() { diffMarkers.forEach(m => m.dom.remove()); diffMarkers = []; }
function toggleDiffMarkers(show) { diffMarkers.forEach(m => m.dom.style.display = show ? 'flex' : 'none'); }