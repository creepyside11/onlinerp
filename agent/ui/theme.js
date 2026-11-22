'use strict';

/**
 * Оформление меню. Всё в одном месте, чтобы вид правился без правки логики.
 * Размеры задаются в dp и переводятся в пиксели через плотность экрана —
 * иначе на разных телефонах меню будет то крошечным, то огромным.
 */

const COLOR = {
  scrim: '#00000000',
  panel: '#101317F2',
  panelEdge: '#2E353D',
  header: '#171B21',
  row: '#15191E',
  rowPressed: '#1F252C',
  accent: '#E23A3A',
  accentDark: '#A32424',
  accentGlow: '#FF6B6B',
  text: '#F2F4F7',
  textDim: '#98A0AA',
  track: '#2A313A',
  trackOn: '#E23A3A',
  knob: '#FFFFFF',
  shadow: '#00000066',
  espBox: '#E23A3A',
  espText: '#FFFFFF',
  coordsBg: '#101317CC'
};

const METRIC = {
  fabRadius: 30,
  fabMargin: 18,
  fabLabel: 8.5,
  panelWidth: 268,
  panelRadius: 18,
  panelPad: 12,
  headerHeight: 52,
  rowHeight: 42,
  rowGap: 6,
  titleSize: 14,
  itemSize: 13,
  smallSize: 10.5,
  switchW: 40,
  switchH: 22,
  sliderH: 4,
  knobR: 8
};

let density = 3;

function setDensity(d) {
  if (d > 0) density = d;
}

/** dp -> пиксели. */
function dp(v) {
  return v * density;
}

module.exports = {
  COLOR: COLOR,
  METRIC: METRIC,
  setDensity: setDensity,
  dp: dp,
  density: function () { return density; }
};
