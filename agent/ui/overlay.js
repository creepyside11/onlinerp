'use strict';

/**
 * Экранное меню. Это обычный android.view.View, добавленный поверх игры в
 * decor view той же Activity — то есть без разрешения «поверх других
 * приложений» и без правки кода игры.
 *
 * Рисуем сами через Canvas: готовый виджет-набор не подошёл бы, потому что
 * меню должно быть поверх SurfaceView и не отбирать касания у игры, когда
 * палец не на кнопке.
 */

const theme = require('./theme');
const draw = require('./draw');
const log = require('../core/log');

const dp = theme.dp;
const C = theme.COLOR;
const M = theme.METRIC;

const state = {
  open: false,
  fabX: 0,
  fabY: 0,
  placed: false,
  dragging: false,
  dragMoved: false,
  dragOffX: 0,
  dragOffY: 0,
  scroll: 0,
  maxScroll: 0,
  pressId: null,
  pressInside: false,
  sliderId: null,
  pressY: 0
};

let model = { modules: [] };
let hudDraw = null;
let view = null;
let width = 0;
let height = 0;
let fabShader = null;
let fabShaderKey = '';

/** Плоский список строк меню, собранный из модулей. */
function buildRows() {
  const rows = [];
  model.modules.forEach(function (mod) {
    (mod.controls || []).forEach(function (ctrl) {
      rows.push({
        id: mod.id + '.' + ctrl.key,
        module: mod,
        ctrl: ctrl,
        label: ctrl.label,
        kind: ctrl.type
      });
    });
  });
  return rows;
}

function panelGeometry() {
  const margin = dp(10);
  const w = Math.min(dp(M.panelWidth), width - margin * 2);
  const rows = buildRows();

  let contentH = 0;
  rows.forEach(function (r) {
    contentH += dp(M.rowHeight) + dp(M.rowGap);
  });
  contentH += dp(M.panelPad) * 2;

  const headerH = dp(M.headerHeight);
  const maxH = height - margin * 2;
  const totalH = Math.min(headerH + contentH, maxH);

  let x = state.fabX - w + dp(M.fabRadius);
  x = Math.max(margin, Math.min(x, width - w - margin));

  let y = state.fabY + dp(M.fabRadius) + dp(12);
  if (y + totalH > height - margin) {
    y = state.fabY - dp(M.fabRadius) - dp(12) - totalH;
  }
  y = Math.max(margin, y);

  return {
    x: x, y: y, w: w, h: totalH,
    headerH: headerH,
    viewportH: totalH - headerH,
    contentH: contentH,
    rows: rows
  };
}

