'use strict';

/**
 * Бессмертие игрока.
 *
 * Урон в этой сборке идёт не через экспортированную функцию, поэтому
 * единственный надёжный путь — держать здоровье на максимуме. Смещение
 * поля (ped + 0x6AC) найдено статически: в конструкторе CPed пара float'ов
 * 100.0 пишется одним 64-битным стором, то есть это здоровье и броня.
 *
 * Перед записью значение проверяется: если в поле не похоже на здоровье,
 * модуль не пишет и сообщает об этом один раз. Так ошибка в смещении не
 * превращается в порчу памяти и падение игры.
 */

const game = require('../core/game');
const symbols = require('../core/symbols');
const log = require('../core/log');

let warned = false;

module.exports = {
  id: 'godmode',
  title: 'Бессмертие',

  state: {
    enabled: false
  },

  controls: [
    { type: 'toggle', key: 'enabled', label: 'Бессмертие' }
  ],

  onToggle: function (key, value) {
    if (key === 'enabled') {
      log.info('бессмертие: ' + (value ? 'включено' : 'выключено'));
      warned = false;
    }
  },

  tick: function () {
    if (!this.state.enabled || !game.isReady()) return;

    const ped = game.player();
    if (!ped) return;

    const health = game.playerHealth();
    if (health === null) {
      if (!warned) {
        warned = true;
        log.warn('бессмертие: в ped+' + symbols.OFFSET.pedHealth.toString(16) +
          ' не здоровье — запись отключена');
      }
      return;
    }

    if (health < 100) {
      game.setPlayerHealth(100);
      try {
        ped.add(symbols.OFFSET.pedArmour).writeFloat(100);
      } catch (e) {
        /* броня не критична */
      }
    }
  }
};
