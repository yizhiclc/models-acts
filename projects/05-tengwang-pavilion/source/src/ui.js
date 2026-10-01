const icon = (paths, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const icons = {
  pavilion: icon('<path d="M3 9h18M5 15h14M2 21h20M5 9l7-6 7 6M6 15l6-4 6 4M5 21l7-4 7 4M7 10v3m10-3v3M8 16v3m8-3v3"/>'),
  reset: icon('<path d="M4 9a8 8 0 1 1 .8 7M4 4v5h5"/>'),
  orbit: icon('<ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-35 12 12)"/><circle cx="12" cy="12" r="3"/><path d="m18 3 3 1-1 3"/>'),
  pause: icon('<path d="M9 5v14M15 5v14"/>'),
  play: icon('<path d="m8 5 11 7-11 7Z"/>'),
  info: icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>'),
  close: icon('<path d="m6 6 12 12M6 18 18 6"/>'),
  expand: icon('<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>'),
  sun: icon('<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'),
  moon: icon('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>'),
  arrow: icon('<path d="M4 12h15m-5-5 5 5-5 5"/>'),
};

export function createUI(callbacks) {
  document.querySelector('#app').innerHTML = `
    <main id="experience" aria-label="滕王阁三维体素交互场景">
      <div id="scene" role="img" aria-label="黄昏赣江边的滕王阁体素微缩景观，可使用鼠标或触屏旋转、缩放和平移" tabindex="0"></div>
      <div class="vignette" aria-hidden="true"></div>
      <div class="interface" id="interface">
        <header class="masthead">
          <a class="brand" href="#" aria-label="江山入画，返回默认视角">
            <span class="brand-mark">${icons.pavilion}</span>
            <span><strong>江山入画</strong><small>LANDSCAPES IN VOXELS</small></span>
          </a>
          <div class="edition"><span>中国名楼系列</span><i></i><span>壹 · 南昌</span></div>
          <div class="header-actions">
            <button class="notes-button" id="notes-open" aria-expanded="false" aria-controls="notes-panel">${icons.info}<span>建筑手记</span></button>
            <button class="icon-button" id="fullscreen" title="全屏观看" aria-label="全屏观看">${icons.expand}</button>
          </div>
        </header>

        <section class="introduction" aria-label="作品介绍">
          <div class="eyebrow"><span class="red-line"></span>赣江之滨 · 江南胜境</div>
          <h1>滕王阁<span class="seal" aria-label="豫章">豫<br>章</span></h1>
          <p class="english-title">PAVILION OF PRINCE TENG</p>
          <div class="poem"><p>落霞与孤鹜齐飞</p><p>秋水共长天一色</p><span>王勃 ·《滕王阁序》</span></div>
          <div class="scene-caption"><span class="tiny-square"></span><span id="scene-caption">一阁一院，临江而立。</span></div>
        </section>

        <div class="side-note" aria-hidden="true"><span>一砖一瓦 · 一水一天</span><i></i><span>28°41′ N / 115°52′ E</span></div>

        <section class="time-control" aria-label="时辰与环境控制">
          <div class="time-heading"><span id="time-icon">${icons.sun}</span><span id="time-name">日暮</span><span class="time-line"></span><output id="time-value" for="time-range">17:40</output></div>
          <label class="sr-only" for="time-range">时辰，15点至20点</label>
          <input id="time-range" type="range" min="900" max="1200" step="1" value="1060" aria-valuetext="日暮 17:40" />
          <div class="time-labels"><button data-hour="15">日间</button><button data-hour="17.666667">日暮</button><button data-hour="20">入夜</button></div>
        </section>

        <footer class="footer">
          <div class="interaction-hint"><span class="mouse-icon" aria-hidden="true"></span><span class="desktop-hint">拖动旋转<span class="dot">·</span>滚轮缩放<span class="dot">·</span>右键平移</span><span class="mobile-hint">单指旋转 · 双指缩放与平移</span></div>
          <nav class="view-dock" aria-label="观景视角">
            <div class="view-buttons">
              <button data-view="overview" class="view-button active" aria-pressed="true"><span>01</span>全景</button>
              <button data-view="river" class="view-button" aria-pressed="false"><span>02</span>临江</button>
              <button data-view="roof" class="view-button" aria-pressed="false"><span>03</span>飞檐</button>
              <button data-view="garden" class="view-button" aria-pressed="false"><span>04</span>园林</button>
            </div>
            <span class="dock-divider"></span>
            <button class="icon-button" id="orbit" aria-label="环游观景" title="环游观景" aria-pressed="false">${icons.orbit}</button>
            <button class="icon-button" id="reset" aria-label="恢复默认视角" title="恢复默认视角 · R">${icons.reset}</button>
          </nav>
          <div class="footer-actions">
            <button class="icon-button" id="motion" title="暂停环境动画 · 空格" aria-label="暂停环境动画" aria-pressed="false">${icons.pause}</button>
            <button class="clean-button" id="hide-ui" title="收起界面 · H">静观 <span>↗</span></button>
          </div>
        </footer>
        <div class="folio" aria-hidden="true">NO. 001 <span>／</span> 滕王阁</div>
      </div>

      <button id="show-ui" class="show-ui" hidden>返回观景界面 <span>↙</span></button>
      <div class="drawer-backdrop" id="drawer-backdrop" hidden></div>
      <aside class="notes-panel" id="notes-panel" role="dialog" aria-modal="true" aria-labelledby="notes-title" hidden>
        <div class="notes-top"><span>ARCHITECTURAL NOTES</span><button id="notes-close" class="icon-button" aria-label="关闭建筑手记">${icons.close}</button></div>
        <span class="notes-index">壹</span>
        <h2 id="notes-title">层台耸翠<br>上出重霄</h2>
        <p class="notes-intro">以今日南昌滕王阁的仿宋形制为蓝本，在有限方寸里，重拾一座名楼的轮廓与气韵。</p>
        <button class="note-item" data-focus="roof"><span class="note-number">01</span><div><h3>三明七檐</h3><p>三层明楼与暗层交替，六道主楼屋檐加前抱厦，展出舒缓而有力的重檐轮廓。</p></div>${icons.arrow}</button>
        <button class="note-item" data-focus="overview"><span class="note-number">02</span><div><h3>高台翼阁</h3><p>城台般的双层台基托起主阁，回廊连接南北两翼。白石、朱柱、碧瓦各有分寸。</p></div>${icons.arrow}</button>
        <button class="note-item" data-focus="river"><span class="note-number">03</span><div><h3>秋水长天</h3><p>沿岸入江的倒影、光里的一叶归舟，与掠过檐角的孤鹜，共同构成黄昏。</p></div>${icons.arrow}</button>
        <p class="model-note">体素艺术演绎 · 非测绘复原<br>庭院与江岸为围绕诗意构图的缩景设计。</p>
        <div class="notes-bottom"><span>始建于唐永徽四年 · 653</span><span>现阁落成 · 1989</span></div>
      </aside>
      <div class="loading" id="loading" role="status"><div class="loading-symbol">${icons.pavilion}</div><p>叠瓦筑阁，借江入画</p><span></span></div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
      <output id="render-status" class="sr-only" aria-label="场景渲染状态">场景准备中</output>
    </main>`;

  const $ = s => document.querySelector(s);
  let hidden = false, orbiting = false, paused = false, toastTimer;
  let previousFocus;
  function toast(text) {
    clearTimeout(toastTimer);
    $('#toast').textContent = text;
    $('#toast').classList.add('visible');
    toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2400);
  }
  function setView(view) {
    document.querySelectorAll('[data-view]').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
      b.setAttribute('aria-pressed', String(b.dataset.view === view));
    });
    $('#scene-caption').textContent = ({ overview: '一阁一院，临江而立。', river: '一江秋水，半帆归舟。', roof: '碧瓦朱甍，层台叠翠。', garden: '柳岸荷池，曲径入秋。' })[view] || '移步换景，自在观阁。';
  }
  function setOrbit(on) {
    orbiting = on;
    $('#orbit').classList.toggle('selected', on);
    $('#orbit').setAttribute('aria-pressed', String(on));
    $('#orbit').setAttribute('aria-label', on ? '停止环游' : '环游观景');
  }
  function setPaused(on) {
    paused = on;
    $('#motion').innerHTML = on ? icons.play : icons.pause;
    $('#motion').setAttribute('aria-label', on ? '播放环境动画' : '暂停环境动画');
    $('#motion').setAttribute('aria-pressed', String(on));
    $('#motion').title = `${on ? '播放' : '暂停'}环境动画 · 空格`;
  }
  function setHidden(on) {
    hidden = on;
    $('#interface').classList.toggle('hidden', on);
    $('#interface').inert = on;
    $('#show-ui').hidden = !on;
    if (on) { closeNotes(); $('#show-ui').focus({ preventScroll: true }); }
    else $('#hide-ui').focus({ preventScroll: true });
  }
  function openNotes() {
    previousFocus = document.activeElement;
    $('#notes-panel').hidden = false;
    $('#drawer-backdrop').hidden = false;
    $('#notes-open').setAttribute('aria-expanded', 'true');
    $('#interface').inert = true;
    $('#scene').inert = true;
    $('#notes-close').focus({ preventScroll: true });
  }
  function closeNotes() {
    const wasOpen = !$('#notes-panel').hidden;
    $('#notes-panel').hidden = true;
    $('#drawer-backdrop').hidden = true;
    $('#notes-open').setAttribute('aria-expanded', 'false');
    $('#interface').inert = hidden;
    $('#scene').inert = false;
    if (wasOpen && previousFocus && !hidden) previousFocus.focus({ preventScroll: true });
  }
  function reset() { callbacks.reset(); setView('overview'); setOrbit(false); }

  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    callbacks.view(b.dataset.view); setView(b.dataset.view); setOrbit(false);
  }));
  document.querySelectorAll('[data-focus]').forEach(b => b.addEventListener('click', () => {
    closeNotes(); callbacks.view(b.dataset.focus); setView(b.dataset.focus); setOrbit(false);
  }));
  $('#reset').addEventListener('click', reset);
  $('.brand').addEventListener('click', event => { event.preventDefault(); reset(); });
  $('#orbit').addEventListener('click', () => {
    setOrbit(!orbiting); callbacks.orbit(orbiting);
    if (orbiting) { setPaused(false); callbacks.pause(false); toast('环游观景 · 拖动画面即可停下'); }
  });
  $('#motion').addEventListener('click', () => { setPaused(!paused); callbacks.pause(paused); });
  $('#hide-ui').addEventListener('click', () => setHidden(true));
  $('#show-ui').addEventListener('click', () => setHidden(false));
  $('#notes-open').addEventListener('click', openNotes);
  $('#notes-close').addEventListener('click', closeNotes);
  $('#drawer-backdrop').addEventListener('click', closeNotes);
  $('#fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else toast('当前浏览器不支持全屏，可使用“静观”收起界面');
    } catch { toast('当前窗口无法进入全屏，可使用“静观”'); }
  });
  document.addEventListener('fullscreenchange', () => {
    $('#fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '全屏观看');
  });
  $('#time-range').addEventListener('input', event => {
    const hour = Number(event.target.value) / 60;
    const total = Math.round(hour * 60);
    const formatted = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    const name = hour < 16.6 ? '日间' : hour < 18.15 ? '日暮' : hour < 19 ? '薄暮' : '入夜';
    $('#time-value').textContent = formatted;
    $('#time-name').textContent = name;
    $('#time-icon').innerHTML = hour >= 19 ? icons.moon : icons.sun;
    event.target.setAttribute('aria-valuetext', `${name} ${formatted}`);
    document.body.classList.toggle('night', hour > 19.15);
    event.target.style.setProperty('--progress', `${(hour - 15) / 5 * 100}%`);
    callbacks.time(hour);
  });
  document.querySelectorAll('[data-hour]').forEach(button => button.addEventListener('click', () => {
    $('#time-range').value = Math.round(Number(button.dataset.hour) * 60);
    $('#time-range').dispatchEvent(new Event('input', { bubbles: true }));
  }));
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeNotes(); if (hidden) setHidden(false); }
    if (!$('#notes-panel').hidden) {
      if (event.key === 'Tab') {
        const focusable = [...$('#notes-panel').querySelectorAll('button')];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (['INPUT', 'TEXTAREA'].includes(event.target.tagName) || event.target.isContentEditable) return;
    if (event.key.toLowerCase() === 'r') reset();
    if (event.key.toLowerCase() === 'h') setHidden(!hidden);
    if (event.code === 'Space' && !['BUTTON', 'A'].includes(event.target.tagName)) {
      event.preventDefault(); setPaused(!paused); callbacks.pause(paused);
    }
  });
  return {
    container: $('#scene'), toast, setView, setOrbit, setPaused,
    ready(count) {
      $('#loading').classList.add('loaded');
      setTimeout(() => $('#loading')?.remove(), 750);
      $('#render-status').value = `场景已渲染 · ${count.toLocaleString()} 个体素`; 
      $('#render-status').dataset.state = 'ready';
    },
    report(data) { Object.assign($('#render-status').dataset, data); },
    error(error) {
      $('#loading').innerHTML = `<p>暂时无法呈现三维场景</p><small>请使用支持 WebGL 2 的现代浏览器，并开启硬件加速。</small><button onclick="location.reload()">重新加载</button>`;
      $('#render-status').value = '场景渲染失败';
      $('#render-status').dataset.state = 'error';
      console.error(error);
    },
  };
}
