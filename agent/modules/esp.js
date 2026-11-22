'use strict';

/**
 * ESP и BOX.
 *
 * Источник данных — пулы движка (CPools::ms_pPedPool / ms_pVehiclePool).
 * Перебираем индексы и спрашиваем CPools::GetPed / GetVehicle: выход за
 * границы пула безопасен, движок сам вернёт null.
 *
 * Проекция в экран — через сам движок (CalcScreenCoors). Считать матрицу
 * камеры вручную не нужно, и это единственный способ, который не разойдётся
 * с картинкой при смене разрешения.
 */

const game = require('../core/game');
const theme = require('../ui/theme');
const draw = require('../ui/draw');

const dp = theme.dp;

/** Высота рамки в пикселях: ближе — крупнее, но в разумных пределах. */
function boxHeight(dist) {
  const h = 2600 / Math.max(1, dist);
  return Math.max(dp(26), Math.min(dp(150), h));
}

function drawBox(canvas, sx, sy, dist, label) {
  const h = boxHeight(dist);
  const w = h * 0.45;
  const x = sx - w / 2;
  const y = sy - h / 2;

  draw.roundStroke(canvas, x, y, w, h, dp(2), theme.COLOR.espBox, dp(1.4));
  draw.line(canvas, sx - dp(3), sy, sx + dp(3), sy, theme.COLOR.espBox, dp(1));

  if (label) {
    draw.text(canvas, label, sx, y - dp(5), dp(9.5),
      theme.COLOR.espText, 'center', true);
  }
}

module.exports = {
  id: 'esp',
  title: 'ESP',

  state: {
    peds: false,
    vehicles: false,
    box: false
  },

  controls: [
    { type: 'toggle', key: 'peds', label: 'ESP: люди' },
    { type: 'toggle', key: 'vehicles', label: 'ESP: машины' },
    { type: 'toggle', key: 'box', label: 'BOX' }
  ],

  drawHud: function (canvas) {
    const st = this.state;
    if ((!st.peds && !st.vehicles) || !game.isReady()) return;

    const me = game.playerPosition();
    if (!me) return;

    const self = game.player();

    function emit(entity, kind) {
      if (entity.equals(self)) return;
      const pos = game.positionOf(entity);
      if (!pos) return;

      const dist = Math.sqrt(
        (pos.x - me.x) * (pos.x - me.x) +
        (pos.y - me.y) * (pos.y - me.y) +
        (pos.z - me.z) * (pos.z - me.z)
      );
      if (dist > 220) return;

      const scr = game.worldToScreen(pos);
      if (!scr) return;
      if (scr.x < -50 || scr.y < -50) return;

      if (st.box) {
        drawBox(canvas, scr.x, scr.y, dist, kind + ' ' + dist.toFixed(0) + 'м');
      } else {
        draw.circle(canvas, scr.x, scr.y, dp(3.5), theme.COLOR.espBox);
      }
    }

    if (st.peds) {
      game.eachPed(function (ped) { emit(ped, 'P'); });
    }
    if (st.vehicles) {
      game.eachVehicle(function (veh) { emit(veh, 'V'); });
    }
  }
};
