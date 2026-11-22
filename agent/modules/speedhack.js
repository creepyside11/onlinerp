'use strict';

/**
 * Спидхак через ускорение игрового времени.
 *
 * CTimer::UpdateVariables(float) — единственная точка, где движок получает
 * длительность кадра. Меняем её на входе, и вся игра (анимации, физика,
 * транспорт) ускоряется согласованно — это выглядит естественно, в отличие
 * от подмены координат.
 *
 * Функция разобрана дезассемблером: она читает s0 и не трогает x0, то есть
 * `this` не используется — хватает одного аргумента.
 */

const symbols = require('../core/symbols');
const log = require('../core/log');

let hooked = false;
let listener = null;
let fallback = false;

function register() {
  // Frida отдаёт регистры контекста по-разному в зависимости от версии и
  // архитектуры, поэтому проверяем, что именно доступно, а не гадаем.
  const ctx = this.context;
  if (typeof ctx.d0 === 'number') return 'd0';
  if (typeof ctx.s0 === 'number') return 's0';
  if (ctx.q0 !== undefined) return 'q0';
  return null;
}

function applyFactor(ctx, kind, value) {
  if (kind === 'd0') { ctx.d0 = value; return true; }
  if (kind === 's0') { ctx.s0 = value; return true; }
  if (kind === 'q0') {
    // q0 — 128-битный регистр, младшие 32 бита это и есть s0
    const f32 = new Float32Array(4);
    f32[0] = value;
    const u8 = new Uint8Array(f32.buffer);
    for (let i = 0; i < 16; i++) {
      ctx.q0[i] = i < 4 ? u8[i] : ctx.q0[i];
    }
    return true;
  }
  return false;
}

module.exports = {
  id: 'speedhack',
  title: 'Спидхак',

  state: {
    enabled: false,
    value: 2
  },

  controls: [
    { type: 'toggle', key: 'enabled', label: 'Спидхак' },
    {
      type: 'slider', key: 'value', label: 'Скорость',
      min: 1, max: 5, step: 0.25,
      format: function (v) { return v.toFixed(2) + 'x'; }
    }
  ],

  onToggle: function (key, value) {
    if (key !== 'enabled') return;
    const self = this;

    if (!value) {
      if (listener !== null) {
        listener.detach();
        listener = null;
      }
      hooked = false;
      log.info('спидхак выключен');
      return;
    }

    if (hooked) return;

    try {
      const addr = Module.getExportByName(symbols.LIB, symbols.FUNC.timerUpdate);
      let kind = null;

      listener = Interceptor.attach(addr, {
        onEnter: function () {
          if (!self.state.enabled) return;
          if (kind === null) kind = register.call(this);
          if (kind === null) {
            if (!fallback) {
              fallback = true;
              log.warn('спидхак: эта сборка Frida не отдаёт float-регистры, ' +
                'функция недоступна');
            }
            return;
          }
          const ctx = this.context;
          const base = kind === 'd0' ? ctx.d0 : (kind === 's0' ? ctx.s0 : 0);
          if (kind !== 'q0') {
            applyFactor(ctx, kind, base * self.state.value);
          }
        }
      });

      hooked = true;
      log.info('спидхак включён, множитель ' + self.state.value);
    } catch (e) {
      log.error('спидхак: не удалось включить — ' + e);
      self.state.enabled = false;
    }
  }
};