function hitRect(px, py, x, y, w, h) {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

function drawFab(canvas) {
  const r = dp(M.fabRadius);
  const cx = state.fabX;
  const cy = state.fabY;

  // мягкая тень: два круга с прозрачностью вместо setShadowLayer —
  // он требует программного слоя и роняет частоту кадров
  draw.circle(canvas, cx, cy + dp(2), r + dp(1.5), C.shadow);

  const key = cx + ':' + cy + ':' + r;
  if (key !== fabShaderKey) {
    const LinearGradient = Java.use('android.graphics.LinearGradient');
    const TileMode = Java.use('android.graphics.Shader$TileMode');
    fabShader = LinearGradient.$new(
      cx - r, cy - r, cx + r, cy + r,
      draw.color(C.accentGlow), draw.color(C.accentDark),
      TileMode.CLAMP.value
    );
    fabShaderKey = key;
  }

  const Paint = Java.use('android.graphics.Paint');
  const p = Paint.$new();
  p.setAntiAlias(true);
  p.setShader(fabShader);
  canvas.drawCircle(cx, cy, r, p);

  draw.circleStroke(canvas, cx, cy, r, '#FFFFFF22', dp(1));

  // подпись мелким шрифтом: два ряда, чтобы влезло в круг
  const size = dp(M.fabLabel);
  draw.text(canvas, 'Rak', cx, cy - dp(1), size, C.text, 'center', true);
  draw.text(canvas, 'CRMP', cx, cy + size + dp(1), size, C.text, 'center', true);
}

function drawSwitch(canvas, x, y, on) {
  const w = dp(M.switchW);
  const h = dp(M.switchH);
  const r = h / 2;
  draw.roundRect(canvas, x, y, w, h, r, on ? C.trackOn : C.track);
  const kr = dp(M.knobR);
  const kx = on ? x + w - r : x + r;
  draw.circle(canvas, kx, y + r, kr, C.knob);
}

function drawSlider(canvas, x, y, w, value, min, max) {
  const h = dp(M.sliderH);
  const r = h / 2;
  const t = max > min ? (value - min) / (max - min) : 0;
  const clamped = Math.max(0, Math.min(1, t));

  draw.roundRect(canvas, x, y, w, h, r, C.track);
  draw.roundRect(canvas, x, y, Math.max(h, w * clamped), h, r, C.trackOn);
  draw.circle(canvas, x + w * clamped, y + r, dp(M.knobR), C.knob);
}

function drawPanel(canvas) {
  const g = panelGeometry();
  state.maxScroll = Math.max(0, g.contentH - g.viewportH);
  if (state.scroll > state.maxScroll) state.scroll = state.maxScroll;
  if (state.scroll < 0) state.scroll = 0;

  draw.roundRect(canvas, g.x, g.y, g.w, g.h, dp(M.panelRadius), C.panel);
  draw.roundStroke(canvas, g.x, g.y, g.w, g.h, dp(M.panelRadius), C.panelEdge, dp(1));

  // шапка
  draw.roundRect(canvas, g.x, g.y, g.w, g.headerH, dp(M.panelRadius), C.header);
  draw.roundRect(canvas, g.x, g.y + g.headerH - dp(M.panelRadius), g.w,
    dp(M.panelRadius), 0, C.header);

  draw.text(canvas, 'RakCRMP', g.x + dp(M.panelPad), g.y + g.headerH / 2 + dp(5),
    dp(M.titleSize), C.text, 'left', true);

  const closeX = g.x + g.w - dp(M.panelPad) - dp(9);
  const closeY = g.y + g.headerH / 2;
  draw.line(canvas, closeX - dp(5), closeY - dp(5), closeX + dp(5), closeY + dp(5),
    C.textDim, dp(1.6));
  draw.line(canvas, closeX + dp(5), closeY - dp(5), closeX - dp(5), closeY + dp(5),
    C.textDim, dp(1.6));

  draw.line(canvas, g.x, g.y + g.headerH, g.x + g.w, g.y + g.headerH, C.panelEdge, dp(1));

  canvas.save();
  canvas.clipRect(g.x, g.y + g.headerH, g.x + g.w, g.y + g.h);

  let cy = g.y + g.headerH + dp(M.panelPad) - state.scroll;
  const rowH = dp(M.rowHeight);
  const rowW = g.w - dp(M.panelPad) * 2;
  const rowX = g.x + dp(M.panelPad);

  g.rows.forEach(function (row) {
    if (cy + rowH < g.y + g.headerH - rowH) { cy += rowH + dp(M.rowGap); return; }
    if (cy > g.y + g.h) { cy += rowH + dp(M.rowGap); return; }

    const pressed = state.pressId === row.id && state.pressInside;
    draw.roundRect(canvas, rowX, cy, rowW, rowH, dp(11), pressed ? C.rowPressed : C.row);

    const value = row.module.state[row.ctrl.key];
    const labelSize = dp(M.itemSize);
    const textY = cy + rowH / 2 + dp(4.5);

    if (row.kind === 'toggle') {
      const labelW = rowW - dp(M.switchW) - dp(24);
      draw.text(canvas, draw.ellipsize(row.label, labelW, labelSize),
        rowX + dp(12), textY, labelSize, C.text, 'left', false);
      drawSwitch(canvas, rowX + rowW - dp(M.switchW) - dp(12),
        cy + (rowH - dp(M.switchH)) / 2, !!value);
    } else if (row.kind === 'slider') {
      const min = row.ctrl.min;
      const max = row.ctrl.max;
      const shown = row.ctrl.format ? row.ctrl.format(value) : String(value);
      draw.text(canvas, draw.ellipsize(row.label, rowW * 0.55, labelSize),
        rowX + dp(12), cy + dp(16), labelSize, C.text, 'left', false);
      draw.text(canvas, shown, rowX + rowW - dp(12), cy + dp(16), labelSize,
        C.accentGlow, 'right', true);
      drawSlider(canvas, rowX + dp(12), cy + rowH - dp(16),
        rowW - dp(24), value, min, max);
    } else if (row.kind === 'button') {
      draw.text(canvas, draw.ellipsize(row.label, rowW - dp(24), labelSize),
        rowX + rowW / 2, textY, labelSize, C.accentGlow, 'center', true);
    }

    cy += rowH + dp(M.rowGap);
  });

  canvas.restore();

  // полоса прокрутки, если содержимое не влезло
  if (state.maxScroll > 0) {
    const trackX = g.x + g.w - dp(4);
    const trackY = g.y + g.headerH + dp(4);
    const trackH = g.viewportH - dp(8);
    const barH = Math.max(dp(24), trackH * (g.viewportH / g.contentH));
    const barY = trackY + (trackH - barH) * (state.scroll / state.maxScroll);
    draw.roundRect(canvas, trackX, trackY, dp(2.5), trackH, dp(1.25), '#00000000');
    draw.roundRect(canvas, trackX, barY, dp(2.5), barH, dp(1.25), '#FFFFFF44');
  }
}

function onDraw(canvas) {
  try {
    if (width === 0) {
      width = view.getWidth();
      height = view.getHeight();
      if (!state.placed && width > 0) {
        state.fabX = width - dp(M.fabMargin) - dp(M.fabRadius);
        state.fabY = height * 0.34;
        state.placed = true;
      }
    }

    if (hudDraw) {
      try {
        hudDraw(canvas, width, height);
      } catch (e) {
        log.warn('HUD: ' + e);
      }
    }

    if (state.open) drawPanel(canvas);
    drawFab(canvas);
  } catch (e) {
    log.error('onDraw: ' + e);
  }
}

function setSliderValue(row, localX, rowX, rowW) {
  const trackX = rowX + dp(12);
  const trackW = rowW - dp(24);
  let t = (localX - trackX) / trackW;
  t = Math.max(0, Math.min(1, t));
  const min = row.ctrl.min;
  const max = row.ctrl.max;
  const step = row.ctrl.step || 0;
  let v = min + (max - min) * t;
  if (step > 0) v = Math.round(v / step) * step;
  v = Math.max(min, Math.min(max, v));
  row.module.state[row.ctrl.key] = v;
  if (row.module.onChange) row.module.onChange(row.ctrl.key, v, row.module.state);
}

function onTouch(event) {
  try {
    const action = event.getActionMasked();
    const x = event.getX();
    const y = event.getY();

    if (action === 0) { // ACTION_DOWN
      const fabR = dp(M.fabRadius) + dp(8);
      if ((x - state.fabX) * (x - state.fabX) + (y - state.fabY) * (y - state.fabY) <= fabR * fabR) {
        state.dragging = true;
        state.dragMoved = false;
        state.dragOffX = state.fabX - x;
        state.dragOffY = state.fabY - y;
        return true;
      }

      if (state.open) {
        const g = panelGeometry();
        if (hitRect(x, y, g.x, g.y, g.w, g.h)) {
          // крестик в шапке
          const closeX = g.x + g.w - dp(M.panelPad) - dp(9);
          const closeY = g.y + g.headerH / 2;
          if (Math.abs(x - closeX) < dp(16) && Math.abs(y - closeY) < dp(16)) {
            state.open = false;
            return true;
          }
          if (y < g.y + g.headerH) return true;

          const rowH = dp(M.rowHeight);
          const rowX = g.x + dp(M.panelPad);
          const rowW = g.w - dp(M.panelPad) * 2;
          let cy = g.y + g.headerH + dp(M.panelPad) - state.scroll;

          for (let i = 0; i < g.rows.length; i++) {
            const row = g.rows[i];
            if (hitRect(x, y, rowX, cy, rowW, rowH)) {
              if (row.kind === 'slider') {
                state.sliderId = row.id;
                setSliderValue(row, x, rowX, rowW);
              } else {
                state.pressId = row.id;
                state.pressInside = true;
                state.pressY = y;
              }
              return true;
            }
            cy += rowH + dp(M.rowGap);
          }

          state.pressY = y;
          state.pressId = '__scroll__';
          return true;
        }
        // касание вне меню закрывает его
        state.open = false;
        return true;
      }
      return false;
    }

    if (action === 2) { // ACTION_MOVE
      if (state.dragging) {
        const nx = x + state.dragOffX;
        const ny = y + state.dragOffY;
        if (Math.abs(nx - state.fabX) > dp(2) || Math.abs(ny - state.fabY) > dp(2)) {
          state.dragMoved = true;
        }
        state.fabX = Math.max(dp(M.fabRadius), Math.min(nx, width - dp(M.fabRadius)));
        state.fabY = Math.max(dp(M.fabRadius), Math.min(ny, height - dp(M.fabRadius)));
        return true;
      }

      if (state.sliderId) {
        const g = panelGeometry();
        const rowX = g.x + dp(M.panelPad);
        const rowW = g.w - dp(M.panelPad) * 2;
        for (let i = 0; i < g.rows.length; i++) {
          if (g.rows[i].id === state.sliderId) {
            setSliderValue(g.rows[i], x, rowX, rowW);
            break;
          }
        }
        return true;
      }

      if (state.pressId) {
        if (state.pressId === '__scroll__') {
          const dy = state.pressY - y;
          state.scroll = Math.max(0, Math.min(state.maxScroll, state.scroll + dy));
          state.pressY = y;
        } else {
          const g = panelGeometry();
          const rowX = g.x + dp(M.panelPad);
          const rowW = g.w - dp(M.panelPad) * 2;
          const rowH = dp(M.rowHeight);
          let cy = g.y + g.headerH + dp(M.panelPad) - state.scroll;
          let inside = false;
          for (let i = 0; i < g.rows.length; i++) {
            const row = g.rows[i];
            if (row.id === state.pressId) {
              inside = hitRect(x, y, rowX, cy, rowW, rowH);
              break;
            }
            cy += rowH + dp(M.rowGap);
          }
          state.pressInside = inside;
        }
        return true;
      }
      return false;
    }

    if (action === 1) { // ACTION_UP
      if (state.dragging) {
        state.dragging = false;
        if (!state.dragMoved) state.open = !state.open;
        return true;
      }

      if (state.sliderId) {
        state.sliderId = null;
        return true;
      }

      if (state.pressId) {
        const id = state.pressId;
        const inside = state.pressInside;
        state.pressId = null;
        state.pressInside = false;
        if (id !== '__scroll__' && inside) {
          activate(id);
        }
        return true;
      }
      return state.open;
    }

    if (action === 3) { // ACTION_CANCEL
      state.dragging = false;
      state.pressId = null;
      state.sliderId = null;
      state.pressInside = false;
      return true;
    }

    return false;
  } catch (e) {
    log.error('onTouch: ' + e);
    return false;
  }
}

function activate(id) {
  const rows = buildRows();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.id !== id) continue;
    const mod = row.module;

    if (row.kind === 'toggle') {
      mod.state[row.ctrl.key] = !mod.state[row.ctrl.key];
      if (mod.onToggle) {
        mod.onToggle(row.ctrl.key, mod.state[row.ctrl.key], mod.state);
      }
    } else if (row.kind === 'button') {
      if (mod.onAction) mod.onAction(row.ctrl.key, mod.state);
    }
    return;
  }
}

