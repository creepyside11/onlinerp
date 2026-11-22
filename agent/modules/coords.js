'use strict';

/**
 * Координаты игрока сверху экрана.
 *
 * Показываем X / Y / Z и высоту над землёй в читаемом виде. Плашка
 * полупрозрачная, чтобы не мешать обзору, и прижата к верху по центру.
 */

const game = require('../core/game');
const theme = require('../ui/theme');
const draw = require('../ui/draw');

const dp = theme.dp;

module.exports = {
  id: 'coords',
  title: 'Координаты',

  state: {
    enabled: false
  },

  controls: [
    { type: 'toggle', key: 'enabled', label: 'Координаты' }
  ],

  drawHud: function (canvas, width) {
    if (!this.state.enabled || !game.isReady()) return;

    const pos = game.playerPosition();
    if (!pos) return;

    const text = 'X ' + pos.x.toFixed(1) +
      '   Y ' + pos.y.toFixed(1) +
      '   Z ' + pos.z.toFixed(1);

    const size = dp(11);
    const padX = dp(12);
    const padY = dp(6);

    const textW = draw.measure(text, size);
    const boxW = textW + padX * 2;
    const boxH = size + padY * 2;
    const x = (width - boxW) / 2;
    const y = dp(10);

    draw.roundRect(canvas, x, y, boxW, boxH, boxH / 2, theme.COLOR.coordsBg);
    draw.text(canvas, text, x + padX, y + boxH / 2 + size * 0.36, size,
      theme.COLOR.text, 'left', true);
  }
};
