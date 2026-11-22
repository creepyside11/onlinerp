'use strict';

/**
 * Спидхак через ускорение игрового времени.
 *
 * CTimer::UpdateVariables(float) — единственная точка, где движок получает
 * длительность кадра. Меняем её на входе, и вся игра (анимации, физика,
 * транспорт) ускоряется согласованно — это выглядит естественно, в отличие
 * от подмены координат.
 *
 * Аргумент приходит в регистре s0. Тонкость: Frida отдаёт `d0` как double,
 * а `s0` как float, поэтому для 32-битного аргумента годится только `s0` —
 * через `d0` прочитались бы восемь байт и получился бы мусор.
 */

const symbols = require('../core/symbols');
const native = require('../core/native');
const log = require('../core/log');

let listener = null;
let unavailable = false;

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

    if (!value) {
      if (listener !== null) {
        listener.detach();
        listener = null;
      }
      log.info('спидхак выключен');
      return;
    }

    if (listener !== null) return;

    try {
      const addr = native.exportOf(symbols.LIB, symbols.FUNC.timerUpdate);
      const self = this;

      listener = Interceptor.attach(addr, {
        onEnter: function () {
          if (!self.state.enabled) return;

          const original = native.readFloatArg(this.context);
          if (original === null) {
            if (!unavailable) {
              unavailable = true;
              log.warn('спидхак: Frida не отдаёт регистр s0, функция недоступна');
            }
            return;
          }

          native.writeFloatArg(
            this.context, original.kind, original.value * self.state.value
          );
        }
      });

      log.info('спидхак включён, множитель ' + self.state.value);
    } catch (e) {
      log.error('спидхак: не удалось включить — ' + e);
      this.state.enabled = false;
    }
  }
};
