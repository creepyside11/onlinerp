'use strict';

/**
 * Телепорт. Два источника точки: метка на карте и сохранённое место.
 *
 * Позиция метки берётся из CRadar::ms_RadarTrace — массива блипов движка.
 * Метка игрока в GTA:SA имеет тип BLIP_WAYPOINT (8), по нему и ищем.
 */

const game = require('../core/game');
const log = require('../core/log');

let saved = null;

module.exports = {
  id: 'teleport',
  title: 'Телепорт',

  state: {
    marker: false,
    save: false,
    back: false
  },

  controls: [
    { type: 'button', key: 'marker', label: 'Телепорт по метке' },
    { type: 'button', key: 'save', label: 'Запомнить точку' },
    { type: 'button', key: 'back', label: 'Вернуться' }
  ],

  onAction: function (key) {
    if (!game.isReady()) {
      log.warn('телепорт: движок ещё не готов');
      return;
    }

    const ped = game.player();
    if (!ped) {
      log.warn('телепорт: игрок не найден');
      return;
    }

    if (key === 'save') {
      const pos = game.playerPosition();
      if (!pos) {
        log.warn('телепорт: не удалось прочитать позицию');
        return;
      }
      saved = pos;
      log.info('точка сохранена: ' + pos.x.toFixed(1) + ', ' +
        pos.y.toFixed(1) + ', ' + pos.z.toFixed(1));
      return;
    }

    if (key === 'back') {
      if (!saved) {
        log.warn('телепорт: точка ещё не сохранена');
        return;
      }
      game.teleport(ped, saved.x, saved.y, saved.z + 1);
      log.info('возврат в сохранённую точку');
      return;
    }

    if (key === 'marker') {
      const wp = game.waypoint();
      if (!wp) {
        log.warn('телепорт: метка на карте не найдена');
        return;
      }
      game.teleport(ped, wp.x, wp.y, wp.z + 1);
      log.info('телепорт по метке: ' + wp.x.toFixed(1) + ', ' +
        wp.y.toFixed(1) + ', ' + wp.z.toFixed(1));
    }
  }
};
