'use strict';

/**
 * Лог агента. Пишет в logcat с меткой RakCRMP, чтобы отладка шла через
 * `adb logcat -s RakCRMP`, а не через консоль Frida.
 */

const TAG = 'RakCRMP';
const MAX_LINES = 200;

const lines = [];

function stamp() {
  const d = new Date();
  const p = (n, w) => String(n).padStart(w || 2, '0');
  return (
    p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
    '.' + p(d.getMilliseconds(), 3)
  );
}

function push(level, args) {
  const text = Array.prototype.map.call(args, function (a) {
    if (typeof a === 'string') return a;
    try {
      return JSON.stringify(a);
    } catch (e) {
      return String(a);
    }
  }).join(' ');

  const line = stamp() + ' ' + level + ' ' + text;
  lines.push(line);
  if (lines.length > MAX_LINES) lines.shift();

  try {
    if (level === 'E') console.error(line);
    else if (level === 'W') console.warn(line);
    else console.log(line);
  } catch (e) {
    /* консоль может быть недоступна — не падаем из-за лога */
  }
}

module.exports = {
  TAG: TAG,
  info: function () { push('I', arguments); },
  warn: function () { push('W', arguments); },
  error: function () { push('E', arguments); },
  /** Последние строки — для показа прямо в меню. */
  tail: function (n) { return lines.slice(-(n || 8)); }
};
