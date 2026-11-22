'use strict';

/**
 * Примитивы рисования поверх Canvas. Держим их отдельно от меню, чтобы
 * раскладка и оформление не смешивались в одном файле.
 */

const theme = require('./theme');

let paint = null;
let rect = null;

function ensure() {
  if (paint !== null) return;
  const Paint = Java.use('android.graphics.Paint');
  const RectF = Java.use('android.graphics.RectF');
  paint = Paint.$new();
  paint.setAntiAlias(true);
  rect = RectF.$new(0, 0, 0, 0);
}

function color(hex) {
  const Color = Java.use('android.graphics.Color');
  return Color.parseColor(hex);
}

/** Заливка скруглённого прямоугольника. */
function roundRect(canvas, x, y, w, h, r, hex) {
  ensure();
  paint.reset();
  paint.setAntiAlias(true);
  paint.setStyle(Java.use('android.graphics.Paint$Style').FILL.value);
  paint.setColor(color(hex));
  rect.set(x, y, x + w, y + h);
  canvas.drawRoundRect(rect, r, r, paint);
}

/** Рамка скруглённого прямоугольника. */
function roundStroke(canvas, x, y, w, h, r, hex, width) {
  ensure();
  paint.reset();
  paint.setAntiAlias(true);
  paint.setStyle(Java.use('android.graphics.Paint$Style').STROKE.value);
  paint.setStrokeWidth(width);
  paint.setColor(color(hex));
  rect.set(x, y, x + w, y + h);
  canvas.drawRoundRect(rect, r, r, paint);
}

function circle(canvas, cx, cy, r, hex) {
  ensure();
  paint.reset();
  paint.setAntiAlias(true);
  paint.setStyle(Java.use('android.graphics.Paint$Style').FILL.value);
  paint.setColor(color(hex));
  canvas.drawCircle(cx, cy, r, paint);
}

function circleStroke(canvas, cx, cy, r, hex, width) {
  ensure();
  paint.reset();
  paint.setAntiAlias(true);
  paint.setStyle(Java.use('android.graphics.Paint$Style').STROKE.value);
  paint.setStrokeWidth(width);
  paint.setColor(color(hex));
  canvas.drawCircle(cx, cy, r, paint);
}

function line(canvas, x1, y1, x2, y2, hex, width) {
  ensure();
  paint.reset();
  paint.setAntiAlias(true);
  paint.setStrokeWidth(width);
  paint.setColor(color(hex));
  canvas.drawLine(x1, y1, x2, y2, paint);
}

/**
 * Текст. `align` — 'left' | 'center' | 'right', `bold` включает жирный.
 * Возвращает ширину нарисованной строки: она нужна для раскладки.
 */
function text(canvas, str, x, y, sizePx, hex, align, bold) {
  ensure();
  paint.reset();
  paint.setAntiAlias(true);
  paint.setColor(color(hex));
  paint.setTextSize(sizePx);
  if (bold) {
    paint.setTypeface(Java.use('android.graphics.Typeface').DEFAULT_BOLD.value);
  } else {
    paint.setTypeface(Java.use('android.graphics.Typeface').DEFAULT.value);
  }

  const Align = Java.use('android.graphics.Paint$Align');
  if (align === 'center') paint.setTextAlign(Align.CENTER.value);
  else if (align === 'right') paint.setTextAlign(Align.RIGHT.value);
  else paint.setTextAlign(Align.LEFT.value);

  canvas.drawText(str, x, y, paint);
  return paint.measureText(str);
}

/** Обрезка строки по ширине с многоточием. */
function ellipsize(str, maxWidth, sizePx) {
  ensure();
  paint.reset();
  paint.setTextSize(sizePx);
  if (paint.measureText(str) <= maxWidth) return str;
  let out = str;
  while (out.length > 1 && paint.measureText(out + '…') > maxWidth) {
    out = out.substring(0, out.length - 1);
  }
  return out + '…';
}

/** Ширина строки без рисования — нужна для раскладки плашек. */
function measure(str, sizePx) {
  ensure();
  paint.reset();
  paint.setTextSize(sizePx);
  return paint.measureText(str);
}

module.exports = {
  measure: measure,
  roundRect: roundRect,
  roundStroke: roundStroke,
  circle: circle,
  circleStroke: circleStroke,
  line: line,
  text: text,
  ellipsize: ellipsize,
  color: color
};