/** Создать View и повесить его поверх игры. */
function attach(activity, initialModel) {
  model = initialModel;

  const metrics = activity.getResources().getDisplayMetrics();
  theme.setDensity(metrics.density.value);

  const View = Java.use('android.view.View');
  const MotionEvent = Java.use('android.view.MotionEvent');

  const OverlayView = Java.registerClass({
    name: 'com.rakcrmp.Overlay',
    superClass: View,
    methods: {
      onDraw: {
        returnType: 'void',
        argumentTypes: ['android.graphics.Canvas'],
        implementation: function (canvas) {
          onDraw(canvas);
        }
      },
      onTouchEvent: {
        returnType: 'boolean',
        argumentTypes: ['android.view.MotionEvent'],
        implementation: function (event) {
          return onTouch(event);
        }
      }
    }
  });

  Java.scheduleOnMainThread(function () {
    try {
      view = OverlayView.$new(activity);
      view.setClickable(true);
      view.setFocusable(false);

      const decor = activity.getWindow().getDecorView();
      const ViewGroupLayoutParams = Java.use('android.view.ViewGroup$LayoutParams');
      const lp = ViewGroupLayoutParams.$new(-1, -1);

      decor.addView(view, lp);
      view.bringToFront();
      log.info('меню добавлено поверх игры');
    } catch (e) {
      log.error('не удалось добавить меню: ' + e);
    }
  });

  // Перерисовка: игра рисуется сама, а наш View нужно толкать вручную.
  setInterval(function () {
    if (view === null) return;
    Java.scheduleOnMainThread(function () {
      try {
        view.invalidate();
      } catch (e) {
        /* View мог быть откреплён — это не ошибка */
      }
    });
  }, 33);
}

function setHudDraw(fn) {
  hudDraw = fn;
}

module.exports = {
  attach: attach,
  setHudDraw: setHudDraw,
  isOpen: function () { return state.open; }
};
