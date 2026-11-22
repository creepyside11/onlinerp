'use strict';

/**
 * Точка входа агента RakCRMP.
 *
 * Порядок важен: сначала ждём Activity (иначе некуда вешать меню), затем
 * ждём libGame.so (иначе нечего показывать), и только потом запускаем цикл
 * опроса игры. Всё обёрнуто в try/catch: падение агента не должно ронять
 * игру, а должно оставлять запись в logcat.
 */

const log = require('./core/log');
const game = require('./core/game');
const overlay = require('./ui/overlay');

const modules = [
  require('./modules/godmode'),
  require('./modules/speedhack'),
  require('./modules/teleport'),
  require('./modules/vehicle'),
  require('./modules/esp'),
  require('./modules/coords')
];

const model = { modules: modules };

let attached = false;
let ticking = false;

/** Повесить меню на Activity. Повторные вызовы игнорируются. */
function onActivity(activity) {
  if (attached || activity === null) return;
  attached = true;
  try {
    overlay.attach(activity, model);
    log.info('меню привязано к ' + activity.getClass().getName());
  } catch (e) {
    attached = false;
    log.error('attach: ' + e);
  }
}

/**
 * Ловим Activity несколькими способами. Приложение может переопределять
 * onResume и не звать базовый метод, поэтому одного хука мало.
 */
function hookActivity() {
  let hooked = false;

  try {
    const Activity = Java.use('android.app.Activity');
    Activity.onResume.implementation = function () {
      this.onResume();
      onActivity(this);
    };
    hooked = true;
  } catch (e) {
    log.warn('хук Activity.onResume: ' + e);
  }

  try {
    const Instrumentation = Java.use('android.app.Instrumentation');
    Instrumentation.callActivityOnResume.implementation = function (activity) {
      this.callActivityOnResume(activity);
      onActivity(activity);
    };
    hooked = true;
  } catch (e) {
    log.warn('хук Instrumentation: ' + e);
  }

  if (!hooked) log.error('не удалось перехватить Activity');
}

/** HUD рисуется до меню, чтобы меню было поверх. */
function composeHud(canvas, width, height) {
  for (let i = 0; i < modules.length; i++) {
    const m = modules[i];
    if (!m.drawHud) continue;
    try {
      m.drawHud(canvas, width, height);
    } catch (e) {
      log.warn('HUD ' + m.id + ': ' + e);
    }
  }
}

function tick() {
  for (let i = 0; i < modules.length; i++) {
    const m = modules[i];
    if (!m.tick) continue;
    try {
      m.tick();
    } catch (e) {
      log.warn('модуль ' + m.id + ': ' + e);
    }
  }
}

function boot() {
  log.info('RakCRMP стартует');

  overlay.setHudDraw(composeHud);

  Java.perform(function () {
    hookActivity();
  });

  game.waitForEngine(
    function () {
      log.info('игра готова');
      if (ticking) return;
      ticking = true;
      setInterval(tick, 60);
    },
    function (err) {
      log.error('движок: ' + err);
    }
  );
}

try {
  boot();
} catch (e) {
  log.error('boot: ' + e);
}
