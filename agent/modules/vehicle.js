'use strict';

/**
 * Транспорт: бессмертие машины и вечный двигатель.
 *
 * Обе функции сделаны через движок, а не через запись чисел в память:
 *   • бессмертие — CVehicle::CanVehicleBeDamaged всегда возвращает «нельзя
 *     повредить», поэтому движок сам не применяет урон;
 *   • вечный двигатель — периодический CVehicle::Fix(), который возвращает
 *     корпус и узлы в исходное состояние.
 *
 * Такой путь устойчивее: он не зависит от смещений полей, которые могут
 * поменяться от версии клиента к версии.
 */

const game = require('../core/game');
const symbols = require('../core/symbols');
const log = require('../core/log');

let damageHook = null;
let lastFix = 0;

function installDamageHook() {
  if (damageHook !== null) return;
  try {
    const addr = Module.getExportByName(symbols.LIB, symbols.FUNC.vehicleCanBeDamaged);
    damageHook = Interceptor.attach(addr, {
      onLeave: function (retval) {
        retval.replace(0);
      }
    });
    log.info('бессмертие авто: урон отключён');
  } catch (e) {
    log.error('бессмертие авто: ' + e);
  }
}

function removeDamageHook() {
  if (damageHook === null) return;
  damageHook.detach();
  damageHook = null;
  log.info('бессмертие авто: урон снова включён');
}

module.exports = {
  id: 'vehicle',
  title: 'Транспорт',

  state: {
    godmode: false,
    engine: false
  },

  controls: [
    { type: 'toggle', key: 'godmode', label: 'Бессмертие авто' },
    { type: 'toggle', key: 'engine', label: 'Вечный двигатель' }
  ],

  onToggle: function (key, value) {
    if (key === 'godmode') {
      if (value) installDamageHook();
      else removeDamageHook();
      return;
    }

    if (key === 'engine') {
      log.info('вечный двигатель: ' + (value ? 'включён' : 'выключен'));
    }
  },

  tick: function () {
    const needFix = this.state.godmode || this.state.engine;
    if (!needFix || !game.isReady()) return;

    const now = Date.now();
    if (now - lastFix < 500) return;
    lastFix = now;

    const veh = game.playerVehicle();
    if (!veh) return;

    try {
      game.raw().vehicleFix(veh);
    } catch (e) {
      log.warn('ремонт машины: ' + e);
    }
  }
};
