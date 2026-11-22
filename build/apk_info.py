#!/usr/bin/env python3
"""Показать имя пакета и версию из APK без Android SDK.

Нужно, чтобы сборка сама сообщала, поверх какого пакета ставится
результат: конфликт «с другим пакетом» при установке возникает именно
из-за несовпадения имени пакета или подписи, и лучше видеть это в логе.

Разбирается настоящий бинарный формат AndroidManifest.xml (AXML), а не
поиск строк: имя пакета — атрибут элемента <manifest>, и угадать его по
пулу строк нельзя (там же лежат имена классов и библиотек).
"""
import struct
import sys
import zipfile

CHUNK_STRING_POOL = 0x0001
CHUNK_START_ELEMENT = 0x0102
TYPE_STRING = 0x03


def parse_string_pool(data, pos):
    """Разобрать пул строк, вернуть (список строк, размер чанка)."""
    header_size = struct.unpack_from("<H", data, pos + 2)[0]
    size = struct.unpack_from("<I", data, pos + 4)[0]
    count = struct.unpack_from("<I", data, pos + 8)[0]
    flags = struct.unpack_from("<I", data, pos + 16)[0]
    strings_start = struct.unpack_from("<I", data, pos + 20)[0]
    utf8 = (flags & 0x100) != 0

    base = pos + strings_start
    offsets = struct.unpack_from("<%dI" % count, data, pos + header_size)

    out = []
    for offset in offsets:
        p = base + offset
        if utf8:
            # u16len (1-2 байта), затем u8len (1-2 байта), затем байты
            n = data[p]
            p += 1
            if n & 0x80:
                p += 1
            length = data[p]
            p += 1
            if length & 0x80:
                length = ((length & 0x7F) << 8) | data[p]
                p += 1
            out.append(data[p:p + length].decode("utf-8", "ignore"))
        else:
            length = struct.unpack_from("<H", data, p)[0]
            p += 2
            if length & 0x8000:
                length = ((length & 0x7FFF) << 16) | struct.unpack_from("<H", data, p)[0]
                p += 2
            out.append(data[p:p + length * 2].decode("utf-16-le", "ignore"))
    return out, size


def parse_manifest(data):
    """Пройти по чанкам и собрать атрибуты элемента <manifest>."""
    strings = []
    pos = 8  # заголовок файла
    total = len(data)

    while pos + 8 <= total:
        chunk_type = struct.unpack_from("<H", data, pos)[0]
        header_size = struct.unpack_from("<H", data, pos + 2)[0]
        size = struct.unpack_from("<I", data, pos + 4)[0]
        if size < 8:
            break

        if chunk_type == CHUNK_STRING_POOL:
            strings, _ = parse_string_pool(data, pos)

        elif chunk_type == CHUNK_START_ELEMENT and strings:
            # Заголовок XML-узла 16 байт, дальше ссылки и таблица атрибутов.
            body = pos + 16
            name_idx = struct.unpack_from("<I", data, body + 4)[0]
            element = strings[name_idx] if name_idx < len(strings) else ""

            if element == "manifest":
                attr_start = struct.unpack_from("<H", data, body + 8)[0]
                attr_size = struct.unpack_from("<H", data, body + 10)[0]
                attr_count = struct.unpack_from("<H", data, body + 12)[0]

                attrs = {}
                for i in range(attr_count):
                    a = body + attr_start + i * attr_size
                    a_name = struct.unpack_from("<I", data, a + 4)[0]
                    raw = struct.unpack_from("<I", data, a + 8)[0]
                    data_type = data[a + 15]
                    value = struct.unpack_from("<I", data, a + 16)[0]

                    key = strings[a_name] if a_name < len(strings) else ""
                    if raw != 0xFFFFFFFF and raw < len(strings):
                        attrs[key] = strings[raw]
                    elif data_type == TYPE_STRING and value < len(strings):
                        attrs[key] = strings[value]
                    else:
                        attrs[key] = value
                return attrs

        pos += size

    return {}


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    path = sys.argv[1]
    with zipfile.ZipFile(path) as archive:
        axml = archive.read("AndroidManifest.xml")

    attrs = parse_manifest(axml)
    package = attrs.get("package", "?")
    version_name = attrs.get("versionName", "?")
    version_code = attrs.get("versionCode", "?")

    print(f"файл    : {path}")
    print(f"пакет   : {package}")
    print(f"версия  : {version_name} (код {version_code})")
    print()
    print("Обновление поверх установленной версии возможно только при")
    print(f"совпадении имени пакета ({package}) И подписи. Иначе — сначала")
    print("удалить старую версию.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
