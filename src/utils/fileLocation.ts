import { fileList } from '@/api/file';
import type { FileListRequestParams } from '@/api/types/file';

/** 按目录当前排序寻找目标页，分批读取并复用已经取得的那一页数据。 */
export async function findFilePage(
  params: FileListRequestParams,
  fid: string,
  pageSize: number,
  isCurrent: () => boolean,
) {
  let offset = 0;
  while (isCurrent()) {
    const result = await fileList({ ...params, cur: 1, limit: 1150, offset });
    if (!isCurrent()) return;
    const index = result.data.findIndex((item) => String(item.fid) === fid);
    if (index >= 0) {
      const start = Math.floor((offset + index) / pageSize) * pageSize;
      let pageResult;
      if (
        start >= offset &&
        (start + pageSize <= offset + result.data.length ||
          offset + result.data.length >= Number(result.count))
      ) {
        pageResult = {
          ...result,
          offset: start,
          limit: pageSize,
          data: result.data.slice(start - offset, start - offset + pageSize),
        };
      } else {
        pageResult = await fileList({ ...params, cur: 1, limit: pageSize, offset: start });
        if (!isCurrent()) return;
      }
      if (!pageResult.data.some((item) => String(item.fid) === fid)) break;
      return { page: start / pageSize + 1, result: pageResult };
    }
    offset += result.data.length;
    if (!result.data.length || offset >= Number(result.count)) break;
  }
  if (isCurrent()) throw new Error('文件不在当前文件夹中，请重新搜索');
}
