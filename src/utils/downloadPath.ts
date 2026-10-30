import { sep } from '@tauri-apps/api/path';

/** 云端名称只能作为一个本地文件名，不能被解释为路径或 Windows 设备名。 */
export function assertDownloadName(name: string) {
  const windows = sep() === '\\';
  const invalid =
    !name ||
    name === '.' ||
    name === '..' ||
    /[\0/]/.test(name) ||
    (windows &&
      (/[<>:"\\|?*\x00-\x1f]/.test(name) ||
        /[ .]$/.test(name) ||
        /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(name)));
  if (invalid) throw new Error(`文件名不支持保存到本地：${name}`);
}
