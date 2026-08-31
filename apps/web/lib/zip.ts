/**
 * Écriture d'archives ZIP en mode « stocké » (sans compression).
 *
 * Pourquoi pas une dépendance : les fichiers que l'on regroupe sont des JPEG,
 * donc déjà compressés — un `deflate` par-dessus ne gagnerait quasiment rien et
 * ferait entrer une bibliothèque entière pour un seul bouton. Le format stocké
 * tient en une centaine de lignes et produit une archive que tous les systèmes
 * ouvrent nativement.
 *
 * Limites assumées : pas de Zip64, donc archive et fichiers sous 4 Go. Un kit de
 * visuels pèse quelques mégaoctets, la marge est confortable.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Date et heure au format MS-DOS, tel que l'attendent les en-têtes ZIP. */
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipEntry {
  name: string;
  data: Uint8Array<ArrayBuffer>;
}

/**
 * Assemble les entrées en une archive ZIP. Les noms sont encodés en UTF-8 et le
 * drapeau correspondant est posé, pour que les accents d'un nom de fichier
 * français ressortent correctement à l'extraction.
 */
export function makeZip(entries: ZipEntry[], now: Date = new Date()): Blob {
  const { time, date } = dosDateTime(now);
  const encoder = new TextEncoder();
  const locals: Uint8Array<ArrayBuffer>[] = [];
  const centrals: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version minimale
    lv.setUint16(6, 0x0800, true); // drapeau : nom en UTF-8
    lv.setUint16(8, 0, true); // méthode : stocké
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // taille compressée
    lv.setUint32(22, size, true); // taille réelle
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true); // pas de champ « extra »
    local.set(name, 30);
    locals.push(local, entry.data);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version d'écriture
    cv.setUint16(6, 20, true); // version minimale
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // commentaire
    cv.setUint16(34, 0, true); // disque
    cv.setUint16(36, 0, true); // attributs internes
    cv.setUint32(38, 0, true); // attributs externes
    cv.setUint32(42, offset, true); // position de l'en-tête local
    central.set(name, 46);
    centrals.push(central);

    offset += local.length + size;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true); // numéro de disque
  ev.setUint16(6, 0, true); // disque du répertoire central
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true); // commentaire d'archive

  return new Blob([...locals, ...centrals, end], { type: "application/zip" });
}
